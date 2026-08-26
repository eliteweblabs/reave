/**
 * Personal to-do store — Postgres only (Railway DATABASE_URL).
 */

export {
  TODO_PRIORITIES,
  TODO_STATUSES,
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  type TodoItem,
  type TodoPriority,
  type TodoStatus,
  type ListTodosOpts,
} from './pgTodos';
export { TODO_CREATED_BY, normalizeTodoCreatedBy, type TodoCreatedBy } from './punchlist';

import { isCanonicalReaveInstall } from './installConfig';
import {
  dbListTodos,
  dbReadTodo,
  dbCreateTodo,
  dbUpdateTodo,
  dbMarkTodoDone,
  dbDeleteTodo,
  dbReorderTodos,
  dbUnlinkTodosByContactUid,
  dbPurgeBundledMarkdownTodosOnce,
  dbSeedTodosFromMarkdownIfEmpty,
  type ListTodosOpts,
  type TodoItem,
  type TodoPriority,
  type TodoStatus,
} from './pgTodos';
import type { TodoCreatedBy } from './punchlist';

export async function storeListTodos(opts?: ListTodosOpts): Promise<TodoItem[]> {
  if (isCanonicalReaveInstall()) {
    await storeSeedTodosFromMarkdownIfEmpty();
  } else {
    await dbPurgeBundledMarkdownTodosOnce();
  }
  const rows = await dbListTodos(opts ?? {});
  return rows ?? [];
}

/** One-shot migration for the official reΛVe.app install. Never runs on customer installs. */
export async function storeSeedTodosFromMarkdownIfEmpty(): Promise<number> {
  if (!isCanonicalReaveInstall()) return 0;
  return dbSeedTodosFromMarkdownIfEmpty();
}

export async function storeReadTodo(id: number): Promise<TodoItem | null> {
  return dbReadTodo(id);
}

export async function storeCreateTodo(input: {
  title: string;
  due_date?: string | null;
  priority?: TodoPriority;
  job_slug?: string | null;
  assignee?: string | null;
  section?: string | null;
  contact_uid?: string | null;
  contact_name?: string | null;
  created_by?: TodoCreatedBy;
  sort_order?: number;
}): Promise<{ ok: true; todo: TodoItem } | { ok: false; error: string }> {
  return dbCreateTodo(input);
}

export async function storeUpdateTodo(
  id: number,
  patch: {
    title?: string;
    due_date?: string | null;
    priority?: TodoPriority;
    status?: TodoStatus;
    job_slug?: string | null;
    assignee?: string | null;
    section?: string | null;
    contact_uid?: string | null;
    contact_name?: string | null;
    created_by?: TodoCreatedBy;
    sort_order?: number;
  },
): Promise<{ ok: true; todo: TodoItem } | { ok: false; error: string }> {
  return dbUpdateTodo(id, patch);
}

export async function storeUnlinkTodosForContact(contactUid: string): Promise<number> {
  return dbUnlinkTodosByContactUid(contactUid);
}

export async function storeMarkTodoDone(
  id: number,
): Promise<{ ok: true; todo: TodoItem } | { ok: false; error: string }> {
  return dbMarkTodoDone(id);
}

export async function storeDeleteTodo(id: number): Promise<{ ok: boolean; error?: string }> {
  return dbDeleteTodo(id);
}

export async function storeReorderTodos(
  ids: number[],
): Promise<{ ok: true; todos: TodoItem[] } | { ok: false; error: string }> {
  return dbReorderTodos(ids);
}
