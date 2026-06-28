/**
 * Persisted log of inbound email triage results for the dashboard Email tab.
 * Postgres (DATABASE_URL) when set, otherwise JSON file under src/knowledge/.
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { serverEnv } from './serverEnv';
import type { EmailCategory } from './emailProcessor';

export interface EmailInboxRecord {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  bodySnippet: string;
  status: string;
  action: string;
  notified: boolean;
  summary: string;
  category: EmailCategory;
  contactUid: string | null;
  contactName: string | null;
  jobSlug: string | null;
  jobTitle: string | null;
  routeNote: string;
}

export interface EmailInboxInput {
  from: string;
  subject: string;
  bodySnippet: string;
  status: string;
  action: string;
  notified: boolean;
  summary?: string;
  category?: EmailCategory;
  contactUid?: string | null;
  contactName?: string | null;
  jobSlug?: string | null;
  jobTitle?: string | null;
  routeNote?: string;
}

export interface EmailInboxDigest {
  total: number;
  visible: number;
  junkHidden: number;
  client: number;
  filed: number;
  review: number;
  alert: number;
}

const MAX_FILE_EVENTS = 500;

/** Base table only — indexes run after column migration (old DBs may lack category). */
const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS email_inbox (
  id            UUID PRIMARY KEY,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_address  TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL DEFAULT '',
  body_snippet  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'UNMATCHED',
  action        TEXT NOT NULL DEFAULT 'classified',
  notified      BOOLEAN NOT NULL DEFAULT false
);
`;

const MIGRATE_COLUMNS = [
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'review'`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS contact_uid TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS contact_name TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS job_slug TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS job_title TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS route_note TEXT NOT NULL DEFAULT ''`,
];

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS email_inbox_received_idx ON email_inbox (received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS email_inbox_category_idx ON email_inbox (category)`,
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

function inboxFilePath(): string {
  const override = serverEnv('EMAIL_INBOX_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'email-inbox.json');
}

type InboxRow = {
  id: string;
  received_at: Date | string;
  from_address: string;
  subject: string;
  body_snippet: string;
  status: string;
  action: string;
  notified: boolean;
  summary?: string;
  category?: string;
  contact_uid?: string | null;
  contact_name?: string | null;
  job_slug?: string | null;
  job_title?: string | null;
  route_note?: string;
};

function normalizeCategory(raw: string | undefined): EmailCategory {
  const c = String(raw ?? 'review').toLowerCase();
  if (c === 'junk' || c === 'client' || c === 'alert' || c === 'internal' || c === 'review') {
    return c;
  }
  return 'review';
}

function rowToRecord(row: InboxRow): EmailInboxRecord {
  return {
    id: row.id,
    receivedAt: new Date(row.received_at).toISOString(),
    from: row.from_address,
    subject: row.subject,
    bodySnippet: row.body_snippet,
    status: row.status,
    action: row.action,
    notified: !!row.notified,
    summary: row.summary ?? row.body_snippet ?? '',
    category: normalizeCategory(row.category),
    contactUid: row.contact_uid ?? null,
    contactName: row.contact_name ?? null,
    jobSlug: row.job_slug ?? null,
    jobTitle: row.job_title ?? null,
    routeNote: row.route_note ?? '',
  };
}

function parseFileEvents(raw: string): EmailInboxRecord[] {
  try {
    const data = JSON.parse(raw) as { events?: EmailInboxRecord[] };
    if (!data || !Array.isArray(data.events)) return [];
    return data.events.map((e) => ({
      id: String(e.id),
      receivedAt: String(e.receivedAt),
      from: String(e.from ?? ''),
      subject: String(e.subject ?? ''),
      bodySnippet: String(e.bodySnippet ?? ''),
      status: String(e.status ?? 'UNMATCHED'),
      action: String(e.action ?? 'classified'),
      notified: !!e.notified,
      summary: String(e.summary ?? e.bodySnippet ?? ''),
      category: normalizeCategory(e.category),
      contactUid: e.contactUid ?? null,
      contactName: e.contactName ?? null,
      jobSlug: e.jobSlug ?? null,
      jobTitle: e.jobTitle ?? null,
      routeNote: String(e.routeNote ?? ''),
    }));
  } catch {
    return [];
  }
}

function writeFileEvents(events: EmailInboxRecord[]): boolean {
  try {
    const path = inboxFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ events }, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[email-inbox] file write failed', e);
    return false;
  }
}

export function emailInboxStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export function computeInboxDigest(events: EmailInboxRecord[], hideJunk: boolean): EmailInboxDigest {
  const junkHidden = events.filter((e) => e.category === 'junk').length;
  const visibleEvents = hideJunk ? events.filter((e) => e.category !== 'junk') : events;
  return {
    total: events.length,
    visible: visibleEvents.length,
    junkHidden,
    client: events.filter((e) => e.category === 'client').length,
    filed: events.filter((e) => e.action === 'filed').length,
    review: events.filter((e) => e.category === 'review').length,
    alert: events.filter((e) => e.category === 'alert').length,
  };
}

async function listFromFile(limit: number, hideJunk: boolean): Promise<EmailInboxRecord[]> {
  const path = inboxFilePath();
  if (!existsSync(path)) return [];
  let events = parseFileEvents(readFileSync(path, 'utf8'));
  events = events.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  if (hideJunk) events = events.filter((e) => e.category !== 'junk');
  return events.slice(0, limit);
}

async function appendToFile(input: EmailInboxInput): Promise<EmailInboxRecord | null> {
  const path = inboxFilePath();
  const existing = existsSync(path) ? parseFileEvents(readFileSync(path, 'utf8')) : [];
  const record: EmailInboxRecord = {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    from: input.from,
    subject: input.subject,
    bodySnippet: input.bodySnippet,
    status: input.status,
    action: input.action,
    notified: input.notified,
    summary: input.summary ?? input.bodySnippet,
    category: input.category ?? 'review',
    contactUid: input.contactUid ?? null,
    contactName: input.contactName ?? null,
    jobSlug: input.jobSlug ?? null,
    jobTitle: input.jobTitle ?? null,
    routeNote: input.routeNote ?? '',
  };
  const next = [record, ...existing].slice(0, MAX_FILE_EVENTS);
  if (!writeFileEvents(next)) return null;
  return record;
}

async function listFromPg(limit: number, hideJunk: boolean): Promise<EmailInboxRecord[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const junkFilter = hideJunk ? `AND category <> 'junk'` : '';
    const { rows } = await pool.query(
      `SELECT id, received_at, from_address, subject, body_snippet, status, action, notified,
              summary, category, contact_uid, contact_name, job_slug, job_title, route_note
       FROM email_inbox WHERE 1=1 ${junkFilter}
       ORDER BY received_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToRecord);
  } catch (e) {
    console.error('[email-inbox] pg list failed', e);
    return [];
  }
}

async function listAllFromPg(limit: number): Promise<EmailInboxRecord[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const { rows } = await pool.query(
      `SELECT id, received_at, from_address, subject, body_snippet, status, action, notified,
              summary, category, contact_uid, contact_name, job_slug, job_title, route_note
       FROM email_inbox ORDER BY received_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToRecord);
  } catch (e) {
    console.error('[email-inbox] pg list all failed', e);
    return [];
  }
}

async function appendToPg(input: EmailInboxInput): Promise<EmailInboxRecord | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO email_inbox
        (id, from_address, subject, body_snippet, status, action, notified,
         summary, category, contact_uid, contact_name, job_slug, job_title, route_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, received_at, from_address, subject, body_snippet, status, action, notified,
                 summary, category, contact_uid, contact_name, job_slug, job_title, route_note`,
      [
        id,
        input.from,
        input.subject,
        input.bodySnippet,
        input.status,
        input.action,
        input.notified,
        input.summary ?? input.bodySnippet,
        input.category ?? 'review',
        input.contactUid ?? null,
        input.contactName ?? null,
        input.jobSlug ?? null,
        input.jobTitle ?? null,
        input.routeNote ?? '',
      ],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch (e) {
    console.error('[email-inbox] pg append failed', e);
    return null;
  }
}

export async function storeListEmailInbox(
  limit = 100,
  opts?: { hideJunk?: boolean; forDigest?: boolean },
): Promise<EmailInboxRecord[]> {
  const hideJunk = opts?.hideJunk !== false;
  if (databaseUrl()) {
    if (opts?.forDigest) return listAllFromPg(limit);
    return listFromPg(limit, hideJunk);
  }
  return listFromFile(limit, hideJunk);
}

export async function storeRecordEmailInbox(input: EmailInboxInput): Promise<EmailInboxRecord | null> {
  if (databaseUrl()) return appendToPg(input);
  return appendToFile(input);
}

export type EmailInboxPatch = Partial<Pick<EmailInboxInput, 'category' | 'action' | 'status'>>;

async function updateInFile(id: string, patch: EmailInboxPatch): Promise<EmailInboxRecord | null> {
  const path = inboxFilePath();
  if (!existsSync(path)) return null;
  const events = parseFileEvents(readFileSync(path, 'utf8'));
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const cur = events[idx]!;
  const next: EmailInboxRecord = {
    ...cur,
    ...(patch.status != null ? { status: patch.status } : {}),
    ...(patch.action != null ? { action: patch.action } : {}),
    ...(patch.category != null ? { category: normalizeCategory(patch.category) } : {}),
  };
  events[idx] = next;
  if (!writeFileEvents(events)) return null;
  return next;
}

async function deleteFromFile(id: string): Promise<boolean> {
  const path = inboxFilePath();
  if (!existsSync(path)) return false;
  const events = parseFileEvents(readFileSync(path, 'utf8'));
  const next = events.filter((e) => e.id !== id);
  if (next.length === events.length) return false;
  return writeFileEvents(next);
}

async function updateInPg(id: string, patch: EmailInboxPatch): Promise<EmailInboxRecord | null> {
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
    if (patch.action != null) {
      sets.push(`action = $${i++}`);
      vals.push(patch.action);
    }
    if (patch.category != null) {
      sets.push(`category = $${i++}`);
      vals.push(normalizeCategory(patch.category));
    }
    if (!sets.length) return null;
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE email_inbox SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, received_at, from_address, subject, body_snippet, status, action, notified,
                 summary, category, contact_uid, contact_name, job_slug, job_title, route_note`,
      vals,
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch (e) {
    console.error('[email-inbox] pg update failed', e);
    return null;
  }
}

async function deleteFromPg(id: string): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const { rowCount } = await pool.query(`DELETE FROM email_inbox WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[email-inbox] pg delete failed', e);
    return false;
  }
}

export async function storeUpdateEmailInbox(
  id: string,
  patch: EmailInboxPatch,
): Promise<EmailInboxRecord | null> {
  if (databaseUrl()) return updateInPg(id, patch);
  return updateInFile(id, patch);
}

export async function storeDeleteEmailInbox(id: string): Promise<boolean> {
  if (databaseUrl()) return deleteFromPg(id);
  return deleteFromFile(id);
}
