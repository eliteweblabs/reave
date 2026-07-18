/**
 * Persistence for the newsletter / email-automation feature.
 *
 * Three concerns, one store:
 *   - newsletter_queue        — scheduled + sent emails (the send log)
 *   - newsletter_unsubscribes — suppression list (email -> unsubscribed)
 *   - newsletter_automations  — per-install rule overrides (enable/disable, timing)
 *
 * Postgres (DATABASE_URL) when set, otherwise JSON files under src/knowledge/
 * (dev fallback, mirrors emailInboxStore).
 */
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { serverEnv } from './serverEnv';
import type { NewsletterAutomationOverride } from './newsletterAutomations';

export type NewsletterSendStatus = 'pending' | 'sent' | 'skipped' | 'failed' | 'canceled';

export interface NewsletterSend {
  id: string;
  templateId: string;
  /** Automation id, or 'broadcast' / 'manual' for one-off sends. */
  source: string;
  trigger: string;
  contactUid: string | null;
  toEmail: string;
  firstName: string;
  subject: string;
  status: NewsletterSendStatus;
  dueAt: string;
  sentAt: string | null;
  jobSlug: string | null;
  /** Rendering context (JSON) so the scheduler can build the email at send time. */
  context: Record<string, unknown>;
  /** Unique guard so an automation only enqueues once per subject. */
  dedupKey: string | null;
  resendId: string | null;
  error: string | null;
  createdAt: string;
}

export interface NewsletterEnqueueInput {
  templateId: string;
  source: string;
  trigger: string;
  contactUid?: string | null;
  toEmail: string;
  firstName?: string;
  subject?: string;
  dueAt: Date | string;
  jobSlug?: string | null;
  context?: Record<string, unknown>;
  dedupKey?: string | null;
}

// ─────────────────────────── pool + schema ───────────────────────────

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;

function databaseUrl(): string | undefined {
  return serverEnv('DATABASE_URL')?.trim() || undefined;
}

export function newsletterStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
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

const QUEUE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS newsletter_queue (
  id           UUID PRIMARY KEY,
  template_id  TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual',
  trigger      TEXT NOT NULL DEFAULT '',
  contact_uid  TEXT,
  to_email     TEXT NOT NULL,
  first_name   TEXT NOT NULL DEFAULT '',
  subject      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',
  due_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  job_slug     TEXT,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key    TEXT,
  resend_id    TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const UNSUB_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS newsletter_unsubscribes (
  email          TEXT PRIMARY KEY,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source         TEXT NOT NULL DEFAULT 'link'
);
`;

const AUTOMATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS newsletter_automations (
  id            TEXT PRIMARY KEY,
  enabled       BOOLEAN,
  delay_minutes INTEGER,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

const INDEX_SQL = [
  `CREATE UNIQUE INDEX IF NOT EXISTS newsletter_queue_dedup_idx ON newsletter_queue (dedup_key) WHERE dedup_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS newsletter_queue_due_idx ON newsletter_queue (status, due_at)`,
  `CREATE INDEX IF NOT EXISTS newsletter_queue_created_idx ON newsletter_queue (created_at DESC)`,
];

const QUEUE_SELECT = `id, template_id, source, trigger, contact_uid, to_email, first_name, subject,
  status, due_at, sent_at, job_slug, context, dedup_key, resend_id, error, created_at`;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = (async () => {
      await pool.query(QUEUE_TABLE_SQL);
      await pool.query(UNSUB_TABLE_SQL);
      await pool.query(AUTOMATION_TABLE_SQL);
      for (const sql of INDEX_SQL) await pool.query(sql);
    })().catch((e) => {
      _schemaReady = null;
      throw e;
    });
  }
  await _schemaReady;
  return pool;
}

// ─────────────────────────── file fallback ───────────────────────────

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function filePath(name: string): string {
  return join(projectRoot(), 'src', 'knowledge', name);
}

interface FileShape {
  queue: NewsletterSend[];
  unsubscribes: { email: string; unsubscribedAt: string; source: string }[];
  automations: Record<string, NewsletterAutomationOverride>;
}

function readFileStore(): FileShape {
  const path = filePath('newsletter.json');
  if (!existsSync(path)) return { queue: [], unsubscribes: [], automations: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<FileShape>;
    return {
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      unsubscribes: Array.isArray(parsed.unsubscribes) ? parsed.unsubscribes : [],
      automations: parsed.automations && typeof parsed.automations === 'object' ? parsed.automations : {},
    };
  } catch {
    return { queue: [], unsubscribes: [], automations: {} };
  }
}

function writeFileStore(data: FileShape): boolean {
  try {
    const path = filePath('newsletter.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[newsletter] file write failed', e);
    return false;
  }
}

// ─────────────────────────── row mapping ───────────────────────────

type QueueRow = {
  id: string;
  template_id: string;
  source: string;
  trigger: string;
  contact_uid: string | null;
  to_email: string;
  first_name: string;
  subject: string;
  status: string;
  due_at: Date | string;
  sent_at: Date | string | null;
  job_slug: string | null;
  context: Record<string, unknown> | null;
  dedup_key: string | null;
  resend_id: string | null;
  error: string | null;
  created_at: Date | string;
};

function normalizeStatus(raw: string | undefined): NewsletterSendStatus {
  const s = String(raw ?? 'pending').toLowerCase();
  if (s === 'pending' || s === 'sent' || s === 'skipped' || s === 'failed' || s === 'canceled') return s;
  return 'pending';
}

function rowToSend(row: QueueRow): NewsletterSend {
  return {
    id: row.id,
    templateId: row.template_id,
    source: row.source,
    trigger: row.trigger,
    contactUid: row.contact_uid,
    toEmail: row.to_email,
    firstName: row.first_name ?? '',
    subject: row.subject ?? '',
    status: normalizeStatus(row.status),
    dueAt: new Date(row.due_at).toISOString(),
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    jobSlug: row.job_slug,
    context: row.context && typeof row.context === 'object' ? row.context : {},
    dedupKey: row.dedup_key,
    resendId: row.resend_id,
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ─────────────────────────── queue: enqueue ───────────────────────────

/** Insert a scheduled send. Returns null when dedup_key already exists. */
export async function enqueueNewsletterSend(
  input: NewsletterEnqueueInput,
): Promise<NewsletterSend | null> {
  const dueAtIso = new Date(input.dueAt).toISOString();
  const base: NewsletterSend = {
    id: randomUUID(),
    templateId: input.templateId,
    source: input.source,
    trigger: input.trigger || '',
    contactUid: input.contactUid ?? null,
    toEmail: input.toEmail.trim(),
    firstName: input.firstName ?? '',
    subject: input.subject ?? '',
    status: 'pending',
    dueAt: dueAtIso,
    sentAt: null,
    jobSlug: input.jobSlug ?? null,
    context: input.context ?? {},
    dedupKey: input.dedupKey ?? null,
    resendId: null,
    error: null,
    createdAt: new Date().toISOString(),
  };

  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return null;
      const { rows } = await pool.query(
        `INSERT INTO newsletter_queue
          (id, template_id, source, trigger, contact_uid, to_email, first_name, subject,
           status, due_at, job_slug, context, dedup_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11::jsonb,$12)
         ON CONFLICT (dedup_key) DO NOTHING
         RETURNING ${QUEUE_SELECT}`,
        [
          base.id,
          base.templateId,
          base.source,
          base.trigger,
          base.contactUid,
          base.toEmail,
          base.firstName,
          base.subject,
          dueAtIso,
          base.jobSlug,
          JSON.stringify(base.context),
          base.dedupKey,
        ],
      );
      return rows[0] ? rowToSend(rows[0]) : null;
    } catch (e) {
      console.error('[newsletter] enqueue failed', e);
      return null;
    }
  }

  const data = readFileStore();
  if (base.dedupKey && data.queue.some((q) => q.dedupKey === base.dedupKey)) return null;
  data.queue.unshift(base);
  data.queue = data.queue.slice(0, 1000);
  return writeFileStore(data) ? base : null;
}

// ─────────────────────────── queue: read/update ───────────────────────────

export async function listDueNewsletterSends(limit = 50): Promise<NewsletterSend[]> {
  const nowIso = new Date().toISOString();
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return [];
      const { rows } = await pool.query(
        `SELECT ${QUEUE_SELECT} FROM newsletter_queue
         WHERE status = 'pending' AND due_at <= $1
         ORDER BY due_at ASC LIMIT $2`,
        [nowIso, limit],
      );
      return rows.map(rowToSend);
    } catch (e) {
      console.error('[newsletter] list due failed', e);
      return [];
    }
  }
  const data = readFileStore();
  return data.queue
    .filter((q) => q.status === 'pending' && q.dueAt <= nowIso)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, limit);
}

export async function listNewsletterSends(opts?: {
  limit?: number;
  status?: NewsletterSendStatus;
}): Promise<NewsletterSend[]> {
  const limit = opts?.limit ?? 100;
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return [];
      const where = opts?.status ? `WHERE status = $2` : '';
      const params: unknown[] = [limit];
      if (opts?.status) params.push(opts.status);
      const { rows } = await pool.query(
        `SELECT ${QUEUE_SELECT} FROM newsletter_queue ${where}
         ORDER BY created_at DESC LIMIT $1`,
        params,
      );
      return rows.map(rowToSend);
    } catch (e) {
      console.error('[newsletter] list sends failed', e);
      return [];
    }
  }
  const data = readFileStore();
  let list = data.queue.slice();
  if (opts?.status) list = list.filter((q) => q.status === opts.status);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export interface NewsletterSendPatch {
  status?: NewsletterSendStatus;
  sentAt?: string | null;
  subject?: string;
  resendId?: string | null;
  error?: string | null;
}

export async function updateNewsletterSend(
  id: string,
  patch: NewsletterSendPatch,
): Promise<NewsletterSend | null> {
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return null;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (patch.status != null) {
        sets.push(`status = $${i++}`);
        vals.push(patch.status);
      }
      if (patch.sentAt !== undefined) {
        sets.push(`sent_at = $${i++}`);
        vals.push(patch.sentAt);
      }
      if (patch.subject !== undefined) {
        sets.push(`subject = $${i++}`);
        vals.push(patch.subject);
      }
      if (patch.resendId !== undefined) {
        sets.push(`resend_id = $${i++}`);
        vals.push(patch.resendId);
      }
      if (patch.error !== undefined) {
        sets.push(`error = $${i++}`);
        vals.push(patch.error);
      }
      if (!sets.length) return null;
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE newsletter_queue SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${QUEUE_SELECT}`,
        vals,
      );
      return rows[0] ? rowToSend(rows[0]) : null;
    } catch (e) {
      console.error('[newsletter] update send failed', e);
      return null;
    }
  }
  const data = readFileStore();
  const idx = data.queue.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  const cur = data.queue[idx]!;
  const next: NewsletterSend = {
    ...cur,
    ...(patch.status != null ? { status: patch.status } : {}),
    ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt } : {}),
    ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
    ...(patch.resendId !== undefined ? { resendId: patch.resendId } : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
  };
  data.queue[idx] = next;
  return writeFileStore(data) ? next : null;
}

// ─────────────────────────── unsubscribes ───────────────────────────

export async function isUnsubscribed(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return false;
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return false;
      const { rows } = await pool.query(
        `SELECT 1 FROM newsletter_unsubscribes WHERE email = $1 LIMIT 1`,
        [normalized],
      );
      return rows.length > 0;
    } catch (e) {
      console.error('[newsletter] unsub check failed', e);
      return false;
    }
  }
  return readFileStore().unsubscribes.some((u) => u.email === normalized);
}

export async function addUnsubscribe(email: string, source = 'link'): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (!normalized.includes('@')) return false;
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return false;
      await pool.query(
        `INSERT INTO newsletter_unsubscribes (email, source) VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING`,
        [normalized, source],
      );
      return true;
    } catch (e) {
      console.error('[newsletter] add unsub failed', e);
      return false;
    }
  }
  const data = readFileStore();
  if (!data.unsubscribes.some((u) => u.email === normalized)) {
    data.unsubscribes.unshift({ email: normalized, unsubscribedAt: new Date().toISOString(), source });
  }
  return writeFileStore(data);
}

export async function removeUnsubscribe(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return false;
      await pool.query(`DELETE FROM newsletter_unsubscribes WHERE email = $1`, [normalized]);
      return true;
    } catch (e) {
      console.error('[newsletter] remove unsub failed', e);
      return false;
    }
  }
  const data = readFileStore();
  data.unsubscribes = data.unsubscribes.filter((u) => u.email !== normalized);
  return writeFileStore(data);
}

// ─────────────────────────── automation overrides ───────────────────────────

export async function getAutomationOverrides(): Promise<Record<string, NewsletterAutomationOverride>> {
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return {};
      const { rows } = await pool.query(
        `SELECT id, enabled, delay_minutes FROM newsletter_automations`,
      );
      const out: Record<string, NewsletterAutomationOverride> = {};
      for (const r of rows as { id: string; enabled: boolean | null; delay_minutes: number | null }[]) {
        out[r.id] = {
          ...(r.enabled != null ? { enabled: r.enabled } : {}),
          ...(r.delay_minutes != null ? { delayMinutes: r.delay_minutes } : {}),
        };
      }
      return out;
    } catch (e) {
      console.error('[newsletter] get overrides failed', e);
      return {};
    }
  }
  return readFileStore().automations;
}

export async function setAutomationOverride(
  id: string,
  override: NewsletterAutomationOverride,
): Promise<boolean> {
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return false;
      await pool.query(
        `INSERT INTO newsletter_automations (id, enabled, delay_minutes, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET
           enabled = COALESCE($2, newsletter_automations.enabled),
           delay_minutes = COALESCE($3, newsletter_automations.delay_minutes),
           updated_at = now()`,
        [
          id,
          override.enabled === undefined ? null : override.enabled,
          override.delayMinutes === undefined ? null : Math.round(override.delayMinutes),
        ],
      );
      return true;
    } catch (e) {
      console.error('[newsletter] set override failed', e);
      return false;
    }
  }
  const data = readFileStore();
  data.automations[id] = { ...data.automations[id], ...override };
  return writeFileStore(data);
}
