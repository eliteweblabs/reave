/**
 * Device-trust cookie after /card passkey authentication (shows Dashboard without Clerk session).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkSecretKey } from './clerkClient';

export type CardPasskeyTrust = {
  userId: string;
  displayName: string;
  exp: number;
};

const COOKIE_NAME = 'card_passkey_trust';
const TRUST_MS = 90 * 24 * 60 * 60 * 1000;

function sealSecret(): string {
  return clerkSecretKey() || 'card-passkey-dev';
}

export function sealCardPasskeyTrust(payload: Omit<CardPasskeyTrust, 'exp'>): string {
  const body: CardPasskeyTrust = { ...payload, exp: Date.now() + TRUST_MS };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', sealSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function openCardPasskeyTrust(raw: string | null | undefined): CardPasskeyTrust | null {
  const value = raw?.trim();
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac('sha256', sealSecret()).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CardPasskeyTrust;
    if (!payload?.userId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cardPasskeyTrustCookie(payload: Omit<CardPasskeyTrust, 'exp'>): string {
  const sealed = sealCardPasskeyTrust(payload);
  return `${COOKIE_NAME}=${sealed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TRUST_MS / 1000)}; Secure`;
}

export function readCardPasskeyTrust(request: Request): CardPasskeyTrust | null {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return openCardPasskeyTrust(match?.[1] ? decodeURIComponent(match[1]) : null);
}
