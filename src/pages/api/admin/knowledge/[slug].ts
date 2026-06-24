/**
 * GET    /api/admin/knowledge/[slug]  — read one entry
 * PUT    /api/admin/knowledge/[slug]  — update (full replace of fields provided)
 * DELETE /api/admin/knowledge/[slug]  — remove from DB (bundled docs are unaffected)
 */

import type { APIContext } from 'astro';
import {
  storeReadKnowledge,
  storeWriteKnowledge,
  storeDeleteKnowledge,
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

  const slug = context.params.slug ?? '';
  const doc = await storeReadKnowledge(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, ...doc });
}

export async function PUT(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug ?? '';
  if (!slug) return json({ ok: false, error: 'Missing slug' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const existing = await storeReadKnowledge(slug);
  const title = String(body.title ?? existing?.title ?? '').trim();
  const content = String(body.content ?? existing?.content ?? '').trim();
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : (existing?.tags ?? []);
  const source = String(body.source ?? existing?.source ?? 'manual');

  if (!title || !content) return json({ ok: false, error: 'title and content are required' }, 400);

  const result = await storeWriteKnowledge({ slug, title, content, tags, source });
  if (!result.ok) return json({ ok: false, error: result.error }, 503);
  return json({ ok: true, slug, title });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug ?? '';
  if (!slug) return json({ ok: false, error: 'Missing slug' }, 400);

  const result = await storeDeleteKnowledge(slug);
  if (!result.ok) return json({ ok: false, error: result.error }, 503);
  return json({ ok: true, slug, deleted: true });
}
