/**
 * POST /api/work/reorder — persist manual project sidebar order { slugs: string[] }
 */

import type { APIContext } from 'astro';
import { sortWorkJobsForSidebar, storeListWork } from '../../../lib/workStore';
import { storeReorderSidebarList } from '../../../lib/sidebarOrderStore';

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

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const rawSlugs = body.slugs ?? body.ids;
  if (!Array.isArray(rawSlugs)) return json({ ok: false, error: 'slugs array required' }, 400);

  const slugs = rawSlugs.map((s) => String(s).trim()).filter(Boolean);
  if (slugs.length === 0) return json({ ok: false, error: 'slugs array required' }, 400);

  const result = await storeReorderSidebarList('work', slugs);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const jobs = await storeListWork();
  const sorted = sortWorkJobsForSidebar(jobs);

  return json({ ok: true, jobs: sorted });
}
