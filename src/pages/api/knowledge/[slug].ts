/**
 * GET    /api/knowledge/[slug] — read one file
 * PUT    /api/knowledge/[slug] — update { content }
 * DELETE /api/knowledge/[slug] — remove file
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  fileDeleteKnowledge,
  fileReadKnowledge,
  fileWriteKnowledge,
  isSafeKnowledgeSlug,
} from '../../../lib/fileKnowledge';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeKnowledgeSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  const doc = fileReadKnowledge(slug);
  if (!doc) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, ...doc });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeKnowledgeSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!fileReadKnowledge(slug)) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const content = String(body.content ?? '').trim();
  if (!content) return jsonResponse({ ok: false, error: 'content is required' }, 400);

  const doc = fileWriteKnowledge(slug, content);
  if (!doc) return jsonResponse({ ok: false, error: 'Failed to save' }, 500);
  return jsonResponse({ ok: true, ...doc });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeKnowledgeSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);

  if (!fileDeleteKnowledge(slug)) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, slug, deleted: true });
}
