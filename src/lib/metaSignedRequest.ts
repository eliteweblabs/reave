/**
 * Parse and verify Meta (Facebook / Instagram) `signed_request` payloads.
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from './serverEnv';

function base64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64');
}

/** Instagram Login app secret — falls back to Meta app secret when shared. */
export function instagramAppSecret(): string | null {
  return (
    serverEnv('INSTAGRAM_APP_SECRET')?.trim() ||
    serverEnv('META_APP_SECRET')?.trim() ||
    null
  );
}

/**
 * Verify HMAC-SHA256 signature and return the decoded JSON payload.
 * Returns null when the signature is invalid or the algorithm is unsupported.
 */
export function parseMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): Record<string, unknown> | null {
  const trimmed = signedRequest.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0) return null;

  const encodedSig = trimmed.slice(0, dot);
  const payload = trimmed.slice(dot + 1);
  if (!encodedSig || !payload) return null;

  let sig: Buffer;
  try {
    sig = base64UrlToBuffer(encodedSig);
  } catch {
    return null;
  }

  const expectedSig = createHmac('sha256', appSecret).update(payload).digest();
  if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(base64UrlToBuffer(payload).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  const algorithm = String(data.algorithm ?? '').toUpperCase();
  if (algorithm && algorithm !== 'HMAC-SHA256') return null;

  return data;
}

/** Read `signed_request` from Meta's form-encoded POST body. */
export async function readMetaSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') || '';
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    const value = form.get('signed_request');
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  const text = await request.text();
  if (!text.trim()) return null;
  const params = new URLSearchParams(text);
  const value = params.get('signed_request');
  return value?.trim() || null;
}
