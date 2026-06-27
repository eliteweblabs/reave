/**
 * GET  /api/work/[slug]/comments — list portal-visible comments on a job
 * POST /api/work/[slug]/comments — add a staff reply { text }
 */

import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import { storeAddWorkComment, storeListWorkComments } from '../../../../lib/workComments';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const comments = await storeListWorkComments(slug);
  return json({ ok: true, comments });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const text = typeof body.text === 'string' ? body.text : '';
  const authorName = typeof body.authorName === 'string' && body.authorName.trim()
    ? body.authorName.trim()
    : 'Team';

  const result = await storeAddWorkComment(slug, {
    author: 'staff',
    authorName,
    text,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, comment: result.comment });
}
