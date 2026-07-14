/**
 * GET  /api/admin/knowledge        — list all entries (repo + plugin + client)
 * POST /api/admin/knowledge        — create client knowledge (Postgres only)
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  storeListKnowledge,
  storeWriteKnowledge,
  isKnowledgeDbConfigured,
} from '../../../../lib/knowledgeStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const entries = await storeListKnowledge();
  return json({ ok: true, entries, db: isKnowledgeDbConfigured() });
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

  const slug = String(body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : [];

  if (!slug || !title || !content) {
    return json({ ok: false, error: 'slug, title, and content are required' }, 400);
  }

  const result = await storeWriteKnowledge({ slug, title, content, tags, source: 'manual' });
  if (!result.ok) {
    const status = result.error?.includes('reserved') ? 409 : 503;
    return json({ ok: false, error: result.error }, status);
  }
  return json({ ok: true, slug, title, source: 'client' });
}
