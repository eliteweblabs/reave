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
