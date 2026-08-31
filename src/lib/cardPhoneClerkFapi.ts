/**
 * Server-side Clerk Frontend API for /card phone OTP.
 *
 * Client-side clerk-js sign-in fails on *.reave.app satellite hosts
 * (`operation_not_allowed_on_satellite_domain`). Proxy FAPI from the server
 * with the primary auth origin instead.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CLERK_OFFICIAL_FRONTEND_API_ORIGIN,
  clerkProxyRequestHeaders,
} from './clerkFrontendProxy';
import { clerkSecretKey } from './clerkClient';
import { resolvePublicHost } from './requestHost';

export type CardLoginMode = 'sign-in' | 'sign-up';

export type CardLoginPending = {
  mode: CardLoginMode;
  resourceId: string;
  cookies: Record<string, string>;
  exp: number;
};

type ClerkErrorBody = {
  errors?: Array<{ code?: string; message?: string; long_message?: string }>;
};

function clerkPrimaryAuthOrigin(request: Request): string {
  const host = resolvePublicHost(request);
  if (!host || host === 'reave.app' || host.endsWith('.reave.app')) {
    return 'https://reave.app';
  }
  return `https://${host}`;
}

function mergeCookies(jar: Record<string, string>, setCookies: string[]): Record<string, string> {
  const next = { ...jar };
  for (const raw of setCookies) {
    const pair = raw.split(';')[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    next[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return next;
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function parseSetCookies(response: Response): string[] {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function clerkErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const errors = (body as ClerkErrorBody).errors;
  const first = errors?.[0];
  return first?.long_message || first?.message || fallback;
}

function clerkErrorCode(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  return (body as ClerkErrorBody).errors?.[0]?.code?.trim() || '';
}

class ClerkFapiError extends Error {
  code: string;
  cookies: Record<string, string>;
  json: Record<string, unknown>;

  constructor(message: string, code: string, cookies: Record<string, string>, json: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.cookies = cookies;
    this.json = json;
  }
}

async function clerkFapiJson(
  request: Request,
  jar: Record<string, string>,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<{ json: Record<string, unknown>; cookies: Record<string, string> }> {
  const secret = clerkSecretKey();
  if (!secret) throw new Error('Sign-in is not configured on this install.');

  const primaryOrigin = clerkPrimaryAuthOrigin(request);
  const proxyUrl = `${primaryOrigin}/__clerk`;
  const headers = clerkProxyRequestHeaders(
    new Request(primaryOrigin, {
      headers: {
        Origin: primaryOrigin,
        ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
      },
    }),
    proxyUrl,
  );
  if (body) headers.set('Content-Type', 'application/json');

  const url = `${CLERK_OFFICIAL_FRONTEND_API_ORIGIN}/${path.replace(/^\//, '')}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }

  const cookies = mergeCookies(jar, parseSetCookies(response));
  if (!response.ok) {
    throw new ClerkFapiError(
      clerkErrorMessage(json, `Clerk sign-in failed (${response.status})`),
      clerkErrorCode(json),
      cookies,
      json,
    );
  }
  return { json, cookies };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function signInFromEnvelope(json: Record<string, unknown>): Record<string, unknown> | null {
  const response = asRecord(json.response);
  if (response) {
    const object = typeof response.object === 'string' ? response.object : '';
    if (object === 'sign_in_attempt' || (typeof response.id === 'string' && response.id.startsWith('sia_'))) {
      return response;
    }
  }
  const client = asRecord(json.client);
  const nested = asRecord(client?.sign_in ?? client?.signIn);
  return nested ?? response ?? json;
}

function factorList(signIn: Record<string, unknown>): unknown[] {
  const factors = signIn.supported_first_factors ?? signIn.supportedFirstFactors;
  return Array.isArray(factors) ? factors : [];
}

function phoneCodeFactor(signIn: Record<string, unknown>): { phoneNumberId: string } | null {
  for (const row of factorList(signIn)) {
    const factor = asRecord(row);
    if (factor?.strategy !== 'phone_code') continue;
    const id =
      (typeof factor.phone_number_id === 'string' && factor.phone_number_id) ||
      (typeof factor.phoneNumberId === 'string' && factor.phoneNumberId) ||
      '';
    if (id) return { phoneNumberId: id };
  }
  return null;
}

function resourceId(json: Record<string, unknown>): string {
  const signIn = signInFromEnvelope(json);
  const id = signIn?.id;
  return typeof id === 'string' ? id : '';
}

function phoneCodeAlreadyPrepared(signIn: Record<string, unknown>): boolean {
  const verification = asRecord(signIn.first_factor_verification ?? signIn.firstFactorVerification);
  if (!verification || verification.strategy !== 'phone_code') return false;
  const status = verification.status;
  return status === 'unverified' || status === 'verified';
}

async function ensureClerkClient(
  request: Request,
  jar: Record<string, string>,
): Promise<Record<string, string>> {
  const boot = await clerkFapiJson(request, jar, 'v1/client', 'GET');
  return boot.cookies;
}

export async function startCardPhoneLogin(
  request: Request,
  phoneE164: string,
  allowSignUp: boolean,
): Promise<CardLoginPending> {
  let cookies = await ensureClerkClient(request, {});

  try {
    const created = await clerkFapiJson(request, cookies, 'v1/client/sign_ins', 'POST', {
      identifier: phoneE164,
      strategy: 'phone_code',
    });
    cookies = created.cookies;
    const signIn = signInFromEnvelope(created.json);
    const signInId = typeof signIn?.id === 'string' ? signIn.id : '';
    const factor = signIn ? phoneCodeFactor(signIn) : null;
    if (!signInId || !signIn) {
      throw new Error('Could not start sign-in for this number.');
    }
    if (phoneCodeAlreadyPrepared(signIn)) {
      return {
        mode: 'sign-in',
        resourceId: signInId,
        cookies,
        exp: Date.now() + 10 * 60 * 1000,
      };
    }
    if (!factor) {
      if (signIn.status === 'needs_identifier') {
        throw new ClerkFapiError(
          'Could not verify this phone number. Try again from the browser.',
          'needs_identifier',
          cookies,
          created.json,
        );
      }
      const strategies = factorList(signIn)
        .map((row) => asRecord(row)?.strategy)
        .filter((value): value is string => typeof value === 'string');
      console.warn('[card-login] sign-in missing phone_code factor', {
        signInId,
        status: signIn.status,
        strategies,
      });
      throw new Error('Phone codes are not enabled for this number.');
    }
    const prepared = await clerkFapiJson(request, cookies, `v1/client/sign_ins/${signInId}/prepare_first_factor`, 'POST', {
      strategy: 'phone_code',
      phone_number_id: factor.phoneNumberId,
    });
    return {
      mode: 'sign-in',
      resourceId: signInId,
      cookies: prepared.cookies,
      exp: Date.now() + 10 * 60 * 1000,
    };
  } catch (err) {
    const code = err instanceof ClerkFapiError ? err.code : '';
    cookies = err instanceof ClerkFapiError ? err.cookies : cookies;
    if (!allowSignUp || (code !== 'form_identifier_not_found' && code !== 'needs_identifier')) {
      throw err instanceof Error ? err : new Error('Could not send a code.');
    }
  }

  cookies = await ensureClerkClient(request, cookies);

  const signUp = await clerkFapiJson(request, cookies, 'v1/client/sign_ups', 'POST', {
    phone_number: phoneE164,
  });
  cookies = signUp.cookies;
  const signUpId = resourceId(signUp.json);
  if (!signUpId) throw new Error('Could not start sign-up for this number.');

  const prepared = await clerkFapiJson(
    request,
    cookies,
    `v1/client/sign_ups/${signUpId}/prepare_verification`,
    'POST',
    { strategy: 'phone_code' },
  );
  return {
    mode: 'sign-up',
    resourceId: signUpId,
    cookies: prepared.cookies,
    exp: Date.now() + 10 * 60 * 1000,
  };
}

export async function finishCardPhoneLogin(
  request: Request,
  pending: CardLoginPending,
  code: string,
): Promise<string> {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 4) throw new Error('Enter the code from the text.');

  if (pending.mode === 'sign-up') {
    const verified = await clerkFapiJson(
      request,
      pending.cookies,
      `v1/client/sign_ups/${pending.resourceId}/attempt_verification`,
      'POST',
      { strategy: 'phone_code', code: digits },
    );
    const response = signInFromEnvelope(verified.json) ?? verified.json;
    const sessionId =
      (typeof response.created_session_id === 'string' && response.created_session_id) ||
      (typeof response.createdSessionId === 'string' && response.createdSessionId) ||
      '';
    if (response.status !== 'complete' || !sessionId) {
      throw new Error('That code did not finish sign-in.');
    }
    return sessionId;
  }

  const verified = await clerkFapiJson(
    request,
    pending.cookies,
    `v1/client/sign_ins/${pending.resourceId}/attempt_first_factor`,
    'POST',
    { strategy: 'phone_code', code: digits },
  );
  const response = signInFromEnvelope(verified.json) ?? verified.json;
  const sessionId =
    (typeof response.created_session_id === 'string' && response.created_session_id) ||
    (typeof response.createdSessionId === 'string' && response.createdSessionId) ||
    '';
  if (response.status !== 'complete' || !sessionId) {
    throw new Error('That code did not finish sign-in.');
  }
  return sessionId;
}

const CARD_LOGIN_COOKIE = 'card_login_pending';

function sealSecret(): string {
  return clerkSecretKey() || 'card-login-dev';
}

export function sealCardLoginPending(pending: CardLoginPending): string {
  const body = Buffer.from(JSON.stringify(pending)).toString('base64url');
  const sig = createHmac('sha256', sealSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function openCardLoginPending(raw: string | null | undefined): CardLoginPending | null {
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
    const pending = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CardLoginPending;
    if (!pending?.resourceId || !pending?.mode || pending.exp < Date.now()) return null;
    if (!pending.cookies || typeof pending.cookies !== 'object') return null;
    return pending;
  } catch {
    return null;
  }
}

export function cardLoginPendingCookie(pending: CardLoginPending): string {
  const sealed = sealCardLoginPending(pending);
  return `${CARD_LOGIN_COOKIE}=${sealed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`;
}

export function clearCardLoginPendingCookie(): string {
  return `${CARD_LOGIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export function readCardLoginPendingCookie(request: Request): CardLoginPending | null {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${CARD_LOGIN_COOKIE}=([^;]+)`));
  return openCardLoginPending(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export { clerkErrorCode };
