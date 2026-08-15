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
  sortWorkJobsForSidebar,
} from '../../../lib/workStore';
import { parseWorkJobInput } from '../../../lib/workJobInput';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  try {
    const auth = await requireDashboardUser(context);
    if (auth instanceof Response) return auth;

    const contactUid = context.url.searchParams.get('contact_uid')?.trim();
    const statusRaw = context.url.searchParams.get('status')?.trim().toLowerCase();
    const status = WORK_STATUSES.includes(statusRaw as (typeof WORK_STATUSES)[number])
      ? (statusRaw as (typeof WORK_STATUSES)[number])
      : undefined;

    const jobs = await storeListWork({
      contact_uid: contactUid || undefined,
      status,
    });
    const sorted = sortWorkJobsForSidebar(jobs);

    return jsonResponse({
      ok: true,
      jobs: sorted,
      statuses: WORK_STATUSES,
      priorities: WORK_PRIORITIES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[work] GET list error:', e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const parsed = await readJsonBody(context.request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const title = String(body.title ?? '').trim();
  const jobInput = parseWorkJobInput(body);
  if ('error' in jobInput) return jsonResponse({ ok: false, error: jobInput.error }, 400);

  let slug = String(body.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug && title) slug = slugFromTitle(title);

  if (!slug || !isSafeWorkSlug(slug)) {
    return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  }
  if (await storeReadWork(slug)) return jsonResponse({ ok: false, error: 'Slug already exists' }, 409);

  const result = await storeWriteWork(slug, { ...jobInput, record_origin: 'dashboard' });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, ...result.doc });
}
