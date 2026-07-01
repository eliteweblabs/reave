/**
 * Postgres-backed dashboard chats (Railway reave-postgres via DATABASE_URL).
 * Schema is ensured automatically on first use.
 */

import pg from 'pg';
import { serverEnv } from './serverEnv';
import type { ChatTurn } from './chatTypes';
import type { ChatMessage, ChatThreadDetail, ChatThreadSummary } from './chatTypes';

export type { ChatMessage, ChatThreadDetail, ChatThreadSummary };

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chat_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const MIGRATE_COLUMNS = [
  `ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS source_email_id TEXT`,
];

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS chat_threads_user_idx ON chat_threads (user_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages (thread_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS chat_threads_archived_idx ON chat_threads (user_id, archived, updated_at DESC)`,
];

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
    _schemaReady = (async () => {
      await pool.query(TABLE_SQL);
      for (const sql of MIGRATE_COLUMNS) await pool.query(sql);
      for (const sql of INDEX_SQL) await pool.query(sql);
    })().catch((e) => {
      _schemaReady = null;
      throw e;
    });
  }
  await _schemaReady;
  return pool;
}

export function isPgChatsConfigured(): boolean {
  return !!databaseUrl();
}

type ThreadRow = ChatThreadSummary & { archived?: boolean; source_email_id?: string | null };

function rowToSummary(row: ThreadRow): ChatThreadSummary {
  return {
    id: row.id,
    title: row.title,
    updated_at: row.updated_at,
    created_at: row.created_at,
    archived: !!row.archived,
    source_email_id: row.source_email_id ?? null,
  };
}

export async function pgListChatThreads(
  userId: string,
  opts?: { archivedOnly?: boolean },
): Promise<ChatThreadSummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const archivedFilter = opts?.archivedOnly ? 'AND archived = true' : 'AND archived = false';
    const { rows } = await pool.query<ThreadRow>(
      `SELECT id, title, updated_at, created_at, archived, source_email_id
       FROM chat_threads WHERE user_id = $1 ${archivedFilter}
       ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map(rowToSummary);
  } catch (e) {
    console.error('[chats:pg] list error:', e);
    return null;
  }
}

export async function pgCreateChatThread(
  userId: string,
  opts?: { sourceEmailId?: string | null },
): Promise<ChatThreadSummary | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const sourceEmailId = opts?.sourceEmailId?.trim() || null;
    const { rows } = await pool.query<ThreadRow>(
      `INSERT INTO chat_threads (user_id, title, source_email_id)
       VALUES ($1, 'New chat', $2)
       RETURNING id, title, updated_at, created_at, archived, source_email_id`,
      [userId, sourceEmailId],
    );
    return rows[0] ? rowToSummary(rows[0]) : null;
  } catch (e) {
    console.error('[chats:pg] create error:', e);
    return null;
  }
}

export async function pgGetChatThread(
  userId: string,
  threadId: string
): Promise<ChatThreadDetail | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const threadRes = await pool.query<ThreadRow>(
      `SELECT id, title, updated_at, created_at, archived, source_email_id
       FROM chat_threads WHERE id = $1 AND user_id = $2`,
      [threadId, userId],
    );
    const thread = threadRes.rows[0];
    if (!thread) return null;

    const msgRes = await pool.query<ChatMessage>(
      `SELECT id, role, content, created_at
       FROM chat_messages WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [threadId]
    );

    return { ...rowToSummary(thread), messages: msgRes.rows };
  } catch (e) {
    console.error('[chats:pg] get error:', e);
    return null;
  }
}

export async function pgAppendChatMessages(
  threadId: string,
  turns: ChatTurn[]
): Promise<boolean> {
  if (!turns.length) return false;
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const t of turns) {
        await client.query(
          `INSERT INTO chat_messages (thread_id, role, content) VALUES ($1, $2, $3)`,
          [threadId, t.role, t.content]
        );
      }
      await client.query(
        `UPDATE chat_threads SET updated_at = now() WHERE id = $1`,
        [threadId]
      );
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[chats:pg] append error:', e);
    return false;
  }
}

export async function pgUpdateChatTitle(threadId: string, title: string): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `UPDATE chat_threads SET title = $1, updated_at = now() WHERE id = $2`,
      [title, threadId]
    );
    return true;
  } catch (e) {
    console.error('[chats:pg] title update error:', e);
    return false;
  }
}

export async function pgSetChatArchived(
  userId: string,
  threadId: string,
  archived: boolean,
): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const { rowCount } = await pool.query(
      `UPDATE chat_threads SET archived = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [archived, threadId, userId],
    );
    return (rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[chats:pg] archive error:', e);
    return false;
  }
}

export async function pgDeleteChatThread(userId: string, threadId: string): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const { rowCount } = await pool.query(
      `DELETE FROM chat_threads WHERE id = $1 AND user_id = $2`,
      [threadId, userId]
    );
    return (rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[chats:pg] delete error:', e);
    return false;
  }
}
