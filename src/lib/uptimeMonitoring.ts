/**
 * UptimeRobot integration — API sync, webhook handling, client linking, alerts.
 */
import { postToSystemAlertsThread } from './adminAgentAlert';
import { listContacts, type ClientPortal } from './contactApi';
import { hasFeature } from './features';
import { isKinstaConfigured, kinstaCollectMonitorUrls } from './kinstaClient';
import { isRailwayConfigured, railwayCollectMonitorUrls } from './railwayClient';
import {
  dbGetOpenIncident,
  dbGetUptimeMonitor,
  dbInsertUptimeIncident,
  dbListIncidentsForClient,
  dbListMonitorsForClient,
  dbListUptimeIncidents,
  dbListUptimeMonitors,
  dbResolveOpenIncident,
  dbSetMonitorClientUid,
  dbUpsertUptimeMonitor,
  dbUptimeSummary,
  isUptimeDbConfigured,
  type UptimeIncidentRow,
  type UptimeMonitorRow,
  type UptimeSummaryStats,
} from './pgUptime';
import { portalSiteUrl } from './siteMonitoring';
import { serverEnv } from './serverEnv';
import {
  isUptimeRobotConfigured,
  parseCustomUptimeRatios,
  urGetMonitors,
  urNewMonitor,
  normalizeUptimeMonitorUrl,
  uptimeStatusIsDown,
  uptimeStatusLabel,
  UPTIME_MONITOR_STATUS,
  type UptimeRobotMonitor,
} from './uptimerobotClient';

export type UptimeWebhookPayload = {
  monitorID?: string | number;
  monitorURL?: string;
  monitorFriendlyName?: string;
  alertType?: string | number;
  alertTypeFriendlyName?: string;
  alertDetails?: string;
  alertDuration?: string;
  friendlyMessage?: string;
};

function monitorClientMap(): Record<string, string> {
  const raw = serverEnv('UPTIMEROBOT_MONITOR_CLIENT_MAP')?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[String(k)] = v.trim();
    }
    return out;
  } catch {
    console.warn('[uptime] UPTIMEROBOT_MONITOR_CLIENT_MAP is not valid JSON');
    return {};
  }
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  let t = url.trim().toLowerCase();
  t = t.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return t || null;
}

function portalUrls(portal: ClientPortal | null | undefined): string[] {
  const out: string[] = [];
  const site = portalSiteUrl(portal ?? null);
  if (site) out.push(site);
  const website = portal?.website?.trim();
  if (website) out.push(website);
  return out.map((u) => normalizeUrl(u)).filter(Boolean) as string[];
}

async function resolveClientUidForMonitor(monitorUrl: string | null, monitorId: number): Promise<string | null> {
  const manual = monitorClientMap()[String(monitorId)];
  if (manual) return manual;

  const norm = normalizeUrl(monitorUrl);
  if (!norm) return null;

  const listed = await listContacts({ limit: 500 });
  if (!listed.ok) return null;

  for (const c of listed.data.contacts) {
    const portal = (c.links ?? []).find((l) => l.system === 'portal')?.metadata as ClientPortal | undefined;
    for (const pUrl of portalUrls(portal ?? null)) {
      if (pUrl === norm || norm.endsWith(pUrl) || pUrl.endsWith(norm)) {
        return c.uid;
      }
    }
  }
  return null;
}

function parseDurationSeconds(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function alertTypeName(payload: UptimeWebhookPayload): string {
  const friendly = payload.alertTypeFriendlyName?.trim();
  if (friendly) return friendly.toLowerCase();
  const t = String(payload.alertType ?? '').trim();
  if (t === '1') return 'down';
  if (t === '2') return 'up';
  return t || 'unknown';
}

function isDownAlert(payload: UptimeWebhookPayload): boolean {
  const name = alertTypeName(payload);
  return name.includes('down') || name.includes('offline');
}

function isUpAlert(payload: UptimeWebhookPayload): boolean {
  const name = alertTypeName(payload);
  return name.includes('up') || name.includes('online');
}

export function parseUptimeWebhook(body: unknown): UptimeWebhookPayload | null {
  if (!body || typeof body !== 'object') return null;
  return body as UptimeWebhookPayload;
}

async function notifyUptimeAlert(opts: {
  monitor: UptimeMonitorRow;
  incident: UptimeIncidentRow;
  down: boolean;
}): Promise<void> {
  const { monitor, incident, down } = opts;
  const label = monitor.friendly_name || monitor.url || `Monitor ${monitor.id}`;
  const detail = incident.message || (down ? 'Site is down' : 'Site recovered');

  await postToSystemAlertsThread({
    message: [
      down ? 'UptimeRobot: monitor went DOWN.' : 'UptimeRobot: monitor recovered.',
      '',
      `Monitor: ${label}`,
      monitor.url ? `URL: ${monitor.url}` : '',
      `Status: ${uptimeStatusLabel(monitor.status)}`,
      incident.duration_seconds != null ? `Duration: ${incident.duration_seconds}s` : '',
      '',
      detail,
      '',
      down
        ? 'Check hosting, DNS, SSL, and recent deploys. Link a work record if client action is needed.'
        : 'Confirm the site loads and close any open incident ticket.',
    ]
      .filter(Boolean)
      .join('\n'),
    push: {
      title: down ? `DOWN: ${label}` : `UP: ${label}`,
      body: detail.slice(0, 180),
      tag: `uptime-${monitor.id}`,
      url: '/admin?tab=home',
    },
  });
}

async function applyStatusChange(opts: {
  monitorId: number;
  previousStatus: number | null;
  nextStatus: number;
  alertType: string;
  message: string | null;
  source: 'webhook' | 'poll';
  durationSeconds?: number | null;
}): Promise<{ incident: UptimeIncidentRow | null; notified: boolean }> {
  const now = new Date().toISOString();
  const wasDown = opts.previousStatus != null && uptimeStatusIsDown(opts.previousStatus);
  const isDown = uptimeStatusIsDown(opts.nextStatus);

  if (isDown && !wasDown) {
    const incident = await dbInsertUptimeIncident({
      monitor_id: opts.monitorId,
      alert_type: opts.alertType || 'down',
      status_before: opts.previousStatus,
      status_after: opts.nextStatus,
      message: opts.message,
      source: opts.source,
      started_at: now,
    });
    const monitor = await dbGetUptimeMonitor(opts.monitorId);
    if (monitor && incident) {
      await notifyUptimeAlert({ monitor, incident, down: true });
      return { incident, notified: true };
    }
    return { incident, notified: false };
  }

  if (!isDown && wasDown) {
    await dbResolveOpenIncident(opts.monitorId, now, opts.durationSeconds ?? null);
    const incident = await dbInsertUptimeIncident({
      monitor_id: opts.monitorId,
      alert_type: opts.alertType || 'up',
      status_before: opts.previousStatus,
      status_after: opts.nextStatus,
      duration_seconds: opts.durationSeconds ?? null,
      message: opts.message,
      source: opts.source,
      started_at: null,
      resolved_at: now,
    });
    const monitor = await dbGetUptimeMonitor(opts.monitorId);
    if (monitor && incident) {
      await notifyUptimeAlert({ monitor, incident, down: false });
      return { incident, notified: true };
    }
    return { incident, notified: false };
  }

  return { incident: null, notified: false };
}

async function upsertMonitorFromApi(m: UptimeRobotMonitor): Promise<UptimeMonitorRow | null> {
  const ratios = parseCustomUptimeRatios(m.custom_uptime_ratio);
  const clientUid = await resolveClientUidForMonitor(m.url, m.id);
  return dbUpsertUptimeMonitor({
    id: m.id,
    friendly_name: m.friendly_name || m.url || `Monitor ${m.id}`,
    url: m.url ?? null,
    status: m.status,
    uptime_ratio_7d: ratios.d7,
    uptime_ratio_30d: ratios.d30,
    client_uid: clientUid,
  });
}

export async function syncUptimeMonitorsFromApi(): Promise<{
  ok: boolean;
  synced: number;
  error?: string;
}> {
  if (!hasFeature('uptime_monitoring')) {
    return { ok: false, synced: 0, error: 'uptime_monitoring not enabled' };
  }
  if (!isUptimeRobotConfigured()) {
    return { ok: false, synced: 0, error: 'UPTIMEROBOT_API_KEY not configured' };
  }
  if (!isUptimeDbConfigured()) {
    return { ok: false, synced: 0, error: 'DATABASE_URL not configured' };
  }

  const api = await urGetMonitors({ customUptimeRatios: '7-30' });
  if (!api.ok) return { ok: false, synced: 0, error: api.error };

  let synced = 0;
  for (const m of api.monitors) {
    const prev = await dbGetUptimeMonitor(m.id);
    const row = await upsertMonitorFromApi(m);
    if (!row) continue;
    synced += 1;

    if (prev && prev.status !== m.status) {
      await applyStatusChange({
        monitorId: m.id,
        previousStatus: prev.status,
        nextStatus: m.status,
        alertType: uptimeStatusIsDown(m.status) ? 'down' : 'up',
        message: `Status changed via poll (${uptimeStatusLabel(prev.status)} → ${uptimeStatusLabel(m.status)})`,
        source: 'poll',
      });
    }
  }

  return { ok: true, synced };
}

export async function createUptimeMonitor(opts: {
  url: string;
  friendlyName?: string;
}): Promise<{ ok: true; monitor: UptimeMonitorRow } | { ok: false; error: string }> {
  if (!hasFeature('uptime_monitoring')) {
    return { ok: false, error: 'uptime_monitoring not enabled' };
  }
  if (!isUptimeRobotConfigured()) {
    return { ok: false, error: 'UPTIMEROBOT_API_KEY not configured' };
  }
  if (!isUptimeDbConfigured()) {
    return { ok: false, error: 'DATABASE_URL not configured' };
  }

  const url = normalizeUptimeMonitorUrl(opts.url);
  if (!url) return { ok: false, error: 'url is required' };

  const created = await urNewMonitor({ url, friendlyName: opts.friendlyName });
  if (!created.ok) return { ok: false, error: created.error };

  const api = await urGetMonitors({ monitorIds: [created.monitorId], customUptimeRatios: '7-30' });
  if (api.ok && api.monitors[0]) {
    const row = await upsertMonitorFromApi(api.monitors[0]);
    if (row) return { ok: true, monitor: row };
  }

  const clientUid = await resolveClientUidForMonitor(url, created.monitorId);
  const row = await dbUpsertUptimeMonitor({
    id: created.monitorId,
    friendly_name: opts.friendlyName?.trim() || url,
    url,
    status: UPTIME_MONITOR_STATUS.NOT_CHECKED,
    uptime_ratio_7d: null,
    uptime_ratio_30d: null,
    client_uid: clientUid,
  });
  if (!row) return { ok: false, error: 'Monitor created but failed to save locally' };
  return { ok: true, monitor: row };
}

export type UptimePlatformSyncItem = {
  url: string;
  friendlyName: string;
  source: 'kinsta' | 'railway';
};

export type UptimePlatformSyncResult = {
  ok: boolean;
  discovered: number;
  created: number;
  skipped: number;
  warnings: string[];
  errors: string[];
  createdItems: UptimePlatformSyncItem[];
};

export async function syncPlatformUrlsToUptime(): Promise<UptimePlatformSyncResult> {
  const empty: UptimePlatformSyncResult = {
    ok: false,
    discovered: 0,
    created: 0,
    skipped: 0,
    warnings: [],
    errors: [],
    createdItems: [],
  };

  if (!hasFeature('uptime_monitoring')) {
    return { ...empty, errors: ['uptime_monitoring not enabled'] };
  }
  if (!isUptimeRobotConfigured()) {
    return { ...empty, errors: ['UPTIMEROBOT_API_KEY not configured'] };
  }
  if (!isUptimeDbConfigured()) {
    return { ...empty, errors: ['DATABASE_URL not configured'] };
  }

  const existing = new Set<string>();
  const api = await urGetMonitors({ customUptimeRatios: '7-30' });
  if (api.ok) {
    for (const monitor of api.monitors) {
      const key = normalizeUrl(monitor.url);
      if (key) existing.add(key);
    }
  } else {
    return { ...empty, errors: [`UptimeRobot: ${api.error}`] };
  }

  const candidates: UptimePlatformSyncItem[] = [];
  const warnings: string[] = [];

  if (isKinstaConfigured()) {
    const kinsta = await kinstaCollectMonitorUrls();
    if (kinsta.ok) {
      for (const item of kinsta.urls) {
        candidates.push({ ...item, source: 'kinsta' });
      }
    } else {
      warnings.push(`Kinsta: ${kinsta.error}`);
    }
  }

  if (isRailwayConfigured()) {
    const railway = await railwayCollectMonitorUrls();
    if (railway.ok) {
      for (const item of railway.urls) {
        candidates.push({ ...item, source: 'railway' });
      }
      warnings.push(...railway.warnings);
    } else {
      warnings.push(`Railway: ${railway.error}`);
    }
  }

  if (!isKinstaConfigured() && !isRailwayConfigured()) {
    return {
      ...empty,
      errors: ['Neither Kinsta nor Railway is configured on this service'],
    };
  }

  const seen = new Set<string>();
  const unique: UptimePlatformSyncItem[] = [];
  for (const item of candidates) {
    const key = normalizeUrl(normalizeUptimeMonitorUrl(item.url));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdItems: UptimePlatformSyncItem[] = [];

  for (const item of unique) {
    const key = normalizeUrl(normalizeUptimeMonitorUrl(item.url));
    if (key && existing.has(key)) {
      skipped += 1;
      continue;
    }

    const result = await createUptimeMonitor({
      url: item.url,
      friendlyName: item.friendlyName,
    });
    if (result.ok) {
      created += 1;
      if (key) existing.add(key);
      createdItems.push(item);
    } else {
      errors.push(`${item.friendlyName}: ${result.error}`);
    }
  }

  return {
    ok: created > 0 || errors.length === 0,
    discovered: unique.length,
    created,
    skipped,
    warnings,
    errors,
    createdItems,
  };
}

export async function handleUptimeWebhook(payload: UptimeWebhookPayload): Promise<{
  action: 'recorded' | 'synced' | 'ignored';
  monitorId?: number;
  notified?: boolean;
  reason?: string;
}> {
  if (!hasFeature('uptime_monitoring')) {
    return { action: 'ignored', reason: 'uptime_monitoring disabled' };
  }
  if (!isUptimeDbConfigured()) {
    return { action: 'ignored', reason: 'DATABASE_URL not configured' };
  }

  const monitorId = Number(payload.monitorID);
  if (!Number.isFinite(monitorId) || monitorId <= 0) {
    return { action: 'ignored', reason: 'missing monitorID' };
  }

  const prev = await dbGetUptimeMonitor(monitorId);
  let monitor = prev;

  if (isUptimeRobotConfigured()) {
    const api = await urGetMonitors({ monitorIds: [monitorId], customUptimeRatios: '7-30' });
    if (api.ok && api.monitors[0]) {
      monitor = (await upsertMonitorFromApi(api.monitors[0])) ?? prev;
    }
  }

  if (!monitor) {
    const clientUid = await resolveClientUidForMonitor(payload.monitorURL ?? null, monitorId);
    monitor = await dbUpsertUptimeMonitor({
      id: monitorId,
      friendly_name: payload.monitorFriendlyName?.trim() || payload.monitorURL || `Monitor ${monitorId}`,
      url: payload.monitorURL?.trim() || null,
      status: isDownAlert(payload)
        ? UPTIME_MONITOR_STATUS.DOWN
        : isUpAlert(payload)
          ? UPTIME_MONITOR_STATUS.UP
          : UPTIME_MONITOR_STATUS.NOT_CHECKED,
      uptime_ratio_7d: null,
      uptime_ratio_30d: null,
      client_uid: clientUid,
    });
  }

  if (!monitor) return { action: 'ignored', reason: 'could not upsert monitor' };

  const previousStatus = prev?.status ?? monitor.status;
  const nextStatus = isDownAlert(payload)
    ? UPTIME_MONITOR_STATUS.DOWN
    : isUpAlert(payload)
      ? UPTIME_MONITOR_STATUS.UP
      : monitor.status;

  if (nextStatus !== monitor.status) {
    monitor =
      (await dbUpsertUptimeMonitor({
        id: monitor.id,
        friendly_name: monitor.friendly_name,
        url: monitor.url,
        status: nextStatus,
        uptime_ratio_7d: monitor.uptime_ratio_7d,
        uptime_ratio_30d: monitor.uptime_ratio_30d,
        client_uid: monitor.client_uid,
      })) ?? monitor;
  }

  const message =
    payload.friendlyMessage?.trim() ||
    payload.alertDetails?.trim() ||
    `${payload.monitorFriendlyName ?? monitor.friendly_name} — ${alertTypeName(payload)}`;

  const { notified } = await applyStatusChange({
    monitorId,
    previousStatus,
    nextStatus,
    alertType: alertTypeName(payload),
    message,
    source: 'webhook',
    durationSeconds: parseDurationSeconds(payload.alertDuration),
  });

  return { action: 'recorded', monitorId, notified };
}

export async function getUptimeMonitorsView(): Promise<{
  configured: boolean;
  monitors: UptimeMonitorRow[];
}> {
  if (!hasFeature('uptime_monitoring') || !isUptimeDbConfigured()) {
    return { configured: false, monitors: [] };
  }
  return { configured: isUptimeRobotConfigured(), monitors: (await dbListUptimeMonitors()) ?? [] };
}

export async function getUptimeIncidentsView(
  monitorId: number,
  limit?: number,
): Promise<UptimeIncidentRow[]> {
  return (await dbListUptimeIncidents(monitorId, limit)) ?? [];
}

export async function getUptimeSummaryView(): Promise<{
  configured: boolean;
  db: boolean;
  summary: UptimeSummaryStats | null;
}> {
  if (!hasFeature('uptime_monitoring')) {
    return { configured: false, db: false, summary: null };
  }
  return {
    configured: isUptimeRobotConfigured(),
    db: isUptimeDbConfigured(),
    summary: await dbUptimeSummary(),
  };
}

export async function linkMonitorToClient(monitorId: number, clientUid: string | null): Promise<void> {
  await dbSetMonitorClientUid(monitorId, clientUid);
}

export async function getClientUptimeIncidents(clientUid: string) {
  if (!hasFeature('uptime_monitoring') || !isUptimeDbConfigured()) return [];
  return (await dbListIncidentsForClient(clientUid, 15)) ?? [];
}

export async function getClientUptimeView(clientUid: string) {
  if (!hasFeature('uptime_monitoring') || !isUptimeDbConfigured()) {
    return { monitors: [], incidents: [] };
  }
  const [monitors, incidents] = await Promise.all([
    dbListMonitorsForClient(clientUid),
    dbListIncidentsForClient(clientUid, 15),
  ]);
  return { monitors: monitors ?? [], incidents: incidents ?? [] };
}

export function uptimeWebhookSecret(): string | null {
  return serverEnv('UPTIMEROBOT_WEBHOOK_SECRET')?.trim() || null;
}

export function validateUptimeWebhookAuth(opts: {
  queryKey: string | null;
  authHeader: string | null;
}): boolean {
  const expected = uptimeWebhookSecret();
  if (!expected) return false;
  if (opts.queryKey && opts.queryKey === expected) return true;
  const auth = opts.authHeader?.trim();
  if (auth === `Bearer ${expected}`) return true;
  if (auth === expected) return true;
  return false;
}

export async function getOpenIncidentForMonitor(monitorId: number): Promise<UptimeIncidentRow | null> {
  return dbGetOpenIncident(monitorId);
}
