/**
 * Shared client punch list — the same rows as personal to-dos, scoped by
 * contact_uid. Clients add/check items on /c/:uid; staff see them in To-do.
 */

export const TODO_CREATED_BY = ['staff', 'client'] as const;
export type TodoCreatedBy = (typeof TODO_CREATED_BY)[number];

export type PublicPunchlistItem = {
  id: number;
  title: string;
  status: 'open' | 'done';
  created_by: TodoCreatedBy;
  created_at: string;
  updated_at: string;
};

type PunchlistTodoRow = {
  id: number;
  title: string;
  status: 'open' | 'done';
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeTodoCreatedBy(raw: unknown): TodoCreatedBy | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  return TODO_CREATED_BY.includes(v as TodoCreatedBy) ? (v as TodoCreatedBy) : undefined;
}

export function isSharedPunchlistTodo(todo: { contact_uid?: string | null }): boolean {
  return Boolean(todo.contact_uid?.trim());
}

export function toPublicPunchlistItem(todo: PunchlistTodoRow): PublicPunchlistItem {
  return {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    created_by: normalizeTodoCreatedBy(todo.created_by) ?? 'staff',
    created_at: todo.created_at,
    updated_at: todo.updated_at,
  };
}

/** Clients may rename or remove only the items they added. */
export function canClientEditPunchlistItem(todo: { created_by?: string | null }): boolean {
  return normalizeTodoCreatedBy(todo.created_by) === 'client';
}

export function punchlistTitleFromInput(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export async function labelForTodoContact(uid: string | null | undefined): Promise<string | null> {
  const id = uid?.trim();
  if (!id) return null;
  const { getContact, contactStringField } = await import('./contactApi');
  const res = await getContact(id);
  if (!res.ok) return null;
  return contactStringField(res.data.name) || contactStringField(res.data.company) || null;
}
