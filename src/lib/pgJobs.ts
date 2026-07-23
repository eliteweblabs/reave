/**
 * Postgres-backed work/jobs store (Railway DATABASE_URL).
 * Schema is ensured on first use; existing markdown job files are seeded when empty.
 */

import pg from 'pg';
import {
  fileReadWork,
  listWorkFileSlugs,
  normalizeWorkPriority,
  normalizeWorkStatus,
  type WorkJobDoc,
  type WorkJobSummary,
  type WorkPriority,
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
  priority: WorkPriority;
  due_date: string | null;
  value: string | null;
  tags: string[];
  source: string;
  source_chat_id: string | null;
  body: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function pgTimestamp(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const JOB_COLUMNS = `
  id, slug, title, client, client_uid, status, priority, due_date, value, tags, source, source_chat_id, body, created_at, updated_at
`;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  client VARCHAR(255) NOT NULL,
  client_uid VARCHAR(255),
  status VARCHAR(50) DEFAULT 'inquiry' CHECK (status IN ('inquiry', 'active', 'archived')),
  priority VARCHAR(50) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date DATE,
  value NUMERIC(12,2),
  tags TEXT[] DEFAULT '{}',
  source VARCHAR(100) DEFAULT '',
  body TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_slug ON jobs(slug);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_client_uid ON jobs(client_uid);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_due_date ON jobs(due_date);
CREATE INDEX IF NOT EXISTS idx_jobs_tags ON jobs USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_jobs_search ON jobs USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(body, ''))
);
CREATE TABLE IF NOT EXISTS job_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_slug VARCHAR(255) NOT NULL,
  author VARCHAR(20) NOT NULL CHECK (author IN ('client', 'staff')),
  author_name VARCHAR(255) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_comments_slug ON job_comments(job_slug);
CREATE INDEX IF NOT EXISTS idx_job_comments_created ON job_comments(job_slug, created_at);
ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS staff_ack_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_job_comments_pending ON job_comments(staff_ack_at) WHERE staff_ack_at IS NULL;
`;

const MIGRATE_SQL = `
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority VARCHAR(50) NOT NULL DEFAULT 'normal';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS value NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_chat_id TEXT;
UPDATE jobs SET status = 'archived' WHERE status = 'done';
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('inquiry', 'active', 'archived'));
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
    status: normalizeWorkStatus(row.status),
    priority: normalizeWorkPriority(row.priority),
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    value: row.value != null ? Number(row.value) : null,
    tags: row.tags ?? [],
    source: row.source ?? '',
    record_origin: 'db',
    source_chat_id: row.source_chat_id?.trim() || undefined,
    created: pgTimestamp(row.created_at),
    updated: pgTimestamp(row.updated_at),
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
      `INSERT INTO jobs (slug, title, client, client_uid, status, priority, due_date, value, tags, source, source_chat_id, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (slug) DO NOTHING`,
      [
        slug,
        doc.title,
        doc.client || doc.contact_name || slug,
        doc.contact_uid || null,
        doc.status,
        doc.priority,
        doc.due_date,
        doc.value,
        doc.tags,
        doc.source,
        doc.source_chat_id || null,
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
      .query(`${SCHEMA_SQL}\n${MIGRATE_SQL}`)
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
      `SELECT ${JOB_COLUMNS}
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
      `SELECT ${JOB_COLUMNS} FROM jobs WHERE slug = $1`,
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
  priority?: WorkPriority;
  due_date?: string | null;
  value?: number | null;
  tags?: string[];
  source?: string;
  source_chat_id?: string | null;
  body?: string;
}): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Work DB not configured — cannot save.' };

    const { rows } = await pool.query<JobRow>(
      `INSERT INTO jobs (slug, title, client, client_uid, status, priority, due_date, value, tags, source, source_chat_id, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${JOB_COLUMNS}`,
      [
        input.slug,
        input.title.trim(),
        input.client.trim(),
        input.client_uid.trim(),
        normalizeWorkStatus(input.status),
        normalizeWorkPriority(input.priority),
        input.due_date || null,
        input.value ?? null,
        input.tags ?? [],
        input.source?.trim() ?? '',
        input.source_chat_id?.trim() || null,
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
    priority?: WorkPriority;
    due_date?: string | null;
    value?: number | null;
    tags?: string[];
    source?: string;
    source_chat_id?: string | null;
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
         priority = COALESCE($6, priority),
         due_date = COALESCE($7::date, due_date),
         value = COALESCE($8::numeric, value),
         tags = COALESCE($9, tags),
         source = COALESCE($10, source),
         source_chat_id = COALESCE($12, source_chat_id),
         body = COALESCE($11, body),
         updated_at = NOW()
       WHERE slug = $1
       RETURNING ${JOB_COLUMNS}`,
      [
        slug,
        input.title?.trim() ?? null,
        input.client?.trim() ?? null,
        input.client_uid?.trim() ?? null,
        input.status ?? null,
        input.priority ?? null,
        input.due_date === undefined ? null : input.due_date,
        input.value === undefined ? null : input.value,
        input.tags ?? null,
        input.source?.trim() ?? null,
        input.body != null ? input.body.trim() : null,
        input.source_chat_id === undefined ? null : input.source_chat_id,
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

export async function dbAppendWorkNote(
  slug: string,
  block: string,
): Promise<{ ok: true; doc: WorkJobDoc } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Work DB not configured — cannot save.' };

    const { rows } = await pool.query<JobRow>(
      `UPDATE jobs SET body = COALESCE(body, '') || $2, updated_at = NOW()
       WHERE slug = $1
       RETURNING ${JOB_COLUMNS}`,
      [slug, block],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Not found' };
    return { ok: true, doc: rowToWorkDoc(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbListJobsBySourceChatId(chatId: string): Promise<WorkJobSummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<JobRow>(
      `SELECT ${JOB_COLUMNS} FROM jobs WHERE source_chat_id = $1 ORDER BY updated_at DESC`,
      [chatId.trim()],
    );
    return rows.map(rowToSummary);
  } catch (e) {
    console.error('[jobs:pg] list by source_chat_id error:', e);
    return null;
  }
}

export async function dbPatchWorkSourceChatId(slug: string, chatId: string): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const { rowCount } = await pool.query(
      `UPDATE jobs SET source_chat_id = $2, updated_at = NOW()
       WHERE slug = $1 AND (source_chat_id IS NULL OR source_chat_id = '')`,
      [slug, chatId.trim()],
    );
    return (rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[jobs:pg] patch source_chat_id error:', e);
    return false;
  }
}

export async function dbDeleteWork(slug: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Work DB not configured — cannot save.' };

    await pool.query(`DELETE FROM job_comments WHERE job_slug = $1`, [slug]);
    const { rowCount } = await pool.query(`DELETE FROM jobs WHERE slug = $1`, [slug]);
    if ((rowCount ?? 0) === 0) return { ok: false, error: 'Not found' };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export interface JobCommentRow {
  id: string;
  job_slug: string;
  author: 'client' | 'staff';
  author_name: string;
  body: string;
  created_at: string;
  staff_ack_at: string | null;
}

function rowToComment(row: JobCommentRow) {
  return {
    id: row.id,
    slug: row.job_slug,
    author: row.author,
    authorName: row.author_name || (row.author === 'client' ? 'Client' : 'Team'),
    text: row.body,
    createdAt: row.created_at,
    staffAckAt: row.staff_ack_at,
  };
}

export async function dbListJobComments(slug: string) {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<JobCommentRow>(
      `SELECT id, job_slug, author, author_name, body, created_at, staff_ack_at
       FROM job_comments
       WHERE job_slug = $1
       ORDER BY created_at ASC`,
      [slug],
    );
    return rows.map(rowToComment);
  } catch (e) {
    console.error('[jobs:pg] list comments error:', e);
    return null;
  }
}

export async function dbListJobCommentsForSlugs(slugs: string[]) {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    if (!slugs.length) return {};

    const { rows } = await pool.query<JobCommentRow>(
      `SELECT id, job_slug, author, author_name, body, created_at, staff_ack_at
       FROM job_comments
       WHERE job_slug = ANY($1::text[])
       ORDER BY created_at ASC`,
      [slugs],
    );

    const out: Record<string, ReturnType<typeof rowToComment>[]> = {};
    for (const slug of slugs) out[slug] = [];
    for (const row of rows) {
      const list = out[row.job_slug] ?? [];
      list.push(rowToComment(row));
      out[row.job_slug] = list;
    }
    return out;
  } catch (e) {
    console.error('[jobs:pg] list comments batch error:', e);
    return null;
  }
}

export async function dbAddJobComment(
  slug: string,
  input: { author: 'client' | 'staff'; authorName: string; text: string },
): Promise<{ ok: true; comment: ReturnType<typeof rowToComment> } | { ok: false; error: string } | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    const text = input.text.trim();
    if (!text) return { ok: false, error: 'Comment is required' };

    const staffAckAt = input.author === 'staff' ? new Date() : null;
    const { rows } = await pool.query<JobCommentRow>(
      `INSERT INTO job_comments (job_slug, author, author_name, body, staff_ack_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, job_slug, author, author_name, body, created_at, staff_ack_at`,
      [slug, input.author, input.authorName.trim(), text, staffAckAt],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Insert failed' };
    return { ok: true, comment: rowToComment(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbListPendingJobComments() {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<
      JobCommentRow & { job_title: string }
    >(
      `SELECT c.id, c.job_slug, c.author, c.author_name, c.body, c.created_at, c.staff_ack_at,
              COALESCE(j.title, c.job_slug) AS job_title
       FROM job_comments c
       LEFT JOIN jobs j ON j.slug = c.job_slug
       WHERE c.author = 'client' AND c.staff_ack_at IS NULL
       ORDER BY c.created_at DESC`,
    );
    return rows.map((row) => ({
      ...rowToComment(row),
      jobTitle: row.job_title,
    }));
  } catch (e) {
    console.error('[jobs:pg] list pending comments error:', e);
    return null;
  }
}

export async function dbAckJobComment(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string } | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rowCount } = await pool.query(
      `UPDATE job_comments SET staff_ack_at = NOW()
       WHERE id = $1::uuid AND staff_ack_at IS NULL`,
      [commentId],
    );
    if (!rowCount) return { ok: false, error: 'Not found' };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbAckJobCommentsForSlug(
  slug: string,
): Promise<{ ok: true; acked: number } | { ok: false; error: string } | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rowCount } = await pool.query(
      `UPDATE job_comments SET staff_ack_at = NOW()
       WHERE job_slug = $1 AND author = 'client' AND staff_ack_at IS NULL`,
      [slug],
    );
    return { ok: true, acked: rowCount ?? 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
