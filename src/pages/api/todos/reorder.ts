/**
 * POST /api/todos/reorder — persist manual list order { ids: number[] }
 */

import type { APIContext } from 'astro';
import { isTodoDbConfigured, storeReorderTodos } from '../../../lib/todoStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isTodoDbConfigured()) return json({ ok: false, error: 'To-do DB not configured' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const rawIds = body.ids;
  if (!Array.isArray(rawIds)) return json({ ok: false, error: 'ids array required' }, 400);

  const ids = rawIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return json({ ok: false, error: 'ids array required' }, 400);

  const result = await storeReorderTodos(ids);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, todos: result.todos, count: result.todos.length });
}
