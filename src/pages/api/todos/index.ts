/**
 * GET  /api/todos — list personal to-do items
 * POST /api/todos — create { title, due_date?, priority? }
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  storeCreateTodo,
  storeListTodos,
  TODO_PRIORITIES,
  TODO_STATUSES,
} from '../../../lib/todoStore';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  try {
    const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
    if (!isTodoDbConfigured()) return jsonResponse({ ok: false, error: 'To-do DB not configured' }, 503);

    const statusRaw = context.url.searchParams.get('status')?.trim().toLowerCase();
    const priorityRaw = context.url.searchParams.get('priority')?.trim().toLowerCase();
    const dueBefore = context.url.searchParams.get('due_before')?.trim();
    const dueAfter = context.url.searchParams.get('due_after')?.trim();
    const jobSlug = context.url.searchParams.get('job_slug')?.trim() || undefined;
    const contactUid = context.url.searchParams.get('contact_uid')?.trim() || undefined;
    const unlinkedRaw = context.url.searchParams.get('unlinked')?.trim().toLowerCase();
    const unlinked = unlinkedRaw === '1' || unlinkedRaw === 'true';
    const sharedRaw = context.url.searchParams.get('shared')?.trim().toLowerCase();
    const shared = sharedRaw === '1' || sharedRaw === 'true';

    const status = normalizeTodoStatus(statusRaw);
    const priority = normalizeTodoPriority(priorityRaw);

    if (statusRaw && !status) return jsonResponse({ ok: false, error: 'Invalid status' }, 400);
    if (priorityRaw && !priority) return jsonResponse({ ok: false, error: 'Invalid priority' }, 400);

    const todos = await storeListTodos({
      status,
      priority,
      due_before: dueBefore || undefined,
      due_after: dueAfter || undefined,
      job_slug: jobSlug,
      unlinked: unlinked || undefined,
      contact_uid: contactUid,
      shared: shared || undefined,
    });

    return jsonResponse({
      ok: true,
      todos,
      count: todos.length,
      statuses: TODO_STATUSES,
      priorities: TODO_PRIORITIES,
    });
  } catch (e) {
    console.error('[todos] GET error:', e);
    return jsonResponse({ ok: false, error: 'Failed to load to-dos' }, 500);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!isTodoDbConfigured()) return jsonResponse({ ok: false, error: 'To-do DB not configured' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const title = String(body.title ?? '').trim();
  if (!title) return jsonResponse({ ok: false, error: 'title is required' }, 400);

  const priorityRaw = body.priority != null ? String(body.priority).trim().toLowerCase() : undefined;
  const priority = priorityRaw ? normalizeTodoPriority(priorityRaw) : undefined;
  if (priorityRaw && !priority) return jsonResponse({ ok: false, error: 'Invalid priority' }, 400);

  const dueRaw = body.due_date;
  const due_date =
    dueRaw == null || dueRaw === ''
      ? null
      : String(dueRaw).trim();

  const result = await storeCreateTodo({
    title,
    due_date,
    priority,
    job_slug: body.job_slug != null ? String(body.job_slug).trim() || null : undefined,
    assignee: body.assignee != null ? String(body.assignee).trim() || null : undefined,
    section: body.section != null ? String(body.section).trim() || null : undefined,
    created_by: 'staff',
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, ...result.todo }, 201);
}
