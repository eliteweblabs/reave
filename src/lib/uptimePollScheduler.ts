/**
 * Background polling for UptimeRobot — syncs monitor status every N minutes.
 */
import { hasFeature } from './features';
import { isUptimeRobotConfigured } from './uptimerobotClient';
import { isUptimeDbConfigured } from './pgUptime';
import { syncUptimeMonitorsFromApi } from './uptimeMonitoring';
import { serverEnv } from './serverEnv';

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

function pollIntervalMs(): number {
  const min = Number(serverEnv('UPTIMEROBOT_POLL_MINUTES') || 5);
  const clamped = Math.max(1, Math.min(min, 60));
  return clamped * 60_000;
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
}
