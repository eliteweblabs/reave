/**
 * Lazy scheduler for Agentic Social Lead Scanner poll.
 */
import { serverEnv } from './serverEnv';
import { runSocialLeadScanner, socialLeadScannerEnabled } from './socialLeadScannerEngine';
import { getSocialLeadScannerConfig } from './socialLeadScannerStore';

let _timer: ReturnType<typeof setInterval> | null = null;

function pollIntervalMs(): number {
  const min = Number(serverEnv('SOCIAL_LEAD_SCANNER_POLL_MINUTES') || 60);
  return Math.max(15, Math.min(min, 720)) * 60_000;
}

export function socialLeadScannerPollSecret(): string | null {
  return serverEnv('SOCIAL_LEAD_SCANNER_POLL_SECRET')?.trim() || null;
}

export function ensureSocialLeadScannerScheduler(): void {
  if (_timer) return;
  if (!socialLeadScannerEnabled()) return;
  if (!serverEnv('DATABASE_URL')?.trim()) return;

  const ms = pollIntervalMs();
  void runSocialLeadScanner({ source: 'cron' }).catch((e) =>
    console.warn('[social-lead-scanner] initial run failed', e),
  );
  _timer = setInterval(() => {
    void runSocialLeadScanner({ source: 'cron' }).catch((e) =>
      console.warn('[social-lead-scanner] run failed', e),
    );
  }, ms);
  console.info('[social-lead-scanner] scheduler started', { intervalMinutes: ms / 60_000 });
}

export async function socialLeadScannerSchedulerStatus(): Promise<Record<string, unknown>> {
  const config = await getSocialLeadScannerConfig();
  return {
    enabled: config.enabled,
    pollMinutes: Number(serverEnv('SOCIAL_LEAD_SCANNER_POLL_MINUTES') || 60),
    lastRunAt: config.lastRunAt,
  };
}
