/**
 * GET    /api/knowledge/[slug] — read one entry
 * PUT    /api/knowledge/[slug] — update { title?, content?, tags? }
 * DELETE /api/knowledge/[slug] — remove DB entry (bundled playbooks cannot be deleted)
 *
 * @deprecated Prefer /api/admin/knowledge — this route proxies the same store for compatibility.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  storeReadKnowledge,
  storeWriteKnowledge,
  storeDeleteKnowledge,
} from '../../../lib/knowledgeStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

const SLUG_RE = /^[a-z0-9._-]+$/i;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !SLUG_RE.test(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  const doc = await storeReadKnowledge(slug);
  if (!doc) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, ...doc });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !SLUG_RE.test(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  const existing = await storeReadKnowledge(slug);
  if (!existing) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  if (!existing.editable) {
    return jsonResponse({ ok: false, error: 'Bundled module playbooks cannot be edited via API' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const title = String(body.title ?? existing.title).trim();
  const content = String(body.content ?? existing.content).trim();
  const tags = Array.isArray(body.tags)
    ? (body.tags as unknown[]).map(String)
    : (existing.tags ?? []);

  if (!title || !content) {
    return jsonResponse({ ok: false, error: 'title and content are required' }, 400);
  }

  const result = await storeWriteKnowledge({ slug, title, content, tags, source: 'manual' });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 503);
  return jsonResponse({ ok: true, slug, title });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !SLUG_RE.test(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  const existing = await storeReadKnowledge(slug);
  if (!existing) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  if (!existing.editable || existing.source !== 'db') {
    return jsonResponse({ ok: false, error: 'Only custom DB entries can be deleted' }, 403);
  }

  const result = await storeDeleteKnowledge(slug);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.error === 'Not found' ? 404 : 503);
  return jsonResponse({ ok: true, slug, deleted: true });
}
