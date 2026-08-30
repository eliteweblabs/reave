/**
 * Install-owner punch list — feature requests from other Reave installs.
 *
 * Both sides open the same Punch list admin section. Client-install admins
 * send items to official reave.app. Those rows also live on the official
 * to-do list as `contact_uid = install:<slug>`.
 */

export const TODO_CREATED_BY = ['staff', 'install'] as const;
export type TodoCreatedBy = (typeof TODO_CREATED_BY)[number];

export const INSTALL_PUNCHLIST_PREFIX = 'install:';

export type HubPunchlistItem = {
  id: number;
  title: string;
  status: 'open' | 'done';
  company: string;
  install_slug: string;
  created_by: TodoCreatedBy;
  created_at: string;
  updated_at: string;
};

type PunchlistTodoRow = {
  id: number;
  title: string;
  status: 'open' | 'done';
  contact_uid?: string | null;
  contact_name?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeInstallSlug(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function installPunchlistUid(slug: string): string {
  const id = normalizeInstallSlug(slug);
  return id ? `${INSTALL_PUNCHLIST_PREFIX}${id}` : '';
}

export function parseInstallPunchlistUid(uid: string | null | undefined): string | null {
  const raw = String(uid ?? '').trim();
  if (!raw.toLowerCase().startsWith(INSTALL_PUNCHLIST_PREFIX)) return null;
  const slug = normalizeInstallSlug(raw.slice(INSTALL_PUNCHLIST_PREFIX.length));
  return slug || null;
}

export function normalizeTodoCreatedBy(raw: unknown): TodoCreatedBy | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'client') return 'install';
  return TODO_CREATED_BY.includes(v as TodoCreatedBy) ? (v as TodoCreatedBy) : undefined;
}

export function isInstallPunchlistTodo(todo: { contact_uid?: string | null }): boolean {
  return Boolean(parseInstallPunchlistUid(todo.contact_uid));
}

/** @deprecated use isInstallPunchlistTodo — leftover portal rows used any contact_uid. */
export function isSharedPunchlistTodo(todo: { contact_uid?: string | null }): boolean {
  return isInstallPunchlistTodo(todo);
}

export function toHubPunchlistItem(todo: PunchlistTodoRow): HubPunchlistItem {
  const slug = parseInstallPunchlistUid(todo.contact_uid) || '';
  return {
    id: todo.id,
    title: todo.title,
    status: todo.status,
    company: String(todo.contact_name ?? '').trim() || slug,
    install_slug: slug,
    created_by: normalizeTodoCreatedBy(todo.created_by) ?? 'install',
    created_at: todo.created_at,
    updated_at: todo.updated_at,
  };
}

export function punchlistTitleFromInput(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export async function labelForTodoContact(uid: string | null | undefined): Promise<string | null> {
  const slug = parseInstallPunchlistUid(uid);
  if (slug) return slug;
  const id = uid?.trim();
  if (!id) return null;
  const { getContact, contactStringField } = await import('./contactApi');
  const res = await getContact(id);
  if (!res.ok) return null;
  return contactStringField(res.data.name) || contactStringField(res.data.company) || null;
}
