/**
 * Short-lived signed challenges for /card WebAuthn ceremonies.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { clerkSecretKey } from './clerkClient';

export type CardPasskeyChallengeKind = 'registration' | 'authentication';

export type CardPasskeyChallenge = {
  challenge: string;
  kind: CardPasskeyChallengeKind;
  userId?: string;
  exp: number;
};

const COOKIE_NAME = 'card_passkey_challenge';

function sealSecret(): string {
  return clerkSecretKey() || 'card-passkey-dev';
}

export function newCardPasskeyChallenge(
  kind: CardPasskeyChallengeKind,
  userId?: string,
): CardPasskeyChallenge {
  return {
    challenge: randomBytes(32).toString('base64url'),
    kind,
    userId: userId?.trim() || undefined,
    exp: Date.now() + 5 * 60 * 1000,
  };
}

export function sealCardPasskeyChallenge(payload: CardPasskeyChallenge): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sealSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function openCardPasskeyChallenge(raw: string | null | undefined): CardPasskeyChallenge | null {
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
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CardPasskeyChallenge;
    if (!payload?.challenge || !payload?.kind || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cardPasskeyChallengeCookie(payload: CardPasskeyChallenge): string {
  const sealed = sealCardPasskeyChallenge(payload);
  return `${COOKIE_NAME}=${sealed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300; Secure`;
}

export function clearCardPasskeyChallengeCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export function readCardPasskeyChallengeCookie(request: Request): CardPasskeyChallenge | null {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return openCardPasskeyChallenge(match?.[1] ? decodeURIComponent(match[1]) : null);
}
