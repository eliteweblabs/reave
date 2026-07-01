/**
 * GET    /api/work/[slug] — read one job file
 * PUT    /api/work/[slug] — update { title, contact_uid, status?, body? }
 * DELETE /api/work/[slug] — remove file
 */

import type { APIContext } from 'astro';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeDeleteWork,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  WORK_STATUSES,
} from '../../../lib/workStore';
import { parseWorkJobInput } from '../../../lib/workJobInput';
import { listRelatedForJob } from '../../../lib/projectLinks';
import { listTrackedLinksForJob } from '../../../lib/linkTracking';

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

  const doc = await storeReadWork(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);
  const related = await listRelatedForJob(slug);
  const tracked_links = await listTrackedLinksForJob(slug, { limit: 5 });
  return json({ ok: true, ...doc, related, tracked_links });
}

export async function PUT(context: APIContext): Promise<Response> {
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

  const parsed = parseWorkJobInput(body);
  if ('error' in parsed) return json({ ok: false, error: parsed.error }, 400);

  const existing = (await storeReadWork(slug))!;
  const result = await storeWriteWork(slug, { ...parsed, record_origin: existing.record_origin ?? 'dashboard' });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, ...result.doc });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  if (!(await storeDeleteWork(slug))) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, slug, deleted: true });
}
