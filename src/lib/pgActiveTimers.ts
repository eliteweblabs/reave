/**
 * Postgres-backed active time-tracking timers (one per owner key).
 */

import pg from 'pg';
import { getPgPool } from './pgPool';

export interface ActiveTimerRow {
  owner_key: string;
  job_slug: string;
  started_at: string | Date;
  note: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS active_timers (
  owner_key VARCHAR(64) PRIMARY KEY,
  job_slug VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_active_timers_job ON active_timers(job_slug);
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

function pgTimestamp(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function dbGetActiveTimer(
  ownerKey: string,
): Promise<{ jobSlug: string; startedAt: string; note: string } | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    const { rows } = await pool.query<ActiveTimerRow>(
      `SELECT owner_key, job_slug, started_at, note FROM active_timers WHERE owner_key = $1`,
      [ownerKey],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      jobSlug: row.job_slug,
      startedAt: pgTimestamp(row.started_at),
      note: row.note ?? '',
    };
  } catch (e) {
    console.error('[active-timers:pg] get error:', e);
    return null;
  }
}

export async function dbSetActiveTimer(
  ownerKey: string,
  jobSlug: string,
  note = '',
): Promise<{ jobSlug: string; startedAt: string; note: string } | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    const startedAt = new Date().toISOString();
    const { rows } = await pool.query<ActiveTimerRow>(
      `INSERT INTO active_timers (owner_key, job_slug, started_at, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_key) DO UPDATE SET
         job_slug = EXCLUDED.job_slug,
         started_at = EXCLUDED.started_at,
         note = EXCLUDED.note
       RETURNING owner_key, job_slug, started_at, note`,
      [ownerKey, jobSlug, startedAt, note],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      jobSlug: row.job_slug,
      startedAt: pgTimestamp(row.started_at),
      note: row.note ?? '',
    };
  } catch (e) {
    console.error('[active-timers:pg] set error:', e);
    return null;
  }
}

export async function dbClearActiveTimer(ownerKey: string): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const result = await pool.query(`DELETE FROM active_timers WHERE owner_key = $1`, [ownerKey]);
    return (result.rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[active-timers:pg] clear error:', e);
    return false;
  }
}
