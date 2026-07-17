/**
 * Postgres-backed personal to-do store (Railway DATABASE_URL).
 */

import pg from 'pg';
import { serverEnv } from './serverEnv';
import { readMarkdownTodoSections } from './markdownTodoFiles';

export const TODO_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const TODO_STATUSES = ['open', 'done'] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export interface TodoItem {
  id: number;
  title: string;
  due_date: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  sort_order: number;
  job_slug: string | null;
  assignee: string | null;
  section: string | null;
  created_at: string;
  updated_at: string;
}

const TODO_COLUMNS =
  'id, title, due_date, priority, status, sort_order, job_slug, assignee, section, created_at, updated_at';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  due_date DATE,
  priority VARCHAR(50) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status VARCHAR(50) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sort_order INT NOT NULL DEFAULT 0,
  job_slug VARCHAR(255),
  assignee VARCHAR(255),
  section VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos (status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos (priority);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date);
CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos (status, due_date);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS job_slug VARCHAR(255);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS assignee VARCHAR(255);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS section VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_todos_sort_order ON todos (status, sort_order ASC, updated_at DESC);
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;

function databaseUrl(): string | undefined {
  return serverEnv('DATABASE_URL')?.trim() || undefined;
}

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  const url = databaseUrl();
  if (!url) {
    _pool = null;
    return null;
  }
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 5 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

export function isTodoDbConfigured(): boolean {
  return !!databaseUrl();
}

export function normalizeTodoPriority(raw: unknown): TodoPriority | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  return TODO_PRIORITIES.includes(v as TodoPriority) ? (v as TodoPriority) : undefined;
}

export function normalizeTodoStatus(raw: unknown): TodoStatus | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  return TODO_STATUSES.includes(v as TodoStatus) ? (v as TodoStatus) : undefined;
}

function parseDueDate(raw: unknown): string | null | undefined {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return v;
}

function rowToTodo(row: TodoItem): TodoItem {
  return {
    id: row.id,
    title: row.title,
    due_date: row.due_date,
    priority: row.priority,
    status: row.status,
    sort_order: row.sort_order ?? 0,
    job_slug: row.job_slug ?? null,
    assignee: row.assignee ?? null,
    section: row.section ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface ListTodosOpts {
  status?: TodoStatus;
  priority?: TodoPriority;
  due_before?: string;
  due_after?: string;
  job_slug?: string;
  unlinked?: boolean;
}

export async function dbListTodos(opts: ListTodosOpts = {}): Promise<TodoItem[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (opts.status) {
      params.push(opts.status);
      clauses.push(`status = $${params.length}`);
    }
    if (opts.priority) {
      params.push(opts.priority);
      clauses.push(`priority = $${params.length}`);
    }
    if (opts.due_before) {
      params.push(opts.due_before);
      clauses.push(`due_date IS NOT NULL AND due_date <= $${params.length}`);
    }
    if (opts.due_after) {
      params.push(opts.due_after);
      clauses.push(`due_date IS NOT NULL AND due_date >= $${params.length}`);
    }
    if (opts.job_slug) {
      params.push(opts.job_slug);
      clauses.push(`job_slug = $${params.length}`);
    }
    if (opts.unlinked) {
      clauses.push('job_slug IS NULL');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query<TodoItem>(
      `SELECT ${TODO_COLUMNS}
       FROM todos
       ${where}
       ORDER BY
         CASE status WHEN 'open' THEN 0 ELSE 1 END,
         sort_order ASC,
         CASE priority
           WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3
         END,
         due_date NULLS LAST,
         updated_at DESC`,
      params,
    );
    return rows.map(rowToTodo);
  } catch (e) {
    console.error('[todos:pg] list error:', e);
    return null;
  }
}

export async function dbReadTodo(id: number): Promise<TodoItem | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<TodoItem>(
      `SELECT ${TODO_COLUMNS} FROM todos WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToTodo(rows[0]) : null;
  } catch (e) {
    console.error('[todos:pg] read error:', e);
    return null;
  }
}

export async function dbCreateTodo(input: {
  title: string;
  due_date?: string | null;
  priority?: TodoPriority;
  job_slug?: string | null;
  assignee?: string | null;
  section?: string | null;
  sort_order?: number;
}): Promise<{ ok: true; todo: TodoItem } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'To-do DB not configured — set DATABASE_URL.' };

    const title = input.title.trim();
    if (!title) return { ok: false, error: 'title is required' };

    const dueDate = input.due_date ?? null;
    if (dueDate !== null && parseDueDate(dueDate) === undefined) {
      return { ok: false, error: 'due_date must be YYYY-MM-DD' };
    }

    const priority = input.priority ?? 'normal';
    const jobSlug = input.job_slug?.trim() || null;
    const assignee = input.assignee?.trim() || null;
    const section = input.section?.trim() || null;
    let sortOrder = input.sort_order;
    if (sortOrder == null || !Number.isFinite(sortOrder)) {
      const { rows: maxRows } = await pool.query<{ max: number | null }>(
        `SELECT COALESCE(MAX(sort_order), -1) AS max FROM todos WHERE status = 'open'`,
      );
      sortOrder = (maxRows[0]?.max ?? -1) + 1;
    }
    const { rows } = await pool.query<TodoItem>(
      `INSERT INTO todos (title, due_date, priority, job_slug, assignee, section, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${TODO_COLUMNS}`,
      [title, dueDate, priority, jobSlug, assignee, section, sortOrder],
    );
    const todo = rows[0];
    if (!todo) return { ok: false, error: 'insert failed' };
    return { ok: true, todo: rowToTodo(todo) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbUpdateTodo(
  id: number,
  patch: {
    title?: string;
    due_date?: string | null;
    priority?: TodoPriority;
    status?: TodoStatus;
    job_slug?: string | null;
    assignee?: string | null;
    section?: string | null;
    sort_order?: number;
  },
): Promise<{ ok: true; todo: TodoItem } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'To-do DB not configured — set DATABASE_URL.' };

    const existing = await dbReadTodo(id);
    if (!existing) return { ok: false, error: 'Not found' };

    const title = patch.title != null ? patch.title.trim() : existing.title;
    if (!title) return { ok: false, error: 'title is required' };

    let dueDate = existing.due_date;
    if (patch.due_date !== undefined) {
      if (patch.due_date === null || patch.due_date === '') {
        dueDate = null;
      } else {
        const parsed = parseDueDate(patch.due_date);
        if (parsed === undefined) return { ok: false, error: 'due_date must be YYYY-MM-DD' };
        dueDate = parsed;
      }
    }

    const priority = patch.priority ?? existing.priority;
    const status = patch.status ?? existing.status;
    const jobSlug = patch.job_slug !== undefined ? patch.job_slug?.trim() || null : existing.job_slug;
    const assignee =
      patch.assignee !== undefined ? patch.assignee?.trim() || null : existing.assignee;
    const section = patch.section !== undefined ? patch.section?.trim() || null : existing.section;
    const sortOrder = patch.sort_order ?? existing.sort_order;

    const { rows } = await pool.query<TodoItem>(
      `UPDATE todos
       SET title = $2, due_date = $3, priority = $4, status = $5,
           job_slug = $6, assignee = $7, section = $8, sort_order = $9, updated_at = NOW()
       WHERE id = $1
       RETURNING ${TODO_COLUMNS}`,
      [id, title, dueDate, priority, status, jobSlug, assignee, section, sortOrder],
    );
    const todo = rows[0];
    if (!todo) return { ok: false, error: 'Not found' };
    return { ok: true, todo: rowToTodo(todo) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbMarkTodoDone(
  id: number,
): Promise<{ ok: true; todo: TodoItem } | { ok: false; error: string }> {
  return dbUpdateTodo(id, { status: 'done' });
}

export async function dbSeedTodosFromMarkdownIfEmpty(): Promise<number> {
  try {
    const pool = await ensureSchema();
    if (!pool) return 0;

    const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM todos');
    if (Number(rows[0]?.count ?? 0) > 0) return 0;

    const sections = readMarkdownTodoSections();
    if (!sections.length) return 0;

    let sortOrder = 0;
    let created = 0;
    for (const section of sections) {
      for (const item of section.items) {
        await pool.query(
          `INSERT INTO todos (title, status, section, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [item.text, item.checked ? 'done' : 'open', section.title, sortOrder++],
        );
        created++;
      }
    }
    return created;
  } catch (e) {
    console.error('[todos:pg] seed error:', e);
    return 0;
  }
}

export async function dbReorderTodos(
  ids: number[],
): Promise<{ ok: true; todos: TodoItem[] } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'To-do DB not configured — set DATABASE_URL.' };

    const cleanIds = ids.filter((id) => Number.isInteger(id) && id > 0);
    if (cleanIds.length === 0) return { ok: false, error: 'ids required' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < cleanIds.length; i++) {
        await client.query('UPDATE todos SET sort_order = $2, updated_at = NOW() WHERE id = $1', [
          cleanIds[i],
          i,
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const todos = (await dbListTodos()) ?? [];
    return { ok: true, todos };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbDeleteTodo(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'To-do DB not configured — set DATABASE_URL.' };

    const { rowCount } = await pool.query('DELETE FROM todos WHERE id = $1', [id]);
    if ((rowCount ?? 0) === 0) return { ok: false, error: 'Not found' };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
