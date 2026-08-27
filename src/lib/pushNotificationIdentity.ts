/**
 * Stable identities for phone/PWA notifications.
 *
 * Inbox UUID tags (`otp-${id}`) are unique per ingest row. Webhook retries and
 * multi-recipient Resend deliveries can create several rows for one email, so
 * the OS tray must also collapse on Message-ID / Resend id / OTP code.
 */

import { createHash } from 'crypto';
import { normalizeMessageId } from './emailMessageId';

export type EmailPushKind = 'otp' | 'auth_link' | 'triage' | 'email';

const GENERIC_PUSH_TAGS = new Set(['inbox', 'reave-badge-sync', 'demo-test', 'demo-seed']);

export function isReusablePushAlertTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return Boolean(t) && !GENERIC_PUSH_TAGS.has(t);
}

function compactIdentity(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (s.length <= 80) return s;
  const hash = createHash('sha1').update(s).digest('hex').slice(0, 16);
  return `${s.slice(0, 48)}-${hash}`;
}

export function emailPushStableKey(opts: {
  messageId?: string | null;
  resendEmailId?: string | null;
  verificationCode?: string | null;
  inboxId?: string | null;
}): string {
  const messageId =
    normalizeMessageId(opts.messageId || '') || String(opts.messageId || '').trim();
  const resend = String(opts.resendEmailId || '').trim();
  const code = String(opts.verificationCode || '').trim();
  const inboxId = String(opts.inboxId || '').trim();
  return compactIdentity(messageId || resend || (code ? `code-${code}` : '') || inboxId);
}

/** OS notification tag that stays stable across duplicate ingest of the same email. */
export function emailPushCollapseId(opts: {
  kind: EmailPushKind;
  inboxId: string;
  messageId?: string | null;
  resendEmailId?: string | null;
  verificationCode?: string | null;
}): string {
  const prefix =
    opts.kind === 'otp'
      ? 'otp'
      : opts.kind === 'auth_link'
        ? 'auth'
        : opts.kind === 'triage'
          ? 'triage'
          : 'email';
  const stable = emailPushStableKey(opts) || opts.inboxId;
  return `${prefix}-${stable}`.slice(0, 120);
}

/** Keys the service worker / sender use to refuse a second identical tray item. */
export function pushPresentationIds(opts: {
  tag?: string | null;
  collapseId?: string | null;
  verificationCode?: string | null;
}): string[] {
  const ids = new Set<string>();
  const collapseId = String(opts.collapseId || '').trim();
  const tag = String(opts.tag || '').trim();
  const code = String(opts.verificationCode || '').trim();
  if (collapseId) ids.add(collapseId);
  if (tag && isReusablePushAlertTag(tag)) ids.add(tag);
  if (code) ids.add(`otp-code:${code}`);
  return [...ids];
}

export function claimPushPresentationIds(
  claimed: Set<string>,
  ids: string[],
): boolean {
  if (ids.some((id) => claimed.has(id))) return false;
  for (const id of ids) claimed.add(id);
  return true;
}
