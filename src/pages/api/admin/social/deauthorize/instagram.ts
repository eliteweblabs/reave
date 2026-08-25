/**
 * POST /api/admin/social/deauthorize/instagram
 *
 * Meta calls this when a user removes the REΛVE Instagram app. No Clerk
 * session — Meta's servers POST a signed_request. Drop the stored token.
 */
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../../lib/apiResponse';
import { handleInstagramTokenRemoval } from '../../../../../lib/social/instagramCallbacks';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const result = await handleInstagramTokenRemoval(context);
  if (result instanceof Response) return result;
  return jsonResponse({ ok: true });
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 404 });
}
