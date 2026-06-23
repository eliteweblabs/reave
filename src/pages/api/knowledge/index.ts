/**
 * GET  /api/knowledge — list markdown knowledge files (src/knowledge/*.md)
 * POST /api/knowledge — create { slug, content }
 */

import type { APIContext } from 'astro';
import {
  fileListKnowledge,
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
  return json({ ok: true, entries: fileListKnowledge() });
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

  const slug = String(body.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  const content = String(body.content ?? '').trim();

  if (!slug || !isSafeKnowledgeSlug(slug)) {
    return json({ ok: false, error: 'Invalid slug' }, 400);
  }
  if (!content) return json({ ok: false, error: 'content is required' }, 400);
  if (fileReadKnowledge(slug)) return json({ ok: false, error: 'Slug already exists' }, 409);

  const doc = fileWriteKnowledge(slug, content);
  if (!doc) return json({ ok: false, error: 'Failed to create' }, 500);
  return json({ ok: true, ...doc });
}
