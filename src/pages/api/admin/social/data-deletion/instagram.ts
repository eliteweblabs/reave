/**
 * POST /api/admin/social/data-deletion/instagram
 *
 * Meta data-deletion callback. Drops the stored Instagram token and returns
 * the confirmation payload Meta's dashboard expects.
 */
import { randomBytes } from 'node:crypto';
import type { APIContext } from 'astro';
import { requestOrigin } from '../../../../../lib/requestOrigin.ts';
import { deleteSocialToken } from '../../../../../lib/social/tokenStore.ts';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  try {
    await deleteSocialToken('instagram');
  } catch (e) {
    console.error('[social-oauth] Instagram data deletion failed', e);
  }
  const confirmation = randomBytes(8).toString('hex');
  const origin = requestOrigin(context.request);
  return new Response(
    JSON.stringify({
      url: `${origin.replace(/\/+$/, '')}/privacy`,
      confirmation_code: confirmation,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    },
  );
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, service: 'instagram-data-deletion' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
