/**
 * GET  /api/work — list job markdown files (src/knowledge/jobs/*.md)
 * POST /api/work — create { slug?, title, client, status?, body? }
 */

import type { APIContext } from 'astro';
import {
  fileListWork,
  fileReadWork,
  fileWriteWork,
  isSafeWorkSlug,
  slugFromTitle,
  WORK_STATUSES,
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
  return json({ ok: true, jobs: fileListWork(), statuses: WORK_STATUSES });
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

  const title = String(body.title ?? '').trim();
  const parsed = parseWorkJobInput(body);
  if ('error' in parsed) return json({ ok: false, error: parsed.error }, 400);

  let slug = String(body.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug && title) slug = slugFromTitle(title);

  if (!slug || !isSafeWorkSlug(slug)) {
    return json({ ok: false, error: 'Invalid slug' }, 400);
  }
  if (fileReadWork(slug)) return json({ ok: false, error: 'Slug already exists' }, 409);

  const result = await fileWriteWork(slug, parsed);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, ...result.doc });
}
