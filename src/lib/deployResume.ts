/**
 * Deploy resume — lets the agent register a continuation message before going
 * silent during a deploy, then auto-resumes the same chat thread when the
 * Railway deploy-success webhook fires.
 *
 * Storage: single row in Postgres (deploy_resume table).
 * Trigger: railwayWebhookHandler calls triggerDeployResume() on success.
 * Register: agent calls set_deploy_resume tool with thread_id + message.
 */
import pg from 'pg';
import { serverEnv } from './serverEnv';
import { postToSystemAlertsThread } from './systemAlertsThread';
import { createLogger } from './logger';

const log = createLogger('deploy-resume');

export type DeployResumeRow = {
  thread_id: string;
  message: string;
  registered_at: string;
  expires_at: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deploy_resume (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  thread_id TEXT NOT NULL,
  message TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
`;

const RESUME_TTL_MS = 30 * 60 * 1_000; // 30 minutes

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
  if (!url) { _pool = null; return null; }
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 2 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool.query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => { _schemaReady = null; throw err; });
  }
  await _schemaReady;
  return pool;
}

/** Register a deploy-resume payload. Overwrites any existing one. */
export async function setDeployResume(
  threadId: string,
  message: string,
): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    const expiresAt = new Date(Date.now() + RESUME_TTL_MS).toISOString();
    await pool.query(
      `INSERT INTO deploy_resume (id, thread_id, message, registered_at, expires_at)
       VALUES (1, $1, $2, NOW(), $3::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         thread_id = EXCLUDED.thread_id,
         message = EXCLUDED.message,
         registered_at = NOW(),
         expires_at = EXCLUDED.expires_at`,
      [threadId, message, expiresAt],
    );
    log.info('deploy resume registered', { threadId });
  } catch (err) {
    log.warn('setDeployResume failed', { error: err instanceof Error ? err.message : err });
  }
}

/** Fetch and clear the pending deploy-resume payload (if not expired). */
export async function popDeployResume(): Promise<DeployResumeRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<DeployResumeRow>(
      `DELETE FROM deploy_resume WHERE id = 1 AND expires_at > NOW()
       RETURNING thread_id, message, registered_at::text, expires_at::text`,
    );
    return rows[0] ?? null;
  } catch (err) {
    log.warn('popDeployResume failed', { error: err instanceof Error ? err.message : err });
    return null;
  }
}

/**
 * Called from railwayWebhookHandler on deploy success.
 * If a resume is registered, posts the continuation message to the stored thread.
 */
export async function triggerDeployResume(): Promise<void> {
  const resume = await popDeployResume();
  if (!resume) return;

  log.info('triggering deploy resume', { threadId: resume.thread_id });

  try {
    await postToSystemAlertsThread({
      message: resume.message,
      autoRun: true,
      bypassSleep: true,
      threadId: resume.thread_id,
    });
    log.info('deploy resume posted', { threadId: resume.thread_id });
  } catch (err) {
    log.warn('deploy resume post failed', { error: err instanceof Error ? err.message : err });
  }
}
