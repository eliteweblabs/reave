/**
 * POST /api/work/[slug]/comments/ack — mark all pending client comments on a project as seen.
 */

import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';
import { storeAckWorkCommentsForSlug } from '../../../../../lib/workComments';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const result = await storeAckWorkCommentsForSlug(slug);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, acked: result.acked });
}
