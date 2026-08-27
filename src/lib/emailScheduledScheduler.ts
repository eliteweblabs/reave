/**
 * Background flush for scheduled correspondence emails.
 * Lazy-started on inbox / compose / dashboard traffic — mirrors newsletterScheduler.
 */

import { processDueScheduledEmails } from './emailScheduledSend';
import { serverEnv } from './serverEnv';

let _timer: ReturnType<typeof setInterval> | null = null;

function pollIntervalMs(): number {
  const sec = Number(serverEnv('EMAIL_SCHEDULED_POLL_SECONDS') || 30);
  const clamped = Math.max(15, Math.min(sec, 300));
  return clamped * 1000;
}

export function emailScheduledPollSecret(): string | null {
  return (
    serverEnv('EMAIL_SCHEDULED_POLL_SECRET')?.trim() ||
    serverEnv('NEWSLETTER_POLL_SECRET')?.trim() ||
    null
  );
}

export function ensureEmailScheduledScheduler(): void {
  if (_timer) return;

  const ms = pollIntervalMs();
  void processDueScheduledEmails().catch((e) =>
    console.warn('[email-scheduled] initial run failed', e),
  );
  _timer = setInterval(() => {
    void processDueScheduledEmails().catch((e) => console.warn('[email-scheduled] run failed', e));
  }, ms);
  console.info('[email-scheduled] scheduler started', { intervalSeconds: ms / 1000 });
}
