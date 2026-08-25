/**
 * POST /api/admin/social/data-deletion/instagram
 *
 * Meta data-deletion callback. Drops the stored Instagram token and returns
 * the confirmation payload Meta's dashboard expects.
 */
import { randomBytes } from 'node:crypto';
import type { APIContext } from 'astro';
import { jsonResponse } from '../../../../../lib/apiResponse';
import { requestOrigin } from '../../../../../lib/requestOrigin';
import { handleInstagramTokenRemoval } from '../../../../../lib/social/instagramCallbacks';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const result = await handleInstagramTokenRemoval(context);
  if (result instanceof Response) return result;

  const confirmation = randomBytes(8).toString('hex');
  const origin = requestOrigin(context.request);
  return jsonResponse({
    url: `${origin.replace(/\/+$/, '')}/privacy`,
    confirmation_code: confirmation,
  });
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 404 });
}
