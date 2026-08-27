/**
 * Serialize inbound processing for the same Message-ID / Resend email so
 * webhook retries cannot insert five inbox rows and fire five OTP pushes.
 */

import { normalizeMessageId } from './emailMessageId';

const tails = new Map<string, Promise<void>>();

export function inboundIdentityLockKey(email: {
  resendEmailId?: string | null;
  messageId?: string | null;
}): string {
  const resend = String(email.resendEmailId || '').trim();
  if (resend) return `resend:${resend}`;
  const msg = normalizeMessageId(email.messageId || '') || String(email.messageId || '').trim();
  return msg ? `msgid:${msg}` : '';
}

export async function withInboundIdentityLock<T>(
  email: { resendEmailId?: string | null; messageId?: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  const key = inboundIdentityLockKey(email);
  if (!key) return fn();

  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(
    () => current,
    () => current,
  );
  tails.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === chained) tails.delete(key);
  }
}
