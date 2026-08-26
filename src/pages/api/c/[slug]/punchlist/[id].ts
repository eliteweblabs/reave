/**
 * PATCH  /api/c/:uid/punchlist/:id — toggle or rename a shared item
 * DELETE /api/c/:uid/punchlist/:id — remove an item the client added
 */

import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../../lib/features';
import { loadPortalContact } from '../../../../../lib/portalWorkAuth';
import { checkInMemoryRateLimit } from '../../../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../../../lib/clientIp';
import {
  isTodoDbConfigured,
  normalizeTodoStatus,
  storeDeleteTodo,
  storeReadTodo,
  storeUpdateTodo,
} from '../../../../../lib/todoStore';
import {
  canClientEditPunchlistItem,
  punchlistTitleFromInput,
  toPublicPunchlistItem,
} from '../../../../../lib/punchlist';

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

async function loadOwnedItem(contactUid: string, id: number) {
  if (!hasFeature('client_portal') || !isTodoDbConfigured()) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }
  const ctx = await loadPortalContact(contactUid);
  if (!ctx.ok) return ctx;
  const todo = await storeReadTodo(id);
  if (!todo || todo.contact_uid !== contactUid) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }
  return { ok: true as const, todo };
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const uid = (params.slug ?? '').trim();
  const id = parseId(params.id);
  if (!uid || !id) return json({ ok: false, error: 'Not found' }, 404);

  const rate = checkInMemoryRateLimit(`punchlist-edit:${uid}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 40,
  });
  if (!rate.ok) {
    return json({ ok: false, error: 'Too many updates. Please try again later.' }, 429);
  }

  const loaded = await loadOwnedItem(uid, id);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, loaded.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const patch: { title?: string; status?: ReturnType<typeof normalizeTodoStatus> } = {};

  if (raw.title !== undefined) {
    if (!canClientEditPunchlistItem(loaded.todo)) {
      return json({ ok: false, error: 'You can only edit items you added.' }, 403);
    }
    const title = punchlistTitleFromInput(raw.title);
    if (!title) return json({ ok: false, error: 'title is required' }, 400);
    patch.title = title;
  }

  if (raw.status !== undefined) {
    const status = normalizeTodoStatus(raw.status);
    if (!status) return json({ ok: false, error: 'Invalid status' }, 400);
    patch.status = status;
  }

  if (patch.title == null && patch.status == null) {
    return json({ ok: false, error: 'Nothing to update' }, 400);
  }

  const result = await storeUpdateTodo(id, patch);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return json({ ok: false, error: result.error }, status);
  }
  return json({ ok: true, item: toPublicPunchlistItem(result.todo) });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const uid = (params.slug ?? '').trim();
  const id = parseId(params.id);
  if (!uid || !id) return json({ ok: false, error: 'Not found' }, 404);

  const rate = checkInMemoryRateLimit(`punchlist-del:${uid}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 20,
  });
  if (!rate.ok) {
    return json({ ok: false, error: 'Too many deletions. Please try again later.' }, 429);
  }

  const loaded = await loadOwnedItem(uid, id);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, loaded.status);
  if (!canClientEditPunchlistItem(loaded.todo)) {
    return json({ ok: false, error: 'You can only remove items you added.' }, 403);
  }

  const result = await storeDeleteTodo(id);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return json({ ok: false, error: result.error }, status);
  }
  return json({ ok: true, id, deleted: true });
};
