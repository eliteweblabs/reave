/**
 * Shared helpers for Meta Instagram deauthorize / data-deletion callbacks.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../apiResponse';
import { checkInMemoryRateLimit } from '../inMemoryRateLimit';
import { clientIp } from '../clientIp';
import {
  instagramAppSecret,
  parseMetaSignedRequest,
  readMetaSignedRequest,
} from '../metaSignedRequest';
import { deleteSocialToken } from './tokenStore';

export async function authorizeInstagramMetaCallback(
  request: Request,
): Promise<{ ok: true; payload: Record<string, unknown> } | Response> {
  const rate = checkInMemoryRateLimit(`instagram-meta:${clientIp(request)}`, {
    windowMs: 60_000,
    maxPerWindow: 30,
  });
  if (!rate.ok) {
    return jsonResponse({ ok: false, error: 'Too many requests' }, 429);
  }

  const secret = instagramAppSecret();
  if (!secret) {
    return jsonResponse({ ok: false, error: 'Instagram app secret is not configured' }, 503);
  }

  const signedRequest = await readMetaSignedRequest(request);
  if (!signedRequest) {
    return jsonResponse({ ok: false, error: 'Missing signed_request' }, 400);
  }

  const payload = parseMetaSignedRequest(signedRequest, secret);
  if (!payload) {
    return jsonResponse({ ok: false, error: 'Invalid signed_request' }, 401);
  }

  return { ok: true, payload };
}

export async function handleInstagramTokenRemoval(
  context: APIContext,
): Promise<{ ok: true } | Response> {
  const auth = await authorizeInstagramMetaCallback(context.request);
  if (auth instanceof Response) return auth;

  try {
    await deleteSocialToken('instagram');
  } catch (e) {
    console.error('[social-oauth] Instagram token removal failed', e);
    return jsonResponse({ ok: false, error: 'Token removal failed' }, 500);
  }

  return { ok: true };
}
