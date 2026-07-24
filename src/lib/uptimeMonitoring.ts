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
import { normalizeMonitorHost } from './publicUrl';
import { serverEnv } from './serverEnv';
import {
  classifyUptimeRobotError,
  isUptimeRobotConfigured,
  parseCustomUptimeRatios,
  getCachedUptimeRobotAccount,
  urGetAccountDetails,
  urGetAllMonitors,
  urGetAllMonitorsWithRetry,
  urGetMonitors,
  urNewMonitor,
  urResolveCreateContext,
  uptimeQuickStartUrl,
  parseUptimeRobotRetrySeconds,
  normalizeUptimeMonitorUrl,
  uptimeStatusIsDown,
  uptimeStatusLabel,
  UPTIME_MONITOR_STATUS,
  type UptimeRobotAccountDetails,
  type UptimeRobotCreateContext,
  type UptimeRobotMonitor,
} from './uptimerobotClient';

let _platformSyncRunning = false;

export function setUptimePlatformSyncRunning(running: boolean): void {
  _platformSyncRunning = running;
}

export function isUptimePlatformSyncRunning(): boolean {
  return _platformSyncRunning;
}

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

let _suppressedMonitorIds: Set<string> | null = null;
let _suppressedUrlNeedles: string[] | null = null;

function loadUptimeAlertSuppressConfig(): { monitorIds: Set<string>; urlNeedles: string[] } {
  if (_suppressedMonitorIds && _suppressedUrlNeedles) {
    return { monitorIds: _suppressedMonitorIds, urlNeedles: _suppressedUrlNeedles };
  }

  const monitorIds = new Set<string>();
  const rawIds = serverEnv('UPTIMEROBOT_ALERT_SUPPRESS_MONITORS')?.trim();
  if (rawIds) {
    try {
      const parsed = JSON.parse(rawIds) as unknown;
      if (Array.isArray(parsed)) {
        for (const id of parsed) monitorIds.add(String(id).trim());
      } else if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed as Record<string, unknown>)) {
          monitorIds.add(String(key).trim());
        }
      }
    } catch {
      for (const part of rawIds.split(/[,\s]+/)) {
        const id = part.trim();
        if (id) monitorIds.add(id);
      }
    }
  }

  const urlNeedles: string[] = [];
  const rawUrls = serverEnv('UPTIMEROBOT_ALERT_SUPPRESS_URLS')?.trim();
  if (rawUrls) {
    try {
      const parsed = JSON.parse(rawUrls) as unknown;
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          const needle = String(u).trim().toLowerCase();
          if (needle) urlNeedles.push(needle);
        }
      }
    } catch {
      for (const part of rawUrls.split(/[,\s]+/)) {
        const needle = part.trim().toLowerCase();
        if (needle) urlNeedles.push(needle);
      }
    }
  }

  _suppressedMonitorIds = monitorIds;
  _suppressedUrlNeedles = urlNeedles;
  return { monitorIds, urlNeedles };
}

/** Skip push/system alerts for monitors listed in UPTIMEROBOT_ALERT_SUPPRESS_* env. */
export function isUptimeAlertSuppressed(
  monitorId: number | string,
  monitorName?: string | null,
  monitorUrl?: string | null,
): boolean {
  const { monitorIds, urlNeedles } = loadUptimeAlertSuppressConfig();
  if (monitorIds.has(String(monitorId))) return true;

  if (!urlNeedles.length) return false;

  const haystack = [monitorName, monitorUrl, monitorHostKey(monitorUrl)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;
  return urlNeedles.some((needle) => haystack.includes(needle));
}

function monitorHostKey(url: string | null | undefined): string | null {
  return normalizeMonitorHost(url);
}

function portalUrls(portal: ClientPortal | null | undefined): string[] {
  const out: string[] = [];
  const site = portalSiteUrl(portal ?? null);
  if (site) out.push(site);
  const website = portal?.website?.trim();
  if (website) out.push(website);
  return out.map((u) => monitorHostKey(u)).filter(Boolean) as string[];
}

async function resolveClientUidForMonitor(monitorUrl: string | null, monitorId: number): Promise<string | null> {
  const manual = monitorClientMap()[String(monitorId)];
  if (manual) return manual;

  const norm = monitorHostKey(monitorUrl);
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
  if (isUptimeAlertSuppressed(monitor.id, monitor.friendly_name, monitor.url)) return;

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
      tag: `uptime-incident-${incident.id}`,
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

  const api = await urGetAllMonitors({ customUptimeRatios: '7-30' });
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
  /**
   * Fetch full monitor details from UptimeRobot after creating (extra API call).
   * Set false for bulk sync to stay under the 10 req/min free-plan rate limit —
   * the poll scheduler backfills status/ratios shortly after.
   */
  fetchDetails?: boolean;
  /** Reuse across a sync run to avoid redundant API calls and lock a working create strategy. */
  createContext?: UptimeRobotCreateContext;
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

  const created = await urNewMonitor({
    url,
    friendlyName: opts.friendlyName,
    createContext: opts.createContext,
  });
  if (!created.ok) return { ok: false, error: created.error };

  if (opts.fetchDetails !== false) {
    const api = await urGetMonitors({ monitorIds: [created.monitorId], customUptimeRatios: '7-30' });
    if (api.ok && api.monitors[0]) {
      const row = await upsertMonitorFromApi(api.monitors[0]);
      if (row) return { ok: true, monitor: row };
    }
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

/** Import a monitor already created in the UptimeRobot dashboard (no newMonitor API call). */
export async function linkUptimeMonitor(opts: {
  monitorId: number;
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

  const monitorId = Number(opts.monitorId);
  if (!Number.isFinite(monitorId) || monitorId <= 0) {
    return { ok: false, error: 'monitorId must be a positive number' };
  }

  const api = await urGetMonitors({ monitorIds: [monitorId], customUptimeRatios: '7-30' });
  if (!api.ok) return { ok: false, error: api.error };
  const remote = api.monitors[0];
  if (!remote) {
    return {
      ok: false,
      error: `Monitor ${monitorId} not found in UptimeRobot — check the ID in the dashboard`,
    };
  }

  const row = await upsertMonitorFromApi(remote);
  if (!row) return { ok: false, error: 'Monitor found but failed to save locally' };
  return { ok: true, monitor: row };
}

export type UptimePlatformSyncItem = {
  url: string;
  friendlyName: string;
  source: 'kinsta' | 'railway';
  /**
   * One-click UptimeRobot "quick-start" link. Set on manual items when API creation
   * is blocked (free plan) so the UI can offer a single click per site instead of a
   * dashboard walkthrough.
   */
  quickStartUrl?: string;
};

export type UptimePlatformSyncResult = {
  ok: boolean;
  discovered: number;
  created: number;
  skipped: number;
  /** Discovered URLs left un-attempted because the per-run cap was hit. */
  pending: number;
  warnings: string[];
  errors: string[];
  createdItems: UptimePlatformSyncItem[];
  /** Sites API create rejected (plan limits) — add in UptimeRobot dashboard, then Sync status. */
  manualItems: UptimePlatformSyncItem[];
  /** Live UptimeRobot account usage when the API key can read account details. */
  account?: UptimeRobotAccountDetails;
  /** Monitors cached locally in Postgres (may lag behind UptimeRobot). */
  localMonitorCount?: number;
  /** Primary failure reason for API consumers / UI alerts. */
  error?: string;
};

export type UptimePlatformSyncProgress = {
  phase: 'starting' | 'listing' | 'discovering' | 'creating' | 'done';
  discovered: number;
  created: number;
  skipped: number;
  pending: number;
  currentSite?: string;
};

export type SyncPlatformUrlsOptions = {
  /** Process every discovered site with rate-limit backoff (background job). */
  background?: boolean;
  onProgress?: (progress: UptimePlatformSyncProgress) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ~8 creates/min — stays under UptimeRobot free-plan 10 req/min. */
const BACKGROUND_CREATE_GAP_MS = 7500;

function emitProgress(
  onProgress: SyncPlatformUrlsOptions['onProgress'],
  progress: UptimePlatformSyncProgress,
): void {
  onProgress?.(progress);
}

/**
 * Max monitor-creation attempts per interactive sync run. Background jobs ignore
 * this cap and throttle instead. Override via env; 0/blank = default.
 */
function platformSyncMaxPerRun(): number {
  const raw = serverEnv('UPTIMEROBOT_SYNC_MAX_PER_RUN');
  const n = raw == null || raw === '' ? 5 : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.max(1, Math.round(n)), 200);
}

export async function syncPlatformUrlsToUptime(
  opts: SyncPlatformUrlsOptions = {},
): Promise<UptimePlatformSyncResult> {
  const background = opts.background === true;
  const onProgress = opts.onProgress;

  const empty: UptimePlatformSyncResult = {
    ok: false,
    discovered: 0,
    created: 0,
    skipped: 0,
    pending: 0,
    warnings: [],
    errors: [],
    createdItems: [],
    manualItems: [],
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

  emitProgress(onProgress, {
    phase: 'starting',
    discovered: 0,
    created: 0,
    skipped: 0,
    pending: 0,
  });

  const warnings: string[] = [];
  const localRows = await dbListUptimeMonitors();
  const localMonitorCount = localRows?.length ?? 0;

  const kinstaItems: UptimePlatformSyncItem[] = [];
  const railwayItems: UptimePlatformSyncItem[] = [];

  emitProgress(onProgress, {
    phase: 'discovering',
    discovered: 0,
    created: 0,
    skipped: 0,
    pending: 0,
  });

  if (isKinstaConfigured()) {
    const kinsta = await kinstaCollectMonitorUrls();
    if (kinsta.ok) {
      for (const item of kinsta.urls) {
        kinstaItems.push({ ...item, source: 'kinsta' });
      }
    } else {
      warnings.push(`Kinsta: ${kinsta.error}`);
    }
  }

  if (isRailwayConfigured()) {
    const railway = await railwayCollectMonitorUrls();
    if (railway.ok) {
      for (const item of railway.urls) {
        railwayItems.push({ ...item, source: 'railway' });
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

  emitProgress(onProgress, {
    phase: 'listing',
    discovered: 0,
    created: 0,
    skipped: 0,
    pending: 0,
  });

  const existing = new Set<string>();
  for (const row of localRows ?? []) {
    const key = monitorHostKey(row.url);
    if (key) existing.add(key);
  }

  const api = await urGetAllMonitorsWithRetry({
    customUptimeRatios: '7-30',
    includeAlertContacts: true,
  });
  if (api.ok) {
    for (const monitor of api.monitors) {
      const key = monitorHostKey(monitor.url);
      if (key) existing.add(key);
    }
  } else {
    warnings.push(`UptimeRobot monitor list: ${api.error} — using ${existing.size} cached URL(s) from Postgres`);
    if (!existing.size && !kinstaItems.length && !railwayItems.length) {
      return {
        ...empty,
        errors: [`UptimeRobot: ${api.error}`],
        warnings,
        localMonitorCount,
        error: `UptimeRobot: ${api.error}`,
      };
    }
  }

  const accountRes = await urGetAccountDetails();
  const account = accountRes.ok ? accountRes.account : undefined;
  if (!accountRes.ok) {
    warnings.push(`UptimeRobot account details: ${accountRes.error}`);
  }

  const createContext = await urResolveCreateContext({
    accountIntervalSeconds: account?.monitorIntervalSeconds ?? null,
    monitors: api.ok ? api.monitors : [],
  });
  console.info('[uptime-sync] create context', {
    emailContacts: createContext.emailContacts ?? null,
    clonedAlertContacts: createContext.clonedAlertContacts ?? null,
    alertContactTypes: createContext.alertContactTypes ?? [],
    platformSites: kinstaItems.length + railwayItems.length,
    uptimeMonitors: api.ok ? api.monitors.length : existing.size,
  });

  if (!createContext.clonedAlertContacts && !createContext.emailContacts) {
    // Not fatal: monitors are still created without alert contacts (the free-plan
    // "bare" create path) and alerting is delivered via webhooks, not UptimeRobot
    // contacts. Surface a hint so an email contact can be attached later if desired.
    warnings.push(
      'UptimeRobot: no active email alert contact — monitors will be created without one (alerts arrive via webhook). Activate an email contact in UptimeRobot (Integrations → Alert contacts) to attach one.',
    );
  }

  // Interleave sources (Railway first) so the per-run cap doesn't starve one
  // platform — otherwise all Kinsta sites get attempted before any Railway one.
  const candidates: UptimePlatformSyncItem[] = [];
  for (let i = 0; i < Math.max(kinstaItems.length, railwayItems.length); i += 1) {
    if (i < railwayItems.length) candidates.push(railwayItems[i]!);
    if (i < kinstaItems.length) candidates.push(kinstaItems[i]!);
  }

  const seen = new Set<string>();
  const unique: UptimePlatformSyncItem[] = [];
  for (const item of candidates) {
    const key = monitorHostKey(normalizeUptimeMonitorUrl(item.url));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  if (!unique.length) {
    if (isKinstaConfigured() && !kinstaItems.length) {
      warnings.push('Kinsta: no production domains discovered (check API key scope and live environment primary domains)');
    }
    if (isRailwayConfigured() && !railwayItems.length) {
      warnings.push('Railway: no production domains discovered across accessible projects');
    }
    if (!unique.length && (kinstaItems.length || railwayItems.length)) {
      warnings.push('All discovered platform URLs were duplicates or invalid');
    }
  }

  console.info('[uptime-sync] discovered platform urls', {
    kinsta: kinstaItems.length,
    railway: railwayItems.length,
    unique: unique.length,
    existingMonitors: existing.size,
  });

  const maxAttempts = background ? Number.POSITIVE_INFINITY : platformSyncMaxPerRun();
  let created = 0;
  let skipped = 0;
  let attempts = 0;
  let pending = 0;
  let monitorLimited = false;
  let planFeatureNoticed = false;
  // Set once UptimeRobot rejects an API create as a plan restriction (free plan no
  // longer allows /v2/newMonitor). After that, skip the doomed API calls entirely
  // and route every remaining site to the one-click quick-start list instead — no
  // point burning the 10 req/min rate-limit budget on creates that always fail.
  let apiCreateDisabled = false;
  const errors: string[] = [];

  const addManualItem = (item: UptimePlatformSyncItem) => {
    const key = monitorHostKey(item.url);
    if (manualItems.some((m) => monitorHostKey(m.url) === key)) return;
    manualItems.push({ ...item, quickStartUrl: uptimeQuickStartUrl(item.url) });
  };
  const createdItems: UptimePlatformSyncItem[] = [];
  const manualItems: UptimePlatformSyncItem[] = [];

  const noteError = (line: string) => {
    if (!errors.includes(line)) errors.push(line);
  };

  const reportCreating = (currentSite?: string) => {
    emitProgress(onProgress, {
      phase: 'creating',
      discovered: unique.length,
      created,
      skipped,
      pending,
      currentSite,
    });
  };

  reportCreating();

  for (const item of unique) {
    const key = monitorHostKey(normalizeUptimeMonitorUrl(item.url));
    if (key && existing.has(key)) {
      skipped += 1;
      reportCreating();
      continue;
    }

    // Once we know API creates are blocked (free plan), don't attempt them again —
    // just collect the site for the one-click quick-start flow. These are tracked
    // via manualItems (not `pending`, which implies "run again to continue").
    if (apiCreateDisabled) {
      addManualItem(item);
      reportCreating();
      continue;
    }

    let retrySame = true;
    while (retrySame) {
      retrySame = false;

      if (attempts >= maxAttempts || monitorLimited) {
        pending += 1;
        reportCreating();
        break;
      }
      attempts += 1;

      reportCreating(item.friendlyName);

      const result = await createUptimeMonitor({
        url: item.url,
        friendlyName: item.friendlyName,
        fetchDetails: false,
        createContext,
      });
      if (result.ok) {
        created += 1;
        if (key) existing.add(key);
        createdItems.push(item);
        reportCreating();
        if (background) await sleep(BACKGROUND_CREATE_GAP_MS);
        break;
      }

      const err = result.error || 'unknown error';
      const classified = classifyUptimeRobotError(err);
      console.warn('[uptime-sync] create failed', {
        site: item.friendlyName,
        url: item.url,
        kind: classified.kind,
        raw: classified.raw,
      });

      if (classified.kind === 'rate_limit') {
        if (background) {
          const waitSec = parseUptimeRobotRetrySeconds(classified.raw) ?? 60;
          warnings.push(`Rate limited — waiting ${waitSec}s (${item.friendlyName})`);
          reportCreating(item.friendlyName);
          await sleep((waitSec + 2) * 1000);
          attempts -= 1;
          retrySame = true;
          continue;
        }
        pending += 1;
        warnings.push(`${classified.summary} — ${classified.raw}`);
        reportCreating();
        break;
      }

      if (classified.kind === 'monitor_limit') {
        monitorLimited = true;
        pending += 1;
        noteError(`${classified.summary} — ${classified.raw}`);
        reportCreating();
        break;
      }

      if (classified.kind === 'duplicate') {
        skipped += 1;
        if (key) existing.add(key);
        warnings.push(`${item.friendlyName}: ${classified.raw}`);
        reportCreating();
        break;
      }

      if (classified.kind === 'plan_feature') {
        if (createContext.knownStrategy) {
          createContext.knownStrategy = undefined;
          attempts -= 1;
          retrySame = true;
          continue;
        }
        // Free-plan API creates are no longer possible (see classifyUptimeRobotError).
        // Route these to the one-click quick-start list instead of the errors list,
        // and stop attempting API creates for the rest of this run.
        apiCreateDisabled = true;
        attempts -= 1;
        addManualItem(item);
        if (!planFeatureNoticed) {
          planFeatureNoticed = true;
          warnings.push(
            "UptimeRobot's free plan blocks API monitor creation — use the one-click links below to add each site, then Sync status to import them.",
          );
        }
        reportCreating();
        break;
      }

      errors.push(`${item.friendlyName}: ${classified.raw}`);
      reportCreating();
      break;
    }
  }

  if (!background && pending > 0 && warnings.some((w) => /rate limit/i.test(w))) {
    warnings.push(
      `${pending} site${pending === 1 ? '' : 's'} queued — UptimeRobot allows 10 API requests/min on the free plan. Run sync again in a minute to continue.`,
    );
  }
  if (monitorLimited && pending > 0 && account) {
    warnings.push(
      `${pending} site${pending === 1 ? '' : 's'} queued — account is at ${account.monitorCount}/${account.monitorLimit} monitors in UptimeRobot.`,
    );
  }

  const ok = created > 0 || errors.length === 0 || (background && pending > 0);

  emitProgress(onProgress, {
    phase: 'done',
    discovered: unique.length,
    created,
    skipped,
    pending,
  });

  return {
    ok,
    discovered: unique.length,
    created,
    skipped,
    pending,
    warnings,
    errors,
    createdItems,
    manualItems,
    account,
    localMonitorCount,
    error: errors[0],
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

export async function getUptimeAccountView(): Promise<{
  configured: boolean;
  localTotal: number;
  account: UptimeRobotAccountDetails | null;
  error?: string;
}> {
  if (!hasFeature('uptime_monitoring')) {
    return { configured: false, localTotal: 0, account: null };
  }
  if (!isUptimeRobotConfigured()) {
    return { configured: false, localTotal: 0, account: null };
  }

  const local = await dbListUptimeMonitors();
  const localTotal = local?.length ?? 0;

  if (isUptimePlatformSyncRunning()) {
    const cached = getCachedUptimeRobotAccount();
    if (cached) return { configured: true, localTotal, account: cached };
    return { configured: true, localTotal, account: null };
  }

  const api = await urGetAccountDetails();
  if (!api.ok) {
    const cached = getCachedUptimeRobotAccount();
    if (cached) return { configured: true, localTotal, account: cached };
    if (/rate limit|cooldown|retry in/i.test(api.error)) {
      return { configured: true, localTotal, account: null };
    }
    return { configured: true, localTotal, account: null, error: api.error };
  }
  return { configured: true, localTotal, account: api.account };
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
