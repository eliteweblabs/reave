/**
 * GET  /api/admin/knowledge        — list all entries
 * POST /api/admin/knowledge        — create or update (upsert by slug)
 * POST /api/admin/knowledge?seed=1 — import all bundled docs into DB (safe: skips existing)
 */

import type { APIContext } from 'astro';
import {
  storeListKnowledge,
  storeWriteKnowledge,
  storeSeedBundled,
  isSupabaseKnowledgeConfigured,
} from '../../../../lib/knowledgeStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const entries = await storeListKnowledge();
  return json({ ok: true, entries, db: isSupabaseKnowledgeConfigured() });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const url = new URL(context.request.url);

  if (url.searchParams.get('seed') === '1') {
    if (!isSupabaseKnowledgeConfigured()) {
      return json({ ok: false, error: 'Supabase not configured — add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' }, 503);
    }
    const result = await storeSeedBundled();
    return json({ ok: true, ...result });
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const slug = String(body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : [];
  const source = String(body.source ?? 'manual');

  if (!slug || !title || !content) {
    return json({ ok: false, error: 'slug, title, and content are required' }, 400);
  }

  const result = await storeWriteKnowledge({ slug, title, content, tags, source });
  if (!result.ok) return json({ ok: false, error: result.error }, 503);
  return json({ ok: true, slug, title });
}
