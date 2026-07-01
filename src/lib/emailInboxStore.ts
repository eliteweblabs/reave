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
  proposedMeetingStart: string | null;
  schedulingNote: string;
  bookingUid: string | null;
  bookingStart: string | null;
  /** Set when the message has scrolled into view in the inbox list (server-synced). */
  seenAt: string | null;
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
  proposedMeetingStart?: string | null;
  schedulingNote?: string;
  bookingUid?: string | null;
  bookingStart?: string | null;
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
  // Base columns — older partial tables may exist without these (CREATE TABLE IF NOT EXISTS skips them).
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS from_address TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS body_snippet TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'UNMATCHED'`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'classified'`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'review'`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS contact_uid TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS contact_name TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS job_slug TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS job_title TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS route_note TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS proposed_meeting_start TIMESTAMPTZ`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS scheduling_note TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS booking_uid TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS booking_start TIMESTAMPTZ`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ`,
];

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS email_inbox_received_idx ON email_inbox (received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS email_inbox_category_idx ON email_inbox (category)`,
  `CREATE INDEX IF NOT EXISTS email_inbox_job_slug_idx ON email_inbox (job_slug) WHERE job_slug IS NOT NULL`,
];

const INBOX_SELECT = `id, received_at, from_address, subject, body_snippet, status, action, notified,
              summary, category, contact_uid, contact_name, job_slug, job_title, route_note,
              proposed_meeting_start, scheduling_note, booking_uid, booking_start, seen_at`;

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
  proposed_meeting_start?: Date | string | null;
  scheduling_note?: string;
  booking_uid?: string | null;
  booking_start?: Date | string | null;
  seen_at?: Date | string | null;
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
    proposedMeetingStart: row.proposed_meeting_start
      ? new Date(row.proposed_meeting_start).toISOString()
      : null,
    schedulingNote: row.scheduling_note ?? '',
    bookingUid: row.booking_uid ?? null,
    bookingStart: row.booking_start ? new Date(row.booking_start).toISOString() : null,
    seenAt: row.seen_at ? new Date(row.seen_at).toISOString() : null,
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
      proposedMeetingStart: e.proposedMeetingStart ?? null,
      schedulingNote: String(e.schedulingNote ?? ''),
      bookingUid: e.bookingUid ?? null,
      bookingStart: e.bookingStart ?? null,
      seenAt: e.seenAt ?? null,
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
    proposedMeetingStart: input.proposedMeetingStart ?? null,
    schedulingNote: input.schedulingNote ?? '',
    bookingUid: input.bookingUid ?? null,
    bookingStart: input.bookingStart ?? null,
    seenAt: null,
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
      `SELECT ${INBOX_SELECT}
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
      `SELECT ${INBOX_SELECT}
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
         summary, category, contact_uid, contact_name, job_slug, job_title, route_note,
         proposed_meeting_start, scheduling_note, booking_uid, booking_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING ${INBOX_SELECT}`,
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
        input.proposedMeetingStart ?? null,
        input.schedulingNote ?? '',
        input.bookingUid ?? null,
        input.bookingStart ?? null,
      ],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch (e) {
    console.error('[email-inbox] pg append failed', e);
    return null;
  }
}

export async function storeGetEmailInbox(id: string): Promise<EmailInboxRecord | null> {
  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return null;
      const { rows } = await pool.query(`SELECT ${INBOX_SELECT} FROM email_inbox WHERE id = $1`, [
        id,
      ]);
      return rows[0] ? rowToRecord(rows[0]) : null;
    } catch (e) {
      console.error('[email-inbox] pg get failed', e);
      return null;
    }
  }
  const path = inboxFilePath();
  if (!existsSync(path)) return null;
  return parseFileEvents(readFileSync(path, 'utf8')).find((e) => e.id === id) ?? null;
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

export type EmailInboxPatch = Partial<
  Pick<
    EmailInboxInput,
    | 'category'
    | 'action'
    | 'status'
    | 'bookingUid'
    | 'bookingStart'
    | 'proposedMeetingStart'
    | 'jobSlug'
    | 'jobTitle'
    | 'routeNote'
  >
> & {
  markSeen?: boolean;
};

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
    ...(patch.bookingUid !== undefined ? { bookingUid: patch.bookingUid } : {}),
    ...(patch.bookingStart !== undefined ? { bookingStart: patch.bookingStart } : {}),
    ...(patch.proposedMeetingStart !== undefined
      ? { proposedMeetingStart: patch.proposedMeetingStart }
      : {}),
    ...(patch.jobSlug !== undefined ? { jobSlug: patch.jobSlug } : {}),
    ...(patch.jobTitle !== undefined ? { jobTitle: patch.jobTitle } : {}),
    ...(patch.routeNote !== undefined ? { routeNote: patch.routeNote } : {}),
    ...(patch.markSeen && !cur.seenAt ? { seenAt: new Date().toISOString() } : {}),
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
    if (patch.bookingUid !== undefined) {
      sets.push(`booking_uid = $${i++}`);
      vals.push(patch.bookingUid);
    }
    if (patch.bookingStart !== undefined) {
      sets.push(`booking_start = $${i++}`);
      vals.push(patch.bookingStart);
    }
    if (patch.proposedMeetingStart !== undefined) {
      sets.push(`proposed_meeting_start = $${i++}`);
      vals.push(patch.proposedMeetingStart);
    }
    if (patch.jobSlug !== undefined) {
      sets.push(`job_slug = $${i++}`);
      vals.push(patch.jobSlug);
    }
    if (patch.jobTitle !== undefined) {
      sets.push(`job_title = $${i++}`);
      vals.push(patch.jobTitle);
    }
    if (patch.routeNote !== undefined) {
      sets.push(`route_note = $${i++}`);
      vals.push(patch.routeNote);
    }
    if (patch.markSeen) {
      sets.push(`seen_at = COALESCE(seen_at, now())`);
    }
    if (!sets.length) return null;
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE email_inbox SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING ${INBOX_SELECT}`,
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

async function deleteManyFromFile(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const path = inboxFilePath();
  if (!existsSync(path)) return 0;
  const drop = new Set(ids);
  const events = parseFileEvents(readFileSync(path, 'utf8'));
  const next = events.filter((e) => !drop.has(e.id));
  const deleted = events.length - next.length;
  if (deleted === 0) return 0;
  return writeFileEvents(next) ? deleted : 0;
}

async function deleteManyFromPg(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  try {
    const pool = await ensureSchema();
    if (!pool) return 0;
    const { rowCount } = await pool.query(`DELETE FROM email_inbox WHERE id = ANY($1::uuid[])`, [ids]);
    return rowCount ?? 0;
  } catch (e) {
    console.error('[email-inbox] pg bulk delete failed', e);
    return 0;
  }
}

export async function storeDeleteEmailInboxMany(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return 0;
  if (databaseUrl()) return deleteManyFromPg(unique);
  return deleteManyFromFile(unique);
}

async function markSeenManyInFile(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const path = inboxFilePath();
  if (!existsSync(path)) return 0;
  const drop = new Set(ids);
  const events = parseFileEvents(readFileSync(path, 'utf8'));
  const now = new Date().toISOString();
  let marked = 0;
  const next = events.map((e) => {
    if (!drop.has(e.id) || e.seenAt) return e;
    marked += 1;
    return { ...e, seenAt: now };
  });
  if (marked === 0) return 0;
  return writeFileEvents(next) ? marked : 0;
}

async function markSeenManyInPg(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  try {
    const pool = await ensureSchema();
    if (!pool) return 0;
    const { rowCount } = await pool.query(
      `UPDATE email_inbox SET seen_at = COALESCE(seen_at, now()) WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return rowCount ?? 0;
  } catch (e) {
    console.error('[email-inbox] pg mark seen failed', e);
    return 0;
  }
}

/** Mark inbox rows as seen (scroll-into-view). Idempotent per message. */
export async function storeMarkEmailInboxSeenMany(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return 0;
  if (databaseUrl()) return markSeenManyInPg(unique);
  return markSeenManyInFile(unique);
}
