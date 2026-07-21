/**
 * UptimeRobot REST API client (v2 — form POST with api_key).
 *
 * Docs: https://uptimerobot.com/api/
 */
import { serverEnv } from './serverEnv';

/** UptimeRobot monitor status codes. */
export const UPTIME_MONITOR_STATUS = {
  PAUSED: 0,
  NOT_CHECKED: 1,
  UP: 2,
  SEEMS_DOWN: 8,
  DOWN: 9,
} as const;

export type UptimeMonitorStatus = (typeof UPTIME_MONITOR_STATUS)[keyof typeof UPTIME_MONITOR_STATUS];

/** UptimeRobot alert contact type — 2 = e-mail (safe for free-plan API creates). */
export const UPTIME_ALERT_CONTACT_EMAIL = 2;
/** UptimeRobot alert contact status — 2 = active (0 = not activated, 1 = paused). */
export const UPTIME_ALERT_CONTACT_ACTIVE = 2;

export type UptimeRobotMonitor = {
  id: number;
  friendly_name: string;
  url: string | null;
  status: UptimeMonitorStatus;
  interval?: number;
  all_time_uptime_ratio?: string;
  custom_uptime_ratio?: string;
  average_response_time?: string;
  alert_contacts?: Array<{
    id?: number | string;
    threshold?: number | string;
    recurrence?: number | string;
  }>;
};

export type UptimeRobotMonitorsResult =
  | { ok: true; monitors: UptimeRobotMonitor[] }
  | { ok: false; error: string };

export type UptimeRobotNewMonitorResult =
  | { ok: true; monitorId: number }
  | { ok: false; error: string };

export type UptimeRobotAccountDetails = {
  monitorLimit: number;
  /** up + down + paused (from getAccountDetails). */
  monitorCount: number;
  upMonitors: number;
  downMonitors: number;
  pausedMonitors: number;
  /** Minimum check interval allowed for this account (seconds, from getAccountDetails). */
  monitorIntervalSeconds: number | null;
};

export type UptimeRobotErrorKind =
  | 'rate_limit'
  | 'monitor_limit'
  | 'duplicate'
  | 'plan_feature'
  | 'invalid'
  | 'other';

/** Map raw UptimeRobot API error text to a stable category + user-facing summary. */
export function classifyUptimeRobotError(raw: string): {
  kind: UptimeRobotErrorKind;
  summary: string;
  raw: string;
} {
  const msg = raw.trim() || 'unknown error';
  const lower = msg.toLowerCase();

  if (/rate limit|too many request|\b429\b|retry.?after|req\/min/i.test(lower)) {
    return {
      kind: 'rate_limit',
      summary: 'UptimeRobot rate limit (10 requests/min on the free plan)',
      raw: msg,
    };
  }
  if (
    /monitor limit|maximum.*monitors?|max.*monitors?|monitor_limit|monitors?.*limit|limit.*monitors?|too many monitors?|reached.*monitor/i.test(
      lower,
    )
  ) {
    return {
      kind: 'monitor_limit',
      summary: 'UptimeRobot monitor count limit reached for your plan',
      raw: msg,
    };
  }
  if (/already exist|duplicate|already used|same url|must be unique|unique.*url|url.*unique/i.test(lower)) {
    return {
      kind: 'duplicate',
      summary: 'This URL is already monitored in UptimeRobot',
      raw: msg,
    };
  }
  if (/current plan|not allowed|subscription|not available.*plan|upgrade.*plan|plan does not/i.test(lower)) {
    const settings =
      /not allowed to use some settings/i.test(lower)
        ? 'Monitor settings not allowed on your UptimeRobot plan (often alert-contact threshold/recurrence or an explicit interval — free plan needs defaults only)'
        : 'Not allowed on your UptimeRobot plan';
    return {
      kind: 'plan_feature',
      summary: settings,
      raw: msg,
    };
  }
  if (/invalid|blacklist|forbidden|bad request|required field|malformed/i.test(lower)) {
    return {
      kind: 'invalid',
      summary: 'Invalid monitor configuration',
      raw: msg,
    };
  }
  return { kind: 'other', summary: msg, raw: msg };
}

function apiKey(): string | null {
  return serverEnv('UPTIMEROBOT_API_KEY')?.trim() || null;
}

let _rateLimitUntil = 0;
let _cachedAccount: UptimeRobotAccountDetails | null = null;

export function noteUptimeRobotRateLimit(raw: string): void {
  const sec = parseUptimeRobotRetrySeconds(raw) ?? 60;
  _rateLimitUntil = Date.now() + sec * 1000;
}

function isUptimeRobotRateLimited(): boolean {
  return Date.now() < _rateLimitUntil;
}

export function getCachedUptimeRobotAccount(): UptimeRobotAccountDetails | null {
  return _cachedAccount;
}

function cacheUptimeRobotAccount(account: UptimeRobotAccountDetails): void {
  _cachedAccount = account;
}

export function isUptimeRobotConfigured(): boolean {
  return Boolean(apiKey());
}

function statusLabel(status: number): string {
  switch (status) {
    case UPTIME_MONITOR_STATUS.PAUSED:
      return 'paused';
    case UPTIME_MONITOR_STATUS.NOT_CHECKED:
      return 'not checked';
    case UPTIME_MONITOR_STATUS.UP:
      return 'up';
    case UPTIME_MONITOR_STATUS.SEEMS_DOWN:
      return 'seems down';
    case UPTIME_MONITOR_STATUS.DOWN:
      return 'down';
    default:
      return `status ${status}`;
  }
}

export function uptimeStatusLabel(status: number): string {
  return statusLabel(status);
}

export function uptimeStatusIsDown(status: number): boolean {
  return status === UPTIME_MONITOR_STATUS.DOWN || status === UPTIME_MONITOR_STATUS.SEEMS_DOWN;
}

export function parseCustomUptimeRatios(raw: string | undefined): { d7: number | null; d30: number | null } {
  if (!raw?.trim()) return { d7: null, d30: null };
  const parts = raw.split('-').map((p) => Number(p.trim()));
  return {
    d7: Number.isFinite(parts[0]) ? parts[0] : null,
    d30: Number.isFinite(parts[1]) ? parts[1] : null,
  };
}

export async function urGetMonitors(opts?: {
  monitorIds?: number[];
  customUptimeRatios?: string;
  offset?: number;
  limit?: number;
  includeAlertContacts?: boolean;
}): Promise<UptimeRobotMonitorsResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'UPTIMEROBOT_API_KEY is not set' };

  const body = new URLSearchParams({
    api_key: key,
    format: 'json',
    logs: '0',
    response_times: '0',
    custom_uptime_ratios: opts?.customUptimeRatios ?? '7-30',
  });
  if (opts?.includeAlertContacts) {
    body.set('alert_contacts', '1');
  }
  if (opts?.monitorIds?.length) {
    body.set('monitors', opts.monitorIds.join('-'));
  }
  if (opts?.offset != null && opts.offset > 0) {
    body.set('offset', String(opts.offset));
  }
  if (opts?.limit != null && opts.limit > 0) {
    body.set('limit', String(Math.min(opts.limit, 50)));
  }

  try {
    const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as {
      stat?: string;
      error?: { message?: string };
      monitors?: UptimeRobotMonitor[];
    };

    if (!res.ok || data.stat !== 'ok') {
      const msg = data.error?.message || `HTTP ${res.status}`;
      if (/rate limit/i.test(msg)) noteUptimeRobotRateLimit(msg);
      return { ok: false, error: msg };
    }

    return { ok: true, monitors: data.monitors ?? [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Paginate getMonitors — the API returns at most 50 records per page. */
export async function urGetAllMonitors(opts?: {
  customUptimeRatios?: string;
  includeAlertContacts?: boolean;
}): Promise<UptimeRobotMonitorsResult> {
  const all: UptimeRobotMonitor[] = [];
  const pageSize = 50;
  let offset = 0;

  for (;;) {
    const page = await urGetMonitors({
      customUptimeRatios: opts?.customUptimeRatios,
      includeAlertContacts: offset === 0 ? opts?.includeAlertContacts : undefined,
      offset,
      limit: pageSize,
    });
    if (!page.ok) return page;
    all.push(...page.monitors);
    if (page.monitors.length < pageSize) break;
    offset += pageSize;
    if (offset > 10_000) break;
  }

  return { ok: true, monitors: all };
}

function urSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry getMonitors/getAllMonitors when UptimeRobot returns rate-limit errors. */
export async function urGetAllMonitorsWithRetry(opts?: {
  customUptimeRatios?: string;
  includeAlertContacts?: boolean;
  maxAttempts?: number;
}): Promise<UptimeRobotMonitorsResult> {
  const maxAttempts = opts?.maxAttempts ?? 4;
  let lastError = 'unknown error';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await urGetAllMonitors({
      customUptimeRatios: opts?.customUptimeRatios,
      includeAlertContacts: opts?.includeAlertContacts,
    });
    if (result.ok) return result;
    lastError = result.error;
    const classified = classifyUptimeRobotError(result.error);
    if (classified.kind !== 'rate_limit' || attempt >= maxAttempts - 1) return result;
    const waitSec = parseUptimeRobotRetrySeconds(classified.raw) ?? 60;
    await urSleep((waitSec + 2) * 1000);
  }

  return { ok: false, error: lastError };
}

export async function urGetAccountDetails(): Promise<
  | { ok: true; account: UptimeRobotAccountDetails }
  | { ok: false; error: string }
> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'UPTIMEROBOT_API_KEY is not set' };

  if (isUptimeRobotRateLimited()) {
    if (_cachedAccount) return { ok: true, account: _cachedAccount };
    return { ok: false, error: 'UptimeRobot rate limit cooldown' };
  }

  const body = new URLSearchParams({
    api_key: key,
    format: 'json',
  });

  try {
    const res = await fetch('https://api.uptimerobot.com/v2/getAccountDetails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as {
      stat?: string;
      error?: { message?: string };
      account?: {
        monitor_limit?: number | string;
        monitor_interval?: number | string;
        up_monitors?: number | string;
        down_monitors?: number | string;
        paused_monitors?: number | string;
      };
    };

    if (!res.ok || data.stat !== 'ok' || !data.account) {
      const msg = data.error?.message || `HTTP ${res.status}`;
      if (/rate limit/i.test(msg)) noteUptimeRobotRateLimit(msg);
      if (_cachedAccount) return { ok: true, account: _cachedAccount };
      return { ok: false, error: msg };
    }

    const a = data.account;
    const up = Number(a.up_monitors ?? 0);
    const down = Number(a.down_monitors ?? 0);
    const paused = Number(a.paused_monitors ?? 0);
    const intervalRaw = Number(a.monitor_interval);
    const account: UptimeRobotAccountDetails = {
      monitorLimit: Number(a.monitor_limit ?? 0),
      monitorCount: up + down + paused,
      upMonitors: up,
      downMonitors: down,
      pausedMonitors: paused,
      monitorIntervalSeconds: Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : null,
    };
    cacheUptimeRobotAccount(account);
    return { ok: true, account };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (_cachedAccount) return { ok: true, account: _cachedAccount };
    return { ok: false, error: msg };
  }
}

/** HTTP(S) monitor type — UptimeRobot API v2. */
export const UPTIME_MONITOR_TYPE_HTTP = 1;

export function normalizeUptimeMonitorUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export function defaultUptimeFriendlyName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}

export async function urGetAlertContacts(): Promise<
  | {
      ok: true;
      contacts: Array<{ id: number; friendly_name: string; type: number; status: number }>;
    }
  | { ok: false; error: string }
> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'UPTIMEROBOT_API_KEY is not set' };

  const body = new URLSearchParams({
    api_key: key,
    format: 'json',
  });

  try {
    const res = await fetch('https://api.uptimerobot.com/v2/getAlertContacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as {
      stat?: string;
      error?: { message?: string };
      alert_contacts?: Array<{
        id?: number | string;
        friendly_name?: string;
        type?: number | string;
        status?: number | string;
      }>;
    };

    if (!res.ok || data.stat !== 'ok') {
      const msg = data.error?.message || `HTTP ${res.status}`;
      if (/rate limit/i.test(msg)) noteUptimeRobotRateLimit(msg);
      return { ok: false, error: msg };
    }

    const contacts = (data.alert_contacts ?? [])
      .map((c) => ({
        id: Number(c.id),
        friendly_name: String(c.friendly_name ?? ''),
        type: Number(c.type ?? 0),
        status: Number(c.status ?? 0),
      }))
      .filter((c) => Number.isFinite(c.id) && c.id > 0);

    return { ok: true, contacts };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Free-plan alert_contacts value — threshold and recurrence must be 0. */
export function urFormatFreePlanAlertContacts(contactIds: number[]): string {
  return contactIds.map((id) => `${id}_0_0`).join('-');
}

/** Single contact string for free-plan creates (one id_0_0). */
export function urSingleFreePlanAlertContact(contactId: number): string {
  return `${contactId}_0_0`;
}

/** Only active e-mail contacts are assignable via API on the free plan (one contact). */
export function urFreePlanEmailAlertContacts(
  contacts: Array<{ id: number; type: number; status: number }>,
): string | undefined {
  const active = contacts.filter(
    (c) => c.type === UPTIME_ALERT_CONTACT_EMAIL && c.status === UPTIME_ALERT_CONTACT_ACTIVE,
  );
  if (!active.length) return undefined;
  return urSingleFreePlanAlertContact(active[0]!.id);
}

/** Email alert contact from a monitor's assignments (skips Teams/webhook/etc.). */
function urEmailAlertContactsFromMonitorAssignments(
  assigned: UptimeRobotMonitor['alert_contacts'],
  contactTypeById: Map<number, number>,
): string | undefined {
  if (!assigned?.length) return undefined;
  for (const ac of assigned) {
    const id = Number(ac.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (contactTypeById.get(id) !== UPTIME_ALERT_CONTACT_EMAIL) continue;
    return urSingleFreePlanAlertContact(id);
  }
  return undefined;
}

export type UptimeRobotCreateStrategy = {
  name: string;
  intervalSeconds?: number;
  alertContacts?: string;
  disableDomainExpireNotifications?: boolean;
};

/** Shared per sync run — avoids refetching contacts/account for every newMonitor. */
export type UptimeRobotCreateContext = {
  emailContacts?: string;
  /** alert_contacts copied from an existing working monitor (email-only). */
  clonedAlertContacts?: string;
  alertContactTypes?: number[];
  /** Set after the first successful create in a run; subsequent creates use one API call. */
  knownStrategy?: UptimeRobotCreateStrategy;
};

export async function urResolveCreateContext(opts?: {
  accountIntervalSeconds?: number | null;
  /** Reuse monitors from sync listing to avoid extra getMonitors calls. */
  monitors?: UptimeRobotMonitor[];
}): Promise<UptimeRobotCreateContext> {
  let contactsRes = await urGetAlertContacts();
  if (!contactsRes.ok && classifyUptimeRobotError(contactsRes.error).kind === 'rate_limit') {
    const waitSec = parseUptimeRobotRetrySeconds(contactsRes.error) ?? 60;
    await urSleep((waitSec + 2) * 1000);
    contactsRes = await urGetAlertContacts();
  }

  const contactTypeById = new Map<number, number>();
  if (contactsRes.ok) {
    for (const c of contactsRes.contacts) {
      contactTypeById.set(c.id, c.type);
    }
  }

  let monitors = opts?.monitors;
  if (monitors == null) {
    const listed = await urGetMonitors({ limit: 50, includeAlertContacts: true, customUptimeRatios: '7-30' });
    monitors = listed.ok ? listed.monitors : [];
  }

  const emailContacts = contactsRes.ok
    ? urFreePlanEmailAlertContacts(contactsRes.contacts)
    : undefined;

  let clonedAlertContacts: string | undefined;
  for (const monitor of monitors) {
    clonedAlertContacts = urEmailAlertContactsFromMonitorAssignments(
      monitor.alert_contacts,
      contactTypeById,
    );
    if (clonedAlertContacts) break;
  }

  return {
    emailContacts,
    clonedAlertContacts,
    alertContactTypes: contactsRes.ok
      ? [...new Set(contactsRes.contacts.map((c) => c.type))].sort()
      : undefined,
  };
}

function urBuildCreateStrategies(ctx: UptimeRobotCreateContext): UptimeRobotCreateStrategy[] {
  if (ctx.knownStrategy) return [ctx.knownStrategy];

  const strategies: UptimeRobotCreateStrategy[] = [];

  // Email first — free-plan API rejects Teams/webhook contacts (type 12, etc.).
  if (ctx.emailContacts) {
    strategies.push({ name: 'email-contact', alertContacts: ctx.emailContacts });
  }
  if (ctx.clonedAlertContacts && ctx.clonedAlertContacts !== ctx.emailContacts) {
    strategies.push({ name: 'clone-monitor-email', alertContacts: ctx.clonedAlertContacts });
  }

  return strategies;
}

export function parseUptimeRobotRetrySeconds(raw: string): number | null {
  const match = raw.match(/retry in (\d+)\s*seconds?/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function urNewMonitorOnce(opts: {
  url: string;
  friendlyName?: string;
  type?: number;
  intervalSeconds?: number;
  alertContacts?: string;
  disableDomainExpireNotifications?: boolean;
}): Promise<UptimeRobotNewMonitorResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'UPTIMEROBOT_API_KEY is not set' };

  const url = normalizeUptimeMonitorUrl(opts.url);
  if (!url) return { ok: false, error: 'url is required' };

  const friendlyName = opts.friendlyName?.trim() || defaultUptimeFriendlyName(url);

  const body = new URLSearchParams({
    api_key: key,
    format: 'json',
    type: String(opts.type ?? UPTIME_MONITOR_TYPE_HTTP),
    url,
    friendly_name: friendlyName,
  });
  if (opts.intervalSeconds != null) {
    body.set('interval', String(opts.intervalSeconds));
  }
  if (opts.alertContacts) {
    body.set('alert_contacts', opts.alertContacts);
  }
  if (opts.disableDomainExpireNotifications) {
    body.set('disable_domain_expire_notifications', '1');
  }

  try {
    const res = await fetch('https://api.uptimerobot.com/v2/newMonitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json()) as {
      stat?: string;
      error?: { message?: string };
      monitor?: { id?: number };
    };

    if (!res.ok || data.stat !== 'ok' || !data.monitor?.id) {
      const msg = data.error?.message || `HTTP ${res.status}`;
      if (/rate limit/i.test(msg)) noteUptimeRobotRateLimit(msg);
      return { ok: false, error: msg };
    }

    return { ok: true, monitorId: data.monitor.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

const PLAN_SETTINGS_RE = /not allowed to use some settings/i;

/** Try progressively richer payloads; stop on first success or non-plan error. */
export async function urNewMonitor(opts: {
  url: string;
  friendlyName?: string;
  type?: number;
  intervalSeconds?: number;
  alertContacts?: string;
  createContext?: UptimeRobotCreateContext;
}): Promise<UptimeRobotNewMonitorResult> {
  const ctx = opts.createContext ?? (await urResolveCreateContext());

  const strategies = urBuildCreateStrategies(ctx);

  if (opts.intervalSeconds != null || opts.alertContacts) {
    strategies.unshift({
      name: 'explicit',
      intervalSeconds: opts.intervalSeconds,
      alertContacts: opts.alertContacts,
    });
  }

  if (!strategies.length) {
    return { ok: false, error: 'No alert contacts available for UptimeRobot monitor create' };
  }

  let lastError = 'unknown error';
  for (let i = 0; i < strategies.length; i += 1) {
    const strategy = strategies[i]!;
    if (i > 0) await urSleep(7000);

    const result = await urNewMonitorOnce({
      url: opts.url,
      friendlyName: opts.friendlyName,
      type: opts.type,
      intervalSeconds: strategy.intervalSeconds,
      alertContacts: strategy.alertContacts,
      disableDomainExpireNotifications: strategy.disableDomainExpireNotifications,
    });
    if (result.ok) {
      if (opts.createContext) {
        opts.createContext.knownStrategy = strategy;
      }
      console.info('[uptimerobot] newMonitor ok', { strategy: strategy.name, url: opts.url });
      return result;
    }
    lastError = result.error;

    if (classifyUptimeRobotError(result.error).kind === 'rate_limit') {
      const waitSec = parseUptimeRobotRetrySeconds(result.error) ?? 60;
      await urSleep((waitSec + 2) * 1000);
      i -= 1;
      continue;
    }

    if (!PLAN_SETTINGS_RE.test(result.error)) return result;
    console.warn('[uptimerobot] newMonitor plan settings rejected', {
      strategy: strategy.name,
      alertContacts: strategy.alertContacts ?? '(none)',
      error: result.error,
    });
  }

  if (ctx.alertContactTypes?.length) {
    console.warn('[uptimerobot] newMonitor exhausted strategies', {
      url: opts.url,
      alertContactTypes: ctx.alertContactTypes,
    });
  }

  return { ok: false, error: lastError };
}
