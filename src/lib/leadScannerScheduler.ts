/**
 * Lazy scheduler for daily lead scanner poll (mirrors newsletter/uptime pattern).
 */
import { getDeploymentOwnerTimezone } from './deploymentOwner';
import { serverEnv } from './serverEnv';
import { isLeadScannerEnabled, runLeadScanner } from './leadScannerEngine';
import { getLeadScannerConfig } from './leadScannerStore';

let _timer: ReturnType<typeof setInterval> | null = null;

function pollIntervalMs(): number {
  const min = Number(serverEnv('LEAD_SCANNER_POLL_MINUTES') || 30);
  return Math.max(15, Math.min(min, 120)) * 60_000;
}

export function leadScannerPollSecret(): string | null {
  return serverEnv('LEAD_SCANNER_POLL_SECRET')?.trim() || null;
}

export function ensureLeadScannerScheduler(): void {
  if (_timer) return;
  if (!isLeadScannerEnabled()) return;
  if (!serverEnv('DATABASE_URL')?.trim()) return;

  const ms = pollIntervalMs();
  void runLeadScanner({ source: 'cron' }).catch((e) => console.warn('[lead-scanner] initial run failed', e));
  _timer = setInterval(() => {
    void runLeadScanner({ source: 'cron' }).catch((e) => console.warn('[lead-scanner] run failed', e));
  }, ms);
  console.info('[lead-scanner] scheduler started', { intervalMinutes: ms / 60_000 });
}

export async function leadScannerStatusSummary(): Promise<Record<string, unknown>> {
  const config = await getLeadScannerConfig();
  const timezone = await getDeploymentOwnerTimezone();
  return {
    enabled: config.enabled,
    radiusMiles: config.radiusMiles,
    trades: config.trades,
    scanHourLocal: config.scanHourLocal,
    timezone,
    lastRunAt: config.lastRunAt,
    hasCenter: config.centerLat != null && config.centerLng != null,
    useCompanyOffice: config.useCompanyOffice,
  };
}
