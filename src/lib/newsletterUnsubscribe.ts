/**
 * Signed unsubscribe tokens. A token is a self-verifying handle for an email
 * address so the public unsubscribe endpoint never needs auth or a lookup:
 *
 *   token = base64url(email) + "." + hex(hmac_sha256(email, secret))
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { serverEnv } from './serverEnv';

function secret(): string {
  return (
    serverEnv('NEWSLETTER_UNSUB_SECRET') ||
    serverEnv('RESEND_WEBHOOK_SECRET') ||
    serverEnv('CLERK_SECRET_KEY') ||
    'reave-newsletter-unsub'
  );
}

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function sign(email: string): string {
  return createHmac('sha256', secret()).update(email.toLowerCase().trim()).digest('hex');
}

export function makeUnsubscribeToken(email: string): string {
  const normalized = email.toLowerCase().trim();
  return `${b64urlEncode(normalized)}.${sign(normalized)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const trimmed = (token || '').trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return null;
  const emailPart = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  let email: string;
  try {
    email = b64urlDecode(emailPart);
  } catch {
    return null;
  }
  if (!email.includes('@')) return null;
  const expected = sign(email);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return email.toLowerCase().trim();
}
