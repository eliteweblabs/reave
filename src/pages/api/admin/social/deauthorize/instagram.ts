/**
 * POST /api/admin/social/deauthorize/instagram
 *
 * Meta calls this when a user removes the REΛVE Instagram app. No Clerk
 * session — Meta's servers POST a signed_request. Drop the stored token.
 */
import type { APIContext } from 'astro';
import { deleteSocialToken } from '../../../../../lib/social/tokenStore.ts';

export const prerender = false;

export async function POST(_context: APIContext): Promise<Response> {
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
  return new Response(JSON.stringify({ ok: true, service: 'instagram-deauthorize' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
