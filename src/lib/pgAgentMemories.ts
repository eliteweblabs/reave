/**
 * Postgres-backed durable recall (Railway DATABASE_URL).
 * Schema is ensured on first use.
 */

import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { createLogger } from './logger';
import {
  memoriesAreSimilar,
  normalizeMemoryContent,
  normalizeMemoryKey,
  normalizeMemoryKind,
  normalizeMemoryScope,
  type AgentMemory,
  type MemoryKind,
  type MemoryScope,
  type MemorySource,
} from './agentMemory';

const log = createLogger('memory:pg');

const COLUMNS =
  'id, user_id, scope, kind, key, content, source, source_thread_id, hit_count, created_at, updated_at, last_used_at';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_memories (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'user'
    CHECK (scope IN ('user', 'install')),
  kind TEXT NOT NULL DEFAULT 'fact'
    CHECK (kind IN ('preference', 'procedure', 'fact', 'decision', 'client', 'habit')),
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'agent'
    CHECK (source IN ('agent', 'extract', 'owner')),
  source_thread_id TEXT,
  hit_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_memories_user_key
  ON agent_memories (user_id, key) WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS agent_memories_install_key
  ON agent_memories (key) WHERE scope = 'install';
CREATE INDEX IF NOT EXISTS agent_memories_user_updated
  ON agent_memories (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_memories_search
  ON agent_memories USING GIN (to_tsvector('english', key || ' ' || content));
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

export function isMemoryDbConfigured(): boolean {
  return !!databaseUrl();
}

function mapRow(row: Record<string, unknown>): AgentMemory {
  return {
    id: Number(row.id),
    user_id: String(row.user_id),
    scope: normalizeMemoryScope(row.scope, normalizeMemoryKind(row.kind)),
    kind: normalizeMemoryKind(row.kind),
    key: String(row.key),
    content: String(row.content),
    source: (['agent', 'extract', 'owner'] as const).includes(row.source as MemorySource)
      ? (row.source as MemorySource)
      : 'agent',
    source_thread_id: row.source_thread_id ? String(row.source_thread_id) : null,
    hit_count: Number(row.hit_count ?? 1),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    last_used_at:
      row.last_used_at instanceof Date
        ? row.last_used_at.toISOString()
        : row.last_used_at
          ? String(row.last_used_at)
          : null,
  };
}

export async function dbListMemories(opts: {
  userId: string;
  kind?: MemoryKind;
  query?: string;
  limit?: number;
}): Promise<AgentMemory[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const limit = Math.min(Math.max(1, opts.limit ?? 80), 200);
    const params: unknown[] = [opts.userId];
    const where = [`(scope = 'install' OR (scope = 'user' AND user_id = $1))`];
    if (opts.kind) {
      params.push(opts.kind);
      where.push(`kind = $${params.length}`);
    }
    if (opts.query?.trim()) {
      params.push(opts.query.trim());
      where.push(
        `(key ILIKE '%' || $${params.length} || '%' OR content ILIKE '%' || $${params.length} || '%')`,
      );
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM agent_memories
       WHERE ${where.join(' AND ')}
       ORDER BY hit_count DESC, updated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    log.warn('list failed', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function dbCountMemories(userId: string): Promise<number | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM agent_memories
       WHERE scope = 'install' OR (scope = 'user' AND user_id = $1)`,
      [userId],
    );
    return rows[0]?.n ?? 0;
  } catch (e) {
    log.warn('count failed', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

async function findSimilar(
  pool: pg.Pool,
  userId: string,
  scope: MemoryScope,
  content: string,
): Promise<AgentMemory | null> {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM agent_memories
     WHERE (scope = $2 AND (scope = 'install' OR user_id = $1))
     ORDER BY updated_at DESC
     LIMIT 80`,
    [userId, scope],
  );
  for (const row of rows) {
    const mapped = mapRow(row as Record<string, unknown>);
    if (memoriesAreSimilar(mapped.content, content)) return mapped;
  }
  return null;
}

export async function dbUpsertMemory(input: {
  userId: string;
  scope: MemoryScope;
  kind: MemoryKind;
  key: string;
  content: string;
  source: MemorySource;
  sourceThreadId?: string | null;
}): Promise<
  { ok: true; memory: AgentMemory; created: boolean; changed: boolean } | { ok: false; error: string }
> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'DATABASE_URL is not set' };
    const key = normalizeMemoryKey(input.key, input.content);
    const content = normalizeMemoryContent(input.content);
    const kind = normalizeMemoryKind(input.kind);
    const scope = normalizeMemoryScope(input.scope, kind);

    const existingByKey = await pool.query(
      scope === 'install'
        ? `SELECT ${COLUMNS} FROM agent_memories WHERE scope = 'install' AND key = $1 LIMIT 1`
        : `SELECT ${COLUMNS} FROM agent_memories WHERE scope = 'user' AND user_id = $1 AND key = $2 LIMIT 1`,
      scope === 'install' ? [key] : [input.userId, key],
    );
    let existing = existingByKey.rows[0]
      ? mapRow(existingByKey.rows[0] as Record<string, unknown>)
      : null;
    if (!existing) existing = await findSimilar(pool, input.userId, scope, content);

    if (existing) {
      const changed = existing.content !== content || existing.kind !== kind;
      const { rows } = await pool.query(
        `UPDATE agent_memories
         SET content = $2, kind = $3, source = $4, source_thread_id = COALESCE($5, source_thread_id),
             hit_count = hit_count + 1, updated_at = NOW()
         WHERE id = $1
         RETURNING ${COLUMNS}`,
        [existing.id, content, kind, input.source, input.sourceThreadId ?? null],
      );
      return {
        ok: true,
        memory: mapRow(rows[0] as Record<string, unknown>),
        created: false,
        changed,
      };
    }

    const { rows } = await pool.query(
      `INSERT INTO agent_memories (user_id, scope, kind, key, content, source, source_thread_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [input.userId, scope, kind, key, content, input.source, input.sourceThreadId ?? null],
    );
    return { ok: true, memory: mapRow(rows[0] as Record<string, unknown>), created: true, changed: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn('upsert failed', { error: msg });
    return { ok: false, error: msg };
  }
}

export async function dbDeleteMemory(opts: {
  userId: string;
  id?: number;
  key?: string;
}): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'DATABASE_URL is not set' };
    if (opts.id && Number.isFinite(opts.id)) {
      const { rowCount } = await pool.query(
        `DELETE FROM agent_memories
         WHERE id = $1 AND (scope = 'install' OR user_id = $2)`,
        [opts.id, opts.userId],
      );
      return { ok: true, deleted: rowCount ?? 0 };
    }
    const key = opts.key?.trim();
    if (!key) return { ok: false, error: 'id or key is required' };
    const { rowCount } = await pool.query(
      `DELETE FROM agent_memories
       WHERE key = $1 AND (scope = 'install' OR user_id = $2)`,
      [key, opts.userId],
    );
    return { ok: true, deleted: rowCount ?? 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn('delete failed', { error: msg });
    return { ok: false, error: msg };
  }
}

export async function dbTouchMemories(ids: number[]): Promise<void> {
  if (!ids.length) return;
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    await pool.query(`UPDATE agent_memories SET last_used_at = NOW() WHERE id = ANY($1::int[])`, [
      ids,
    ]);
  } catch (e) {
    log.warn('touch failed', { error: e instanceof Error ? e.message : String(e) });
  }
}
