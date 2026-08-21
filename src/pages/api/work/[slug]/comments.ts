/**
 * GET  /api/work/[slug]/comments — list portal-visible comments on a job
 * POST /api/work/[slug]/comments — add a staff reply { text }
 */

import type { APIContext } from 'astro';
import { isSafeWorkSlug, storeReadWork } from '../../../../lib/workStore';
import { storeAddWorkComment, storeListWorkComments } from '../../../../lib/workComments';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const comments = await storeListWorkComments(slug);
  return jsonResponse({ ok: true, comments });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
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
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, comment: result.comment });
}
