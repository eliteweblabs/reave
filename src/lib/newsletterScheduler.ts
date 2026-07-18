/**
 * Background scheduler for the newsletter queue. Every N minutes it sends any
 * scheduled emails that are due (inside the send window). Lazy-started on the
 * first newsletter API request, mirroring the uptime poll scheduler.
 */
import { serverEnv } from './serverEnv';
import { isNewsletterEnabled, processDueNewsletterSends } from './newsletterEngine';

let _timer: ReturnType<typeof setInterval> | null = null;

function pollIntervalMs(): number {
  const min = Number(serverEnv('NEWSLETTER_POLL_MINUTES') || 5);
  const clamped = Math.max(1, Math.min(min, 60));
  return clamped * 60_000;
}

export function newsletterPollSecret(): string | null {
  return serverEnv('NEWSLETTER_POLL_SECRET')?.trim() || null;
}

export function ensureNewsletterScheduler(): void {
  if (_timer) return;
  if (!isNewsletterEnabled()) return;
  if (!serverEnv('DATABASE_URL')?.trim()) return;

  const ms = pollIntervalMs();
  void processDueNewsletterSends().catch((e) => console.warn('[newsletter] initial run failed', e));
  _timer = setInterval(() => {
    void processDueNewsletterSends().catch((e) => console.warn('[newsletter] run failed', e));
  }, ms);
  console.info('[newsletter] scheduler started', { intervalMinutes: ms / 60_000 });
}
