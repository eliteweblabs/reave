/**
 * GET    /api/todos/:id — read one to-do
 * PATCH  /api/todos/:id — update { title?, due_date?, priority?, status? }
 * DELETE /api/todos/:id — remove to-do
 */

import type { APIContext } from 'astro';
import {
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  storeDeleteTodo,
  storeReadTodo,
  storeUpdateTodo,
} from '../../../lib/todoStore';

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

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isTodoDbConfigured()) return json({ ok: false, error: 'To-do DB not configured' }, 503);

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  const todo = await storeReadTodo(id);
  if (!todo) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, ...todo });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isTodoDbConfigured()) return json({ ok: false, error: 'To-do DB not configured' }, 503);

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const patch: {
    title?: string;
    due_date?: string | null;
    priority?: ReturnType<typeof normalizeTodoPriority>;
    status?: ReturnType<typeof normalizeTodoStatus>;
  } = {};

  if (body.title != null) patch.title = String(body.title).trim();
  if (body.due_date !== undefined) {
    patch.due_date =
      body.due_date == null || body.due_date === '' ? null : String(body.due_date).trim();
  }

  if (body.priority != null) {
    const priority = normalizeTodoPriority(body.priority);
    if (!priority) return json({ ok: false, error: 'Invalid priority' }, 400);
    patch.priority = priority;
  }

  if (body.status != null) {
    const status = normalizeTodoStatus(body.status);
    if (!status) return json({ ok: false, error: 'Invalid status' }, 400);
    patch.status = status;
  }

  const result = await storeUpdateTodo(id, patch);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return json({ ok: false, error: result.error }, status);
  }
  return json({ ok: true, ...result.todo });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isTodoDbConfigured()) return json({ ok: false, error: 'To-do DB not configured' }, 503);

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  const result = await storeDeleteTodo(id);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return json({ ok: false, error: result.error }, status);
  }
  return json({ ok: true, id, deleted: true });
}
