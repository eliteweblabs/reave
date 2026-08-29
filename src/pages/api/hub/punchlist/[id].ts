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
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export const PATCH: APIRoute = async ({ params, request }) => {
  if (!isPunchlistHubHost()) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  const id = parseId(params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const rate = checkInMemoryRateLimit(`hub-punchlist-edit:${auth.slug}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 40,
  });
  if (!rate.ok) return jsonResponse({ ok: false, error: 'Too many updates. Please try again later.' }, 429);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const status = body.status !== undefined ? normalizeTodoStatus(body.status) : undefined;
  if (body.status !== undefined && !status) {
    return jsonResponse({ ok: false, error: 'Invalid status' }, 400);
  }

  const result = await updateHubPunchlistItem({
    slug: auth.slug,
    id,
    title: body.title !== undefined ? String(body.title) : undefined,
    status,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status);
  return jsonResponse({ ok: true, item: result.item });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!isPunchlistHubHost()) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  const id = parseId(params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const rate = checkInMemoryRateLimit(`hub-punchlist-del:${auth.slug}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 20,
  });
  if (!rate.ok) return jsonResponse({ ok: false, error: 'Too many deletions. Please try again later.' }, 429);

  const result = await deleteHubPunchlistItem({ slug: auth.slug, id });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status);
  return jsonResponse({ ok: true, id, deleted: true });
};
