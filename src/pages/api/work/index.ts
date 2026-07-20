/**
 * GET  /api/work — list job markdown files (src/knowledge/jobs/*.md)
 * POST /api/work — create { slug?, title, client, status?, body? }
 */

import type { APIContext } from 'astro';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  WORK_PRIORITIES,
  WORK_STATUSES,
  compareWorkByRecency,
} from '../../../lib/workStore';
import { parseWorkJobInput } from '../../../lib/workJobInput';
import { storeGetSidebarOrder, sortBySidebarOrder } from '../../../lib/sidebarOrderStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  try {
    const { userId } = context.locals.auth();
    if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

    const contactUid = context.url.searchParams.get('contact_uid')?.trim();
    const statusRaw = context.url.searchParams.get('status')?.trim().toLowerCase();
    const status = WORK_STATUSES.includes(statusRaw as (typeof WORK_STATUSES)[number])
      ? (statusRaw as (typeof WORK_STATUSES)[number])
      : undefined;

    const jobs = await storeListWork({
      contact_uid: contactUid || undefined,
      status,
    });
    const orderMap = await storeGetSidebarOrder('work');
    const sorted = sortBySidebarOrder(jobs, orderMap, (j) => j.slug, compareWorkByRecency);

    return json({
      ok: true,
      jobs: sorted,
      statuses: WORK_STATUSES,
      priorities: WORK_PRIORITIES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[work] GET list error:', e);
    return json({ ok: false, error: msg }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const title = String(body.title ?? '').trim();
  const parsed = parseWorkJobInput(body);
  if ('error' in parsed) return json({ ok: false, error: parsed.error }, 400);

  let slug = String(body.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug && title) slug = slugFromTitle(title);

  if (!slug || !isSafeWorkSlug(slug)) {
    return json({ ok: false, error: 'Invalid slug' }, 400);
  }
  if (await storeReadWork(slug)) return json({ ok: false, error: 'Slug already exists' }, 409);

  const result = await storeWriteWork(slug, { ...parsed, record_origin: 'dashboard' });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, ...result.doc });
}
