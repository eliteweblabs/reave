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
  type WorkStatus,
} from '../../../lib/workStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseStatus(raw: unknown): WorkStatus | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  return WORK_STATUSES.includes(s as WorkStatus) ? (s as WorkStatus) : undefined;
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
  const client = String(body.client ?? '').trim();
  const jobBody = String(body.body ?? '').trim();
  const status = parseStatus(body.status);

  let slug = String(body.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug && title) slug = slugFromTitle(title);

  if (!slug || !isSafeWorkSlug(slug)) {
    return json({ ok: false, error: 'Invalid slug' }, 400);
  }
  if (!title) return json({ ok: false, error: 'title is required' }, 400);
  if (!client) return json({ ok: false, error: 'client is required' }, 400);
  if (fileReadWork(slug)) return json({ ok: false, error: 'Slug already exists' }, 409);

  const result = await fileWriteWork(slug, { title, client, status, body: jobBody });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, ...result.doc });
}
