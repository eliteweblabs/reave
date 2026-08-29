/**
 * GET    /api/admin/knowledge/[slug]  — read one entry
 * PUT    /api/admin/knowledge/[slug]  — update (full replace of fields provided)
 * DELETE /api/admin/knowledge/[slug]  — remove from DB (bundled docs are unaffected)
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  storeReadKnowledge,
  storeWriteKnowledge,
  storeDeleteKnowledge,
} from '../../../../lib/knowledgeStore';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug ?? '';
  const doc = await storeReadKnowledge(slug);
  if (!doc) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, ...doc });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug ?? '';
  if (!slug) return jsonResponse({ ok: false, error: 'Missing slug' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const existing = await storeReadKnowledge(slug);
  const title = String(body.title ?? existing?.title ?? '').trim();
  const content = String(body.content ?? existing?.content ?? '').trim();
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : (existing?.tags ?? []);
  const source = String(body.source ?? existing?.source ?? 'manual');

  if (!title || !content) return jsonResponse({ ok: false, error: 'title and content are required' }, 400);

  const result = await storeWriteKnowledge({ slug, title, content, tags, source });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 503);
  return jsonResponse({ ok: true, slug, title });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug ?? '';
  if (!slug) return jsonResponse({ ok: false, error: 'Missing slug' }, 400);

  const result = await storeDeleteKnowledge(slug);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 503);
  return jsonResponse({ ok: true, slug, deleted: true });
}
