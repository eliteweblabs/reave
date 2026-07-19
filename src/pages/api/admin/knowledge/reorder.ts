/**
 * POST /api/admin/knowledge/reorder — persist manual knowledge sidebar order { slugs: string[] }
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { storeListKnowledge } from '../../../../lib/knowledgeStore';
import { storeGetSidebarOrder, storeReorderSidebarList, sortBySidebarOrder } from '../../../../lib/sidebarOrderStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = requireDashboardUser(context);
  if (auth instanceof Response) return auth;

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

  const result = await storeReorderSidebarList('knowledge', slugs);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const entries = await storeListKnowledge();
  const orderMap = await storeGetSidebarOrder('knowledge');
  const sorted = sortBySidebarOrder(
    entries,
    orderMap,
    (e) => e.slug,
    (a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    },
  );

  return json({ ok: true, entries: sorted });
}
