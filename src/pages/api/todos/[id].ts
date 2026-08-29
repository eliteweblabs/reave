/**
 * GET    /api/todos/:id — read one to-do
 * PATCH  /api/todos/:id — update { title?, due_date?, priority?, status? }
 * DELETE /api/todos/:id — remove to-do
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  storeDeleteTodo,
  storeReadTodo,
  storeUpdateTodo,
} from '../../../lib/todoStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!isTodoDbConfigured()) return jsonResponse({ ok: false, error: 'To-do DB not configured' }, 503);

  const id = parseId(context.params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Invalid id' }, 400);

  const todo = await storeReadTodo(id);
  if (!todo) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, ...todo });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!isTodoDbConfigured()) return jsonResponse({ ok: false, error: 'To-do DB not configured' }, 503);

  const id = parseId(context.params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Invalid id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const patch: {
    title?: string;
    due_date?: string | null;
    priority?: ReturnType<typeof normalizeTodoPriority>;
    status?: ReturnType<typeof normalizeTodoStatus>;
    job_slug?: string | null;
    assignee?: string | null;
    section?: string | null;
    contact_uid?: string | null;
    contact_name?: string | null;
    sort_order?: number;
  } = {};

  if (body.title != null) patch.title = String(body.title).trim();
  if (body.due_date !== undefined) {
    patch.due_date =
      body.due_date == null || body.due_date === '' ? null : String(body.due_date).trim();
  }

  if (body.priority != null) {
    const priority = normalizeTodoPriority(body.priority);
    if (!priority) return jsonResponse({ ok: false, error: 'Invalid priority' }, 400);
    patch.priority = priority;
  }

  if (body.status != null) {
    const status = normalizeTodoStatus(body.status);
    if (!status) return jsonResponse({ ok: false, error: 'Invalid status' }, 400);
    patch.status = status;
  }

  if (body.job_slug !== undefined) {
    patch.job_slug =
      body.job_slug == null || body.job_slug === '' ? null : String(body.job_slug).trim();
  }
  if (body.assignee !== undefined) {
    patch.assignee =
      body.assignee == null || body.assignee === '' ? null : String(body.assignee).trim();
  }
  if (body.section !== undefined) {
    patch.section =
      body.section == null || body.section === '' ? null : String(body.section).trim();
  }
  if (body.contact_uid !== undefined) {
    patch.contact_uid =
      body.contact_uid == null || body.contact_uid === ''
        ? null
        : String(body.contact_uid).trim();
  }
  if (body.contact_name !== undefined) {
    patch.contact_name =
      body.contact_name == null || body.contact_name === ''
        ? null
        : String(body.contact_name).trim();
  }
  if (patch.contact_uid && !patch.contact_name) {
    const { labelForTodoContact } = await import('../../../lib/punchlist');
    patch.contact_name = await labelForTodoContact(patch.contact_uid);
  }
  if (body.sort_order != null) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return jsonResponse({ ok: false, error: 'Invalid sort_order' }, 400);
    }
    patch.sort_order = sortOrder;
  }

  const result = await storeUpdateTodo(id, patch);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return jsonResponse({ ok: false, error: result.error }, status);
  }
  return jsonResponse({ ok: true, ...result.todo });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!isTodoDbConfigured()) return jsonResponse({ ok: false, error: 'To-do DB not configured' }, 503);

  const id = parseId(context.params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Invalid id' }, 400);

  const result = await storeDeleteTodo(id);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return jsonResponse({ ok: false, error: result.error }, status);
  }
  return jsonResponse({ ok: true, id, deleted: true });
}
