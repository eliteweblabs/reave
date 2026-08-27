/**
 * POST /api/admin/social/deauthorize/instagram
 *
 * Meta calls this when a user removes the reΛVe.app Instagram app. No Clerk
 * session — Meta's servers POST a signed_request. Drop the stored token.
 */
import type { APIContext } from 'astro';
import { deleteSocialToken } from '../../../../../lib/social/tokenStore.ts';
import { authorizeInstagramMetaCallback } from '../../../../../lib/social/metaSignedRequest.ts';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const authError = await authorizeInstagramMetaCallback(context.request);
  if (authError) return authError;

  try {
    await deleteSocialToken('instagram');
  } catch (e) {
    console.error('[social-oauth] Instagram deauthorize failed', e);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(): Promise<Response> {
  return new Response('Not found', { status: 404 });
}
