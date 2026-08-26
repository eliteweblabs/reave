/**
 * PATCH  /api/hub/punchlist/:id — rename or complete an install punch-list item
 * DELETE /api/hub/punchlist/:id — remove an item this install added
 */

import type { APIRoute } from 'astro';
import { clientIp } from '../../../../lib/clientIp';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';
import { normalizeTodoStatus } from '../../../../lib/todoStore';
import {
  deleteHubPunchlistItem,
  isPunchlistHubHost,
  updateHubPunchlistItem,
  verifyPunchlistHubAuth,
} from '../../../../lib/punchlistHub';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export const PATCH: APIRoute = async ({ params, request }) => {
  if (!isPunchlistHubHost()) return json({ ok: false, error: 'Not found' }, 404);
  const id = parseId(params.id);
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const rate = checkInMemoryRateLimit(`hub-punchlist-edit:${auth.slug}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 40,
  });
  if (!rate.ok) return json({ ok: false, error: 'Too many updates. Please try again later.' }, 429);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const status = body.status !== undefined ? normalizeTodoStatus(body.status) : undefined;
  if (body.status !== undefined && !status) {
    return json({ ok: false, error: 'Invalid status' }, 400);
  }

  const result = await updateHubPunchlistItem({
    slug: auth.slug,
    id,
    title: body.title !== undefined ? String(body.title) : undefined,
    status,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, item: result.item });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!isPunchlistHubHost()) return json({ ok: false, error: 'Not found' }, 404);
  const id = parseId(params.id);
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const rate = checkInMemoryRateLimit(`hub-punchlist-del:${auth.slug}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 20,
  });
  if (!rate.ok) return json({ ok: false, error: 'Too many deletions. Please try again later.' }, 429);

  const result = await deleteHubPunchlistItem({ slug: auth.slug, id });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, id, deleted: true });
};
