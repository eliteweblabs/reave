/**
 * GET    /api/knowledge/[slug] — read one file
 * PUT    /api/knowledge/[slug] — update { content }
 * DELETE /api/knowledge/[slug] — remove file
 */

import type { APIContext } from 'astro';
import {
  fileDeleteKnowledge,
  fileReadKnowledge,
  fileWriteKnowledge,
  isSafeKnowledgeSlug,
} from '../../../lib/fileKnowledge';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeKnowledgeSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const doc = fileReadKnowledge(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, ...doc });
}

export async function PUT(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeKnowledgeSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!fileReadKnowledge(slug)) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const content = String(body.content ?? '').trim();
  if (!content) return json({ ok: false, error: 'content is required' }, 400);

  const doc = fileWriteKnowledge(slug, content);
  if (!doc) return json({ ok: false, error: 'Failed to save' }, 500);
  return json({ ok: true, ...doc });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeKnowledgeSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  if (!fileDeleteKnowledge(slug)) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, slug, deleted: true });
}
