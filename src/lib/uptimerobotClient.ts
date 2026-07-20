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

export type UptimeRobotMonitor = {
  id: number;
  friendly_name: string;
  url: string | null;
  status: UptimeMonitorStatus;
  all_time_uptime_ratio?: string;
  custom_uptime_ratio?: string;
  average_response_time?: string;
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
        ? 'Monitor settings not allowed on your UptimeRobot plan (usually check interval — free plan requires 5-minute checks)'
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
}): Promise<UptimeRobotMonitorsResult> {
  const all: UptimeRobotMonitor[] = [];
  const pageSize = 50;
  let offset = 0;

  for (;;) {
    const page = await urGetMonitors({
      customUptimeRatios: opts?.customUptimeRatios,
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

export async function urGetAccountDetails(): Promise<
  | { ok: true; account: UptimeRobotAccountDetails }
  | { ok: false; error: string }
> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'UPTIMEROBOT_API_KEY is not set' };

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
      return { ok: false, error: msg };
    }

    const a = data.account;
    const up = Number(a.up_monitors ?? 0);
    const down = Number(a.down_monitors ?? 0);
    const paused = Number(a.paused_monitors ?? 0);
    const intervalRaw = Number(a.monitor_interval);
    return {
      ok: true,
      account: {
        monitorLimit: Number(a.monitor_limit ?? 0),
        monitorCount: up + down + paused,
        upMonitors: up,
        downMonitors: down,
        pausedMonitors: paused,
        monitorIntervalSeconds: Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : null,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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

export async function urNewMonitor(opts: {
  url: string;
  friendlyName?: string;
  type?: number;
  /** Check interval in seconds. Free plan requires 300 (5 min) or higher. */
  intervalSeconds?: number;
}): Promise<UptimeRobotNewMonitorResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'UPTIMEROBOT_API_KEY is not set' };

  const url = normalizeUptimeMonitorUrl(opts.url);
  if (!url) return { ok: false, error: 'url is required' };

  const friendlyName = opts.friendlyName?.trim() || defaultUptimeFriendlyName(url);
  const interval = opts.intervalSeconds ?? 300;

  const body = new URLSearchParams({
    api_key: key,
    format: 'json',
    type: String(opts.type ?? UPTIME_MONITOR_TYPE_HTTP),
    url,
    friendly_name: friendlyName,
    interval: String(interval),
  });

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
      return { ok: false, error: msg };
    }

    return { ok: true, monitorId: data.monitor.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
