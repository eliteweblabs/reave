/**
 * GET  /api/c/:uid/punchlist — list shared punch-list items for this client
 * POST /api/c/:uid/punchlist — client adds an item (lands on staff to-do list)
 */

import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../../lib/features';
import { loadPortalContact } from '../../../../../lib/portalWorkAuth';
import { checkInMemoryRateLimit } from '../../../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../../../lib/clientIp';
import {
  isTodoDbConfigured,
  storeCreateTodo,
  storeListTodos,
} from '../../../../../lib/todoStore';
import {
  punchlistTitleFromInput,
  toPublicPunchlistItem,
} from '../../../../../lib/punchlist';
import { recordPunchlistItemEngagement } from '../../../../../lib/engagementNotifications';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function loadSharedList(uid: string) {
  if (!hasFeature('client_portal') || !isTodoDbConfigured()) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }
  const ctx = await loadPortalContact(uid);
  if (!ctx.ok) return ctx;
  const todos = await storeListTodos({ contact_uid: uid });
  return { ok: true as const, ctx, items: todos.map(toPublicPunchlistItem) };
}

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);
  const loaded = await loadSharedList(uid);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, loaded.status);
  return json({ ok: true, items: loaded.items });
};

export const POST: APIRoute = async ({ params, request }) => {
  const uid = (params.slug ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  if (!hasFeature('client_portal') || !isTodoDbConfigured()) {
    return json({ ok: false, error: 'Not found' }, 404);
  }

  const rate = checkInMemoryRateLimit(`punchlist:${uid}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 30,
  });
  if (!rate.ok) {
    return json({ ok: false, error: 'Too many items. Please try again later.' }, 429);
  }

  const ctx = await loadPortalContact(uid);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const title = punchlistTitleFromInput((body as Record<string, unknown>)?.title);
  if (!title) return json({ ok: false, error: 'title is required' }, 400);

  const result = await storeCreateTodo({
    title,
    contact_uid: uid,
    contact_name: ctx.contactName,
    created_by: 'client',
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  void recordPunchlistItemEngagement({
    contactUid: uid,
    contactName: ctx.contactName,
    title: result.todo.title,
    todoId: result.todo.id,
  });

  return json({ ok: true, item: toPublicPunchlistItem(result.todo) }, 201);
};
