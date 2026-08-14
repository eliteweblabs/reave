/**
 * POST /api/todos/reorder — persist manual list order { ids: number[] }
 */

import { createReorderPostHandler } from '../../../lib/api/reorderHandler';
import { jsonResponse } from '../../../lib/apiResponse';
import { isTodoDbConfigured, storeReorderTodos } from '../../../lib/todoStore';

export const prerender = false;

export const POST = createReorderPostHandler({
  field: 'ids',
  parse: (raw) =>
    raw
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  beforeReorder: () =>
    isTodoDbConfigured()
      ? null
      : jsonResponse({ ok: false, error: 'To-do DB not configured' }, 503),
  reorder: async (ids) => {
    const result = await storeReorderTodos(ids);
    if (!result.ok) return result;
    return { ok: true as const, result: result.todos };
  },
  success: (_context, _auth, todos) =>
    jsonResponse({ ok: true, todos: todos ?? [], count: todos?.length ?? 0 }),
});
