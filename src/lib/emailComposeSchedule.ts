/**
 * Parse / validate a compose scheduled-send time.
 * Immediate (within 15s) is treated as send-now by the caller.
 */

export const SCHEDULE_IMMEDIATE_GRACE_MS = 15_000;
export const SCHEDULE_MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

export function parseComposeScheduledAt(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid scheduled time');
  }
  const now = Date.now();
  if (d.getTime() < now - 60_000) {
    throw new Error('Scheduled time is in the past');
  }
  if (d.getTime() > now + SCHEDULE_MAX_AHEAD_MS) {
    throw new Error('Scheduled time must be within one year');
  }
  return d;
}

export function isImmediateScheduledAt(at: Date, now = Date.now()): boolean {
  return at.getTime() <= now + SCHEDULE_IMMEDIATE_GRACE_MS;
}
