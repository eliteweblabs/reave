/**
 * Verify Meta (Facebook / Instagram) `signed_request` payloads on deauthorize
 * and data-deletion callbacks.
 *
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '../serverEnv.ts';

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64');
}

export type MetaSignedRequestPayload = {
  algorithm?: string;
  expires?: number;
  issued_at?: number;
  user_id?: string;
};

export function verifyMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): { ok: true; payload: MetaSignedRequestPayload } | { ok: false; error: string } {
  const raw = signedRequest.trim();
  const secret = appSecret.trim();
  if (!raw || !secret) return { ok: false, error: 'missing signed_request or app secret' };

  const parts = raw.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid signed_request format' };

  const [encodedSig, encodedPayload] = parts;
  let sig: Buffer;
  let payloadBuf: Buffer;
  try {
    sig = base64UrlDecode(encodedSig);
    payloadBuf = base64UrlDecode(encodedPayload);
  } catch {
    return { ok: false, error: 'invalid signed_request encoding' };
  }

  const expected = createHmac('sha256', secret).update(encodedPayload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return { ok: false, error: 'invalid signature' };
  }

  let payload: MetaSignedRequestPayload;
  try {
    payload = JSON.parse(payloadBuf.toString('utf8')) as MetaSignedRequestPayload;
  } catch {
    return { ok: false, error: 'invalid payload' };
  }

  if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') {
    return { ok: false, error: 'unsupported algorithm' };
  }

  if (typeof payload.expires === 'number' && payload.expires * 1000 < Date.now()) {
    return { ok: false, error: 'expired signed_request' };
  }

  return { ok: true, payload };
}

/** Read `signed_request` from Meta's typical x-www-form-urlencoded POST body. */
export async function readMetaSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    const value = form.get('signed_request');
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as { signed_request?: unknown };
      return typeof body.signed_request === 'string' && body.signed_request.trim()
        ? body.signed_request.trim()
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

export function instagramAppSecret(): string | null {
  return serverEnv('INSTAGRAM_APP_SECRET')?.trim() || null;
}

/**
 * Verify a Meta callback signed with INSTAGRAM_APP_SECRET.
 * Returns a JSON error Response when verification fails; null when OK.
 */
export async function authorizeInstagramMetaCallback(
  request: Request,
): Promise<Response | null> {
  const secret = instagramAppSecret();
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: 'INSTAGRAM_APP_SECRET not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const signedRequest = await readMetaSignedRequest(request);
  if (!signedRequest) {
    return new Response(JSON.stringify({ ok: false, error: 'missing signed_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const verified = verifyMetaSignedRequest(signedRequest, secret);
  if (!verified.ok) {
    return new Response(JSON.stringify({ ok: false, error: verified.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return null;
}

/** Build a signed_request for tests (same algorithm Meta uses). */
export function createMetaSignedRequestForTest(
  payload: MetaSignedRequestPayload,
  appSecret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', appSecret).update(encodedPayload).digest('base64url');
  return `${signature}.${encodedPayload}`;
}
