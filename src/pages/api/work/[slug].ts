/**
 * GET    /api/work/[slug] — read one job file
 * PUT    /api/work/[slug] — update { title, contact_uid, status?, body? }
 * DELETE /api/work/[slug] — remove file
 */

import type { APIContext } from 'astro';
import {
  fileDeleteWork,
  fileReadWork,
  fileWriteWork,
  isSafeWorkSlug,
} from '../../../lib/workStore';
import { parseWorkJobInput } from '../../../lib/workJobInput';

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
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const doc = fileReadWork(slug);
  if (!doc) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, ...doc });
}

export async function PUT(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!fileReadWork(slug)) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const parsed = parseWorkJobInput(body);
  if ('error' in parsed) return json({ ok: false, error: parsed.error }, 400);

  const existing = fileReadWork(slug)!;
  const result = await fileWriteWork(slug, { ...parsed, source: existing.source });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, ...result.doc });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  if (!fileDeleteWork(slug)) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, slug, deleted: true });
}
