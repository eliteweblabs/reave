/**
 * Durable telemetry for chat turn lifecycle — stream drops, recovery, persist.
 * Postgres when DATABASE_URL is set; always logs a structured line for Railway.
 */

import { randomUUID } from 'crypto';
import pg from 'pg';
import type { ChatTurnEventName } from './chatTurnRecovery';
import { getPgPool } from './pgPool';

export type ChatTurnEventSource = 'server' | 'client';

export type ChatTurnEventRow = {
  id: string;
  userId: string;
  threadId: string;
  event: ChatTurnEventName;
  source: ChatTurnEventSource;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chat_turn_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  thread_id   TEXT NOT NULL,
  event       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'server',
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_turn_events_created
  ON chat_turn_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_turn_events_thread
  ON chat_turn_events (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_turn_events_event
  ON chat_turn_events (event, created_at DESC);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
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

function logStructured(row: Omit<ChatTurnEventRow, 'id' | 'createdAt'> & { id?: string }): void {
  try {
    console.info(
      '[chat-turn]',
      JSON.stringify({
        id: row.id,
        userId: row.userId,
        threadId: row.threadId,
        event: row.event,
        source: row.source,
        detail: row.detail ?? undefined,
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Fire-and-forget — never blocks chat paths on DB failure. */
export function recordChatTurnEvent(
  userId: string,
  threadId: string,
  event: ChatTurnEventName,
  opts: {
    source?: ChatTurnEventSource;
    detail?: Record<string, unknown> | null;
  } = {},
): void {
  const source = opts.source ?? 'server';
  const detail = opts.detail ?? null;
  const id = randomUUID();
  logStructured({ id, userId, threadId, event, source, detail });

  void (async () => {
    try {
      const pool = await ensureSchema();
      if (!pool) return;
      await pool.query(
        `INSERT INTO chat_turn_events (id, user_id, thread_id, event, source, detail)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          id,
          userId,
          threadId,
          event,
          source,
          detail ? JSON.stringify(detail) : null,
        ],
      );
    } catch (err) {
      console.warn('[chat-turn] failed to persist event', {
        event,
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

export async function listRecentChatTurnEvents(limit = 100): Promise<ChatTurnEventRow[]> {
  const pool = await ensureSchema();
  if (!pool) return [];
  const cap = Math.min(Math.max(limit, 1), 500);
  const res = await pool.query(
    `SELECT id, user_id, thread_id, event, source, detail, created_at
     FROM chat_turn_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [cap],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    threadId: String(row.thread_id),
    event: row.event as ChatTurnEventName,
    source: row.source as ChatTurnEventSource,
    detail: row.detail && typeof row.detail === 'object' ? (row.detail as Record<string, unknown>) : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}
