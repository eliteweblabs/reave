/**
 * Postgres-backed work/jobs store (Railway DATABASE_URL).
 * Schema is ensured on first use; existing markdown job files are seeded when empty.
 */

import pg from 'pg';
import {
  fileReadWork,
  listWorkFileSlugs,
  normalizeWorkStatus,
  type WorkJobDoc,
  type WorkJobSummary,
  type WorkStatus,
} from './workStore';
import { serverEnv } from './serverEnv';

export interface JobRow {
  id: number;
  slug: string;
  title: string;
  client: string;
  client_uid: string | null;
  status: WorkStatus;
  body: string;
  created_at: string;
  updated_at: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  client VARCHAR(255) NOT NULL,
  client_uid VARCHAR(255),
  status VARCHAR(50) DEFAULT 'inquiry' CHECK (status IN ('inquiry', 'active', 'done', 'archived')),
  body TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_slug ON jobs(slug);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_client_uid ON jobs(client_uid);
CREATE INDEX IF NOT EXISTS idx_jobs_search ON jobs USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(body, ''))
);
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _seedReady: Promise<void> | null = null;

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

function rowToSummary(row: JobRow): WorkJobSummary {
  return {
    slug: row.slug,
    title: row.title,
    client: row.client,
    contact_uid: row.client_uid ?? '',
    contact_name: row.client,
    status: row.status,
    source: 'db',
    created: row.created_at,
    updated: row.updated_at,
  };
}

export function rowToWorkDoc(row: JobRow): WorkJobDoc {
  const summary = rowToSummary(row);
  const body = row.body ?? '';
  return { ...summary, body, content: body };
}

async function seedJobsFromFiles(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM jobs');
  if ((rows[0]?.n ?? 0) > 0) return;

  for (const slug of listWorkFileSlugs()) {
    const doc = fileReadWork(slug);
    if (!doc) continue;
    await pool.query(
      `INSERT INTO jobs (slug, title, client, client_uid, status, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO NOTHING`,
      [
        slug,
        doc.title,
        doc.client || doc.contact_name || slug,
        doc.contact_uid || null,
        doc.status,
        doc.body,
      ],
    );
  }
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

  if (!_seedReady) {
    _seedReady = seedJobsFromFiles(pool).catch((e) => {
      _seedReady = null;
      console.error('[jobs:pg] seed error:', e);
    });
  }
  await _seedReady;

  return pool;
}

export function isWorkDbConfigured(): boolean {
  return !!databaseUrl();
}

export async function dbListWork(opts?: {
  contact_uid?: string;
  status?: WorkStatus;
  q?: string;
}): Promise<WorkJobSummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    const status = opts?.status ?? null;
    const clientUid = opts?.contact_uid?.trim() || null;
    const q = opts?.q?.trim() || null;

    const { rows } = await pool.query<JobRow>(
      `SELECT slug, title, client, client_uid, status, body, created_at, updated_at, id
       FROM jobs
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR client_uid = $2)
         AND (
           $3::text IS NULL
           OR to_tsvector('english', title || ' ' || COALESCE(body, '')) @@ plainto_tsquery('english', $3)
         )
       ORDER BY updated_at DESC`,
      [status, clientUid, q],
    );

    return rows.map(rowToSummary);
  } catch (e) {
    console.error('[jobs:pg] list error:', e);
    return null;
  }
}

export async function dbReadWork(slug: string): Promise<WorkJobDoc | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<JobRow>(
      `SELECT id, slug, title, client, client_uid, status, body, created_at, updated_at
       FROM jobs WHERE slug = $1`,
      [slug],
    );
    const row = rows[0];
    return row ? rowToWorkDoc(row) : null;
  } catch (e) {
    console.error('[jobs:pg] read error:', e);
    return null;
  }
}

export async function dbCreateWork(input: {
  slug: string;
  title: string;
  client: string;
  client_uid: string;
  status?: WorkStatus;
  body?: string;
}): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Work DB not configured — cannot save.' };

    const { rows } = await pool.query<JobRow>(
      `INSERT INTO jobs (slug, title, client, client_uid, status, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, slug, title, client, client_uid, status, body, created_at, updated_at`,
      [
        input.slug,
        input.title.trim(),
        input.client.trim(),
        input.client_uid.trim(),
        normalizeWorkStatus(input.status),
        (input.body ?? '').trim(),
      ],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Insert failed' };
    return { ok: true, doc: rowToWorkDoc(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate key|unique constraint/i.test(msg)) {
      return { ok: false, error: 'slug already exists' };
    }
    return { ok: false, error: msg };
  }
}

export async function dbUpdateWork(
  slug: string,
  input: {
    title?: string;
    client?: string;
    client_uid?: string;
    status?: WorkStatus;
    body?: string;
  },
): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Work DB not configured — cannot save.' };

    const { rows } = await pool.query<JobRow>(
      `UPDATE jobs SET
         title = COALESCE($2, title),
         client = COALESCE($3, client),
         client_uid = COALESCE($4, client_uid),
         status = COALESCE($5, status),
         body = COALESCE($6, body),
         updated_at = NOW()
       WHERE slug = $1
       RETURNING id, slug, title, client, client_uid, status, body, created_at, updated_at`,
      [
        slug,
        input.title?.trim() ?? null,
        input.client?.trim() ?? null,
        input.client_uid?.trim() ?? null,
        input.status ?? null,
        input.body != null ? input.body.trim() : null,
      ],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Not found' };
    return { ok: true, doc: rowToWorkDoc(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbDeleteWork(slug: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Work DB not configured — cannot save.' };

    const { rowCount } = await pool.query(`DELETE FROM jobs WHERE slug = $1`, [slug]);
    if ((rowCount ?? 0) === 0) return { ok: false, error: 'Not found' };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
