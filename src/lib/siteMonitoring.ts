/**
 * Site change monitoring — syncs ChangeDetection watches to client portal Site URLs,
 * handles deploy-aware alert suppression, and sends push notifications.
 */
import {
  cdCreateWatch,
  cdDeleteWatch,
  cdRecheckWatch,
  cdUpdateWatch,
  changeDetectionNotificationUrl,
  isChangeDetectionConfigured,
} from './changedetectionClient';
import type { ClientPortal } from './contactApi';
import { getDeployStatus } from './deployStatus';
import { hasFeature } from './features';
import { sendPushNotification } from './webPush';
import { serverEnv } from './serverEnv';

export const SITE_URL_FIELD_LABEL = 'Site URL';

export type SiteMonitoringMeta = {
  /** When false, skip watch even if Site URL is set. Default true. */
  enabled?: boolean;
  watchUuid?: string;
  watchUrl?: string;
  updatedAt?: string;
};

function postDeploySuppressMs(): number {
  const min = Number(serverEnv('CHANGEDETECTION_POST_DEPLOY_SUPPRESS_MINUTES') || 20);
  return Math.max(5, Math.min(min, 120)) * 60_000;
}

/** Suppress monitoring alerts until this timestamp (ms). */
let suppressUntil = 0;

export function markDeployActivity(): void {
  suppressUntil = Date.now() + postDeploySuppressMs();
}

export function isMonitoringSuppressed(): boolean {
  return Date.now() < suppressUntil;
}

/** True when a deploy is in flight or we are in the post-deploy grace window. */
export async function shouldSuppressMonitoringAlert(): Promise<boolean> {
  if (isMonitoringSuppressed()) return true;
  const deploy = await getDeployStatus();
  if (!deploy) return false;
  return deploy.state === 'deploying';
}

export function portalSiteUrl(portal: ClientPortal | null | undefined): string | null {
  const fields = portal?.fields ?? [];
  for (const f of fields) {
    if (!f?.label || !f.value) continue;
    if (f.label.trim().toLowerCase() === SITE_URL_FIELD_LABEL.toLowerCase()) {
      const v = f.value.trim();
      return v || null;
    }
  }
  return null;
}

function monitoringEnabled(portal: ClientPortal): boolean {
  return portal.siteMonitoring?.enabled !== false;
}

function normalizeWatchUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/**
 * After portal save: create/update/delete ChangeDetection watch for Site URL.
 * Mutates and returns portal.siteMonitoring for persistence.
 */
export async function syncSiteWatchForPortal(opts: {
  uid: string;
  contactName: string;
  portal: ClientPortal;
  previousPortal: ClientPortal | null;
}): Promise<ClientPortal> {
  if (!hasFeature('site_monitoring') || !isChangeDetectionConfigured()) {
    return opts.portal;
  }

  const { uid, contactName, previousPortal } = opts;
  let portal = { ...opts.portal };
  const siteUrl = portalSiteUrl(portal);
  const prevUrl = portalSiteUrl(previousPortal);
  const prevMeta = previousPortal?.siteMonitoring ?? portal.siteMonitoring ?? {};
  let meta: SiteMonitoringMeta = { ...prevMeta, ...(portal.siteMonitoring ?? {}) };

  const shouldWatch = Boolean(siteUrl && monitoringEnabled(portal));
  const existingUuid = meta.watchUuid?.trim();

  if (!shouldWatch) {
    if (existingUuid) {
      await cdDeleteWatch(existingUuid).catch((e) => {
        console.warn('[site-monitoring] delete watch failed', e);
      });
    }
    portal = {
      ...portal,
      siteMonitoring: {
        enabled: meta.enabled,
        updatedAt: new Date().toISOString(),
      },
    };
    return portal;
  }

  const watchUrl = normalizeWatchUrl(siteUrl!);
  const title = `${contactName} — ${watchUrl}`;
  const tag = `client-${uid.slice(0, 8)}`;

  if (existingUuid && prevUrl && normalizeWatchUrl(prevUrl) === watchUrl) {
    const notify = changeDetectionNotificationUrl(existingUuid);
    await cdUpdateWatch(existingUuid, {
      title,
      paused: false,
      notificationUrls: notify ? [notify] : undefined,
    }).catch((e) => console.warn('[site-monitoring] update watch failed', e));

    portal = {
      ...portal,
      siteMonitoring: {
        ...meta,
        enabled: meta.enabled !== false,
        watchUuid: existingUuid,
        watchUrl,
        updatedAt: new Date().toISOString(),
      },
    };
    return portal;
  }

  if (existingUuid) {
    await cdDeleteWatch(existingUuid).catch(() => undefined);
  }

  const created = await cdCreateWatch({ url: watchUrl, title, tag });
  if (!created.ok) {
    console.warn('[site-monitoring] create watch failed:', created.error);
    return portal;
  }

  const notify = changeDetectionNotificationUrl(created.uuid);
  if (notify) {
    await cdUpdateWatch(created.uuid, { notificationUrls: [notify] }).catch(() => undefined);
  }

  portal = {
    ...portal,
    siteMonitoring: {
      enabled: true,
      watchUuid: created.uuid,
      watchUrl,
      updatedAt: new Date().toISOString(),
    },
  };
  return portal;
}

/** Re-baseline all known watches after deploy (async, non-blocking). */
export async function recheckAllClientWatches(
  portals: Array<{ siteMonitoring?: SiteMonitoringMeta }>,
): Promise<void> {
  if (!hasFeature('site_monitoring') || !isChangeDetectionConfigured()) return;

  const uuids = new Set<string>();
  for (const p of portals) {
    const id = p.siteMonitoring?.watchUuid?.trim();
    if (id) uuids.add(id);
  }

  await Promise.all(
    [...uuids].map((uuid) =>
      cdRecheckWatch(uuid).catch((e) => {
        console.warn('[site-monitoring] recheck failed', uuid, e);
      }),
    ),
  );
}

export type ChangeDetectionWebhookPayload = {
  watchUuid?: string;
  title?: string;
  message?: string;
  url?: string;
};

/** Parse Apprise JSON or plain ChangeDetection webhook bodies. */
export function parseChangeDetectionWebhook(
  body: unknown,
  queryWatch?: string | null,
): ChangeDetectionWebhookPayload {
  const out: ChangeDetectionWebhookPayload = {};
  if (queryWatch?.trim()) out.watchUuid = queryWatch.trim();

  if (!body || typeof body !== 'object') return out;
  const o = body as Record<string, unknown>;

  if (typeof o.watch_uuid === 'string') out.watchUuid = o.watch_uuid;
  if (typeof o.uuid === 'string') out.watchUuid = o.uuid;
  if (typeof o.title === 'string') out.title = o.title;
  if (typeof o.message === 'string') out.message = o.message;
  if (typeof o.body === 'string') out.message = o.body;
  if (typeof o.url === 'string') out.url = o.url;
  if (typeof o.watch_url === 'string') out.url = o.watch_url;

  return out;
}

/** Handle inbound change alert — suppress during deploy, else push. */
export async function handleSiteChangeAlert(payload: ChangeDetectionWebhookPayload): Promise<{
  action: 'suppressed' | 'pushed' | 'ignored';
  reason?: string;
}> {
  if (!hasFeature('site_monitoring')) {
    return { action: 'ignored', reason: 'site_monitoring disabled' };
  }

  if (await shouldSuppressMonitoringAlert()) {
    if (payload.watchUuid) {
      await cdRecheckWatch(payload.watchUuid).catch(() => undefined);
    }
    return { action: 'suppressed', reason: 'deploy in progress or post-deploy window' };
  }

  const title = (payload.title ?? 'Site change detected').slice(0, 120);
  const body = (payload.message ?? payload.url ?? 'A monitored page changed').slice(0, 240);

  await sendPushNotification({
    title,
    body,
    tag: payload.watchUuid ? `watch-${payload.watchUuid}` : 'site-change',
    url: '/admin?tab=clients',
  });

  return { action: 'pushed' };
}
