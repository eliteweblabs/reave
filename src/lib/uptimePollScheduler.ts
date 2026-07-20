/**
 * Background polling for UptimeRobot — syncs monitor status every N minutes.
 */
import { hasFeature } from './features';
import { isKinstaConfigured } from './kinstaClient';
import { isRailwayConfigured } from './railwayClient';
import { isUptimeRobotConfigured } from './uptimerobotClient';
import { isUptimeDbConfigured } from './pgUptime';
import { syncPlatformUrlsToUptime, syncUptimeMonitorsFromApi } from './uptimeMonitoring';
import { serverEnv } from './serverEnv';

let _timer: ReturnType<typeof setInterval> | null = null;
let _discoverTimer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _discovering = false;

function pollIntervalMs(): number {
  const min = Number(serverEnv('UPTIMEROBOT_POLL_MINUTES') || 5);
  const clamped = Math.max(1, Math.min(min, 60));
  return clamped * 60_000;
}

/** Minutes between automatic Kinsta/Railway → UptimeRobot discovery runs (0 disables). */
function discoverIntervalMs(): number | null {
  const raw = serverEnv('UPTIMEROBOT_DISCOVER_MINUTES');
  const min = raw == null || raw === '' ? 60 : Number(raw);
  if (!Number.isFinite(min) || min <= 0) return null;
  return Math.max(5, Math.min(min, 1440)) * 60_000;
}

export function uptimePollSecret(): string | null {
  return serverEnv('UPTIMEROBOT_POLL_SECRET')?.trim() || serverEnv('UPTIMEROBOT_WEBHOOK_SECRET')?.trim() || null;
}

export async function runUptimePoll(): Promise<{ ok: boolean; synced?: number; error?: string }> {
  if (_running) return { ok: false, error: 'poll already running' };
  _running = true;
  try {
    return await syncUptimeMonitorsFromApi();
  } finally {
    _running = false;
  }
}

/**
 * Discover Kinsta/Railway hosting URLs and create any UptimeRobot monitors that
 * don't exist yet, so the monitored domains stay in sync with what's hosted.
 * Idempotent: existing monitors are skipped.
 */
export async function runUptimeDiscovery(): Promise<{ ok: boolean; created?: number; error?: string }> {
  if (_discovering) return { ok: false, error: 'discovery already running' };
  _discovering = true;
  try {
    const result = await syncPlatformUrlsToUptime();
    if (result.created > 0) {
      console.info('[uptime-poll] discovery created monitors', { created: result.created });
    }
    if (result.errors.length) {
      console.warn('[uptime-poll] discovery errors', result.errors);
    }
    return { ok: result.ok, created: result.created };
  } finally {
    _discovering = false;
  }
}

export function ensureUptimePollScheduler(): void {
  if (_timer) return;
  if (!hasFeature('uptime_monitoring')) return;
  if (!isUptimeRobotConfigured() || !isUptimeDbConfigured()) return;

  const ms = pollIntervalMs();
  void runUptimePoll().catch((e) => console.warn('[uptime-poll] initial sync failed', e));
  _timer = setInterval(() => {
    void runUptimePoll().catch((e) => console.warn('[uptime-poll] sync failed', e));
  }, ms);
  console.info('[uptime-poll] scheduler started', { intervalMinutes: ms / 60_000 });

  const discoverMs = discoverIntervalMs();
  if (discoverMs && (isKinstaConfigured() || isRailwayConfigured())) {
    void runUptimeDiscovery().catch((e) => console.warn('[uptime-poll] initial discovery failed', e));
    _discoverTimer = setInterval(() => {
      void runUptimeDiscovery().catch((e) => console.warn('[uptime-poll] discovery failed', e));
    }, discoverMs);
    console.info('[uptime-poll] discovery scheduler started', { intervalMinutes: discoverMs / 60_000 });
  }
}
