/**
 * GET  /api/knowledge — list knowledge entries (Postgres + bundled playbooks)
 * POST /api/knowledge — create { slug, title, content, tags? }
 *
 * @deprecated Prefer /api/admin/knowledge — this route proxies the same store for compatibility.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  storeListKnowledge,
  storeReadKnowledge,
  storeWriteKnowledge,
  isKnowledgeDbConfigured,
} from '../../../lib/knowledgeStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

const SLUG_RE = /^[a-z0-9._-]+$/i;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const entries = await storeListKnowledge();
  return jsonResponse({
    ok: true,
    db: isKnowledgeDbConfigured(),
    entries: entries.map((e) => ({
      slug: e.slug,
      title: e.title,
      preview: e.preview,
      source: e.source,
      editable: e.editable,
    })),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const slug = String(body.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : [];

  if (!slug || !SLUG_RE.test(slug)) {
    return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  }
  if (!title || !content) {
    return jsonResponse({ ok: false, error: 'title and content are required' }, 400);
  }

  const existing = await storeReadKnowledge(slug);
  if (existing?.source === 'bundled' && !existing.editable) {
    return jsonResponse({ ok: false, error: 'Module playbooks cannot be overwritten' }, 403);
  }
  if (existing && existing.source === 'db') {
    return jsonResponse({ ok: false, error: 'Slug already exists — use PUT /api/knowledge/[slug]' }, 409);
  }

  const result = await storeWriteKnowledge({ slug, title, content, tags, source: 'manual' });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 503);
  return jsonResponse({ ok: true, slug, title });
}
