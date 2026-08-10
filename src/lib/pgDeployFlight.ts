/**
 * Shared Railway deploy-in-flight flag (Postgres).
 *
 * In-memory overrides in deployStatus.ts only update the instance that received
 * the webhook. During a Railway rollout the success event often hits the *new*
 * container while users are still sticky on the *old* one — without a shared
 * store the composer lock never clears until that old process dies.
 */
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type DeployFlightStatus = 'idle' | 'deploying' | 'failed';

export type DeployFlightRow = {
  status: DeployFlightStatus;
  commit_sha: string | null;
  commit_message: string | null;
  started_at: string | null;
  failed_reason: string | null;
  failed_sha: string | null;
  updated_at: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deploy_flight (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'deploying', 'failed')),
  commit_sha TEXT,
  commit_message TEXT,
  started_at TIMESTAMPTZ,
  failed_reason TEXT,
  failed_sha TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO deploy_flight (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
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
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 3 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        _schemaReady = null;
        throw err;
      });
  }
  await _schemaReady;
  return pool;
}

function mapRow(row: Record<string, unknown>): DeployFlightRow {
  const status = row.status === 'deploying' || row.status === 'failed' ? row.status : 'idle';
  return {
    status,
    commit_sha: typeof row.commit_sha === 'string' ? row.commit_sha : null,
    commit_message: typeof row.commit_message === 'string' ? row.commit_message : null,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : (row.started_at as string | null) ?? null,
    failed_reason: typeof row.failed_reason === 'string' ? row.failed_reason : null,
    failed_sha: typeof row.failed_sha === 'string' ? row.failed_sha : null,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : typeof row.updated_at === 'string'
          ? row.updated_at
          : new Date().toISOString(),
  };
}

export async function getDeployFlight(): Promise<DeployFlightRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query(`SELECT * FROM deploy_flight WHERE id = 1`);
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  } catch (err) {
    console.warn('[deploy-flight] read failed', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setDeployFlightDeploying(opts?: {
  commitHash?: string | null;
  commitMessage?: string | null;
  timestamp?: string | null;
}): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    const startedAt = opts?.timestamp?.trim() || new Date().toISOString();
    await pool.query(
      `UPDATE deploy_flight SET
         status = 'deploying',
         commit_sha = $1,
         commit_message = $2,
         started_at = $3::timestamptz,
         failed_reason = NULL,
         failed_sha = NULL,
         updated_at = NOW()
       WHERE id = 1`,
      [opts?.commitHash?.trim() || null, opts?.commitMessage?.trim() || null, startedAt],
    );
  } catch (err) {
    console.warn('[deploy-flight] write deploying failed', err instanceof Error ? err.message : err);
  }
}

export async function setDeployFlightIdle(): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    await pool.query(
      `UPDATE deploy_flight SET
         status = 'idle',
         commit_sha = NULL,
         commit_message = NULL,
         started_at = NULL,
         failed_reason = NULL,
         failed_sha = NULL,
         updated_at = NOW()
       WHERE id = 1`,
    );
  } catch (err) {
    console.warn('[deploy-flight] write idle failed', err instanceof Error ? err.message : err);
  }
}

export async function setDeployFlightFailed(reason?: string, failedSha?: string | null): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    await pool.query(
      `UPDATE deploy_flight SET
         status = 'failed',
         commit_sha = COALESCE($2, commit_sha),
         failed_reason = $1,
         failed_sha = $2,
         updated_at = NOW()
       WHERE id = 1`,
      [reason?.trim() || 'Deploy failed — check Railway logs', failedSha?.trim() || null],
    );
  } catch (err) {
    console.warn('[deploy-flight] write failed failed', err instanceof Error ? err.message : err);
  }
}
