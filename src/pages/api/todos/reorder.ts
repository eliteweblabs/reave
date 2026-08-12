/**
 * POST /api/todos/reorder — persist manual list order { ids: number[] }
 */

import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { isTodoDbConfigured, storeReorderTodos } from '../../../lib/todoStore';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
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
