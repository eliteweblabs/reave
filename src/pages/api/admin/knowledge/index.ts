/**
 * GET  /api/admin/knowledge        — list all entries
 * POST /api/admin/knowledge        — create or update (upsert by slug)
 * POST /api/admin/knowledge?seed=1 — import all bundled docs into DB (safe: skips existing)
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  storeListKnowledge,
  storeWriteKnowledge,
  storeSeedBundled,
  isKnowledgeDbConfigured,
} from '../../../../lib/knowledgeStore';
import { storeGetSidebarOrder, sortBySidebarOrder } from '../../../../lib/sidebarOrderStore';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

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
  return jsonResponse({ ok: true, entries: sorted, db: isKnowledgeDbConfigured() });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);

  if (url.searchParams.get('seed') === '1') {
    if (!isKnowledgeDbConfigured()) {
      return jsonResponse({ ok: false, error: 'Knowledge DB not configured — set DATABASE_URL on Railway' }, 503);
    }
    const result = await storeSeedBundled();
    return jsonResponse({ ok: true, ...result });
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const slug = String(body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : [];
  const source = String(body.source ?? 'manual');

  if (!slug || !title || !content) {
    return jsonResponse({ ok: false, error: 'slug, title, and content are required' }, 400);
  }

  const result = await storeWriteKnowledge({ slug, title, content, tags, source });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 503);
  return jsonResponse({ ok: true, slug, title });
}
