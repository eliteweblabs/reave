/**
 * Postgres-backed deploy failure incidents.
 * Blocks parallel agent repairs for the same GitHub repo.
 */
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type DeployIncidentStatus =
  | 'open'
  | 'investigating'
  | 'fixing'
  | 'verifying'
  | 'resolved'
  | 'escalated'
  | 'suppressed';

export type DeployIncidentRow = {
  id: string;
  dedup_key: string;
  repo: string;
  project: string | null;
  service: string | null;
  environment: string | null;
  deployment_id: string | null;
  commit_sha: string | null;
  source: 'webhook' | 'email';
  status: DeployIncidentStatus;
  email_id: string | null;
  alert_message: string | null;
  agent_reply: string | null;
  fix_commit_sha: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const ACTIVE_STATUSES: DeployIncidentStatus[] = [
  'open',
  'investigating',
  'fixing',
  'verifying',
  /** Holds repo lock while Claude is unreachable — stops webhook → agent loops. */
  'suppressed',
];

const STALE_MINUTES = 45;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deploy_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key TEXT NOT NULL,
  repo TEXT NOT NULL,
  project TEXT,
  service TEXT,
  environment TEXT,
  deployment_id TEXT,
  commit_sha TEXT,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'email')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'fixing', 'verifying', 'resolved', 'escalated', 'suppressed')),
  email_id TEXT,
  alert_message TEXT,
  agent_reply TEXT,
  fix_commit_sha TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deploy_incidents_active_repo
  ON deploy_incidents (dedup_key)
  WHERE status IN ('open', 'investigating', 'fixing', 'verifying');
CREATE INDEX IF NOT EXISTS idx_deploy_incidents_repo_created
  ON deploy_incidents (repo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_incidents_status
  ON deploy_incidents (status, created_at DESC);
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

export function isDeployIncidentsDbConfigured(): boolean {
  return !!databaseUrl();
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505';
}

function rowToIncident(row: Record<string, unknown>): DeployIncidentRow {
  return {
    id: String(row.id),
    dedup_key: String(row.dedup_key),
    repo: String(row.repo),
    project: row.project != null ? String(row.project) : null,
    service: row.service != null ? String(row.service) : null,
    environment: row.environment != null ? String(row.environment) : null,
    deployment_id: row.deployment_id != null ? String(row.deployment_id) : null,
    commit_sha: row.commit_sha != null ? String(row.commit_sha) : null,
    source: row.source as 'webhook' | 'email',
    status: row.status as DeployIncidentStatus,
    email_id: row.email_id != null ? String(row.email_id) : null,
    alert_message: row.alert_message != null ? String(row.alert_message) : null,
    agent_reply: row.agent_reply != null ? String(row.agent_reply) : null,
    fix_commit_sha: row.fix_commit_sha != null ? String(row.fix_commit_sha) : null,
    resolution: row.resolution != null ? String(row.resolution) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null,
  };
}

/** Expire stuck incidents so a new alert can acquire the repo lock. */
export async function dbReleaseStaleDeployIncidents(dedupKey?: string): Promise<number> {
  const pool = await ensureSchema();
  if (!pool) return 0;

  const params: unknown[] = [STALE_MINUTES];
  let sql = `
    UPDATE deploy_incidents
    SET status = 'escalated',
        resolution = 'stale_timeout',
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE status = ANY($2::text[])
      AND created_at < NOW() - ($1::int * INTERVAL '1 minute')
  `;
  params.push(ACTIVE_STATUSES);

  if (dedupKey) {
    sql += ` AND dedup_key = $3`;
    params.push(dedupKey);
  }

  const res = await pool.query(sql, params);
  return res.rowCount ?? 0;
}

export async function dbGetActiveDeployIncident(dedupKey: string): Promise<DeployIncidentRow | null> {
  const pool = await ensureSchema();
  if (!pool) return null;

  const res = await pool.query(
    `SELECT * FROM deploy_incidents
     WHERE dedup_key = $1 AND status = ANY($2::text[])
     ORDER BY created_at DESC LIMIT 1`,
    [dedupKey, ACTIVE_STATUSES],
  );
  return res.rows[0] ? rowToIncident(res.rows[0]) : null;
}

export type AcquireDeployIncidentInput = {
  dedupKey: string;
  repo: string;
  project?: string;
  service?: string;
  environment?: string;
  deploymentId?: string;
  commitSha?: string;
  source: 'webhook' | 'email';
  emailId?: string;
  alertMessage?: string;
};

export type AcquireDeployIncidentResult =
  | { acquired: true; incident: DeployIncidentRow }
  | { acquired: false; reason: 'duplicate'; existing: DeployIncidentRow }
  | { acquired: false; reason: 'no_db' };

/**
 * Try to open a new incident. Returns duplicate when another active incident
 * already holds the repo lock (unique index on dedup_key).
 */
export async function dbAcquireDeployIncident(
  input: AcquireDeployIncidentInput,
): Promise<AcquireDeployIncidentResult> {
  const pool = await ensureSchema();
  if (!pool) return { acquired: false, reason: 'no_db' };

  await dbReleaseStaleDeployIncidents(input.dedupKey);

  try {
    const res = await pool.query(
      `INSERT INTO deploy_incidents (
        dedup_key, repo, project, service, environment, deployment_id, commit_sha,
        source, status, email_id, alert_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)
      RETURNING *`,
      [
        input.dedupKey,
        input.repo,
        input.project ?? null,
        input.service ?? null,
        input.environment ?? null,
        input.deploymentId ?? null,
        input.commitSha ?? null,
        input.source,
        input.emailId ?? null,
        input.alertMessage ?? null,
      ],
    );
    return { acquired: true, incident: rowToIncident(res.rows[0]) };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const existing = await dbGetActiveDeployIncident(input.dedupKey);
      if (existing) {
        return { acquired: false, reason: 'duplicate', existing };
      }
    }
    throw e;
  }
}

export async function dbUpdateDeployIncident(
  id: string,
  patch: Partial<{
    status: DeployIncidentStatus;
    agent_reply: string;
    fix_commit_sha: string;
    resolution: string;
    email_id: string;
  }>,
): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [id];
  let i = 2;

  if (patch.status) {
    sets.push(`status = $${i++}`);
    params.push(patch.status);
    if (patch.status === 'resolved' || patch.status === 'escalated' || patch.status === 'suppressed') {
      sets.push('resolved_at = NOW()');
    }
  }
  if (patch.agent_reply !== undefined) {
    sets.push(`agent_reply = $${i++}`);
    params.push(patch.agent_reply);
  }
  if (patch.fix_commit_sha !== undefined) {
    sets.push(`fix_commit_sha = $${i++}`);
    params.push(patch.fix_commit_sha);
  }
  if (patch.resolution !== undefined) {
    sets.push(`resolution = $${i++}`);
    params.push(patch.resolution);
  }
  if (patch.email_id !== undefined) {
    sets.push(`email_id = $${i++}`);
    params.push(patch.email_id);
  }

  await pool.query(`UPDATE deploy_incidents SET ${sets.join(', ')} WHERE id = $1`, params);
}
