/**
 * Background cleanup for inbox rows past their delete_after_at (verification codes, etc.).
 * Lazy-started on dashboard / inbound / uptime poll traffic — mirrors newsletterScheduler.
 */
import { dismissEmailRelatedNotifications } from './emailNotificationSync';
import { storeDeleteEmailInbox, storeListExpiredEmailInbox } from './emailInboxStore';
import { serverEnv } from './serverEnv';
import { runSleepDeferredCatchUp } from './inboundEmailHandler';

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

/** Poll interval for expired-row cleanup (default 1 minute). */
function pollIntervalMs(): number {
  const sec = Number(serverEnv('EMAIL_CLEANUP_POLL_SECONDS') || 60);
  const clamped = Math.max(15, Math.min(sec, 300));
  return clamped * 1000;
}

export async function runEmailCleanup(): Promise<{ deleted: number }> {
  if (_running) return { deleted: 0 };
  _running = true;
  let deleted = 0;
  try {
    const expired = await storeListExpiredEmailInbox(50);
    for (const row of expired) {
      await dismissEmailRelatedNotifications(row.id, { markAutomationAck: false }).catch(() => undefined);
      if (await storeDeleteEmailInbox(row.id)) deleted += 1;
    }
    if (deleted > 0) {
      console.info('[email-cleanup] deleted expired inbox rows', { deleted });
    }
    return { deleted };
  } finally {
    _running = false;
  }
}

export function ensureEmailCleanupScheduler(): void {
  if (_timer) return;

  const ms = pollIntervalMs();
  void runEmailCleanup().catch((e) => console.warn('[email-cleanup] initial run failed', e));
  void runSleepDeferredCatchUp().catch((e) => console.warn('[email] sleep catch-up failed', e));
  _timer = setInterval(() => {
    void runEmailCleanup().catch((e) => console.warn('[email-cleanup] run failed', e));
    void runSleepDeferredCatchUp().catch((e) => console.warn('[email] sleep catch-up failed', e));
  }, ms);
  console.info('[email-cleanup] scheduler started', { intervalSeconds: ms / 1000 });
}
