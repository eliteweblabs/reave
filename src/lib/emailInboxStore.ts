/**
 * Persisted log of inbound email triage results for the dashboard Email tab.
 * Postgres (DATABASE_URL) when set, otherwise JSON file under src/knowledge/.
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';
import type { EmailCategory } from './emailProcessor';
import { normalizeMessageId } from './emailReply';
import {
  normalizeEmailAttachments,
  type EmailAttachmentMeta,
} from './emailAttachments';

export type { EmailAttachmentMeta };

export interface EmailInboxRecord {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  bodySnippet: string;
  /** Full normalized plain-text body (up to 100k chars). */
  bodyText: string;
  /** Original HTML body for inbox rendering (scripts stripped, up to 500k chars). */
  bodyHtml: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  headers: Record<string, string>;
  messageId: string;
  resendEmailId: string;
  /** Attachment metadata from Resend (content fetched on demand). */
  attachments: EmailAttachmentMeta[];
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
  /** Set when the owner dismisses an automated-decision notification on the dashboard. */
  automationAckAt: string | null;
  /** Owner feedback on how future similar agent decisions should be handled. */
  automationTriageAt: string | null;
  automationTriageAction: string | null;
  automationTriageRuleId: string | null;
  /** What was automated: meeting_booked, project_created, etc. */
  automationKind: string | null;
  /** Parsed one-time verification code for copy-to-clipboard UX. */
  verificationCode: string | null;
  /** When set, row is auto-deleted (and linked notifications dismissed) after this time. */
  deleteAfterAt: string | null;
}

export interface EmailInboxInput {
  from: string;
  subject: string;
  bodySnippet: string;
  bodyText?: string;
  bodyHtml?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  headers?: Record<string, string>;
  messageId?: string;
  resendEmailId?: string;
  attachments?: EmailAttachmentMeta[];
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
  automationKind?: string | null;
  verificationCode?: string | null;
  deleteAfterAt?: string | null;
}

/** List API shape — omits full body/headers to keep payloads small. */
export type EmailInboxListRecord = Omit<
  EmailInboxRecord,
  'bodyText' | 'bodyHtml' | 'headers' | 'to' | 'cc' | 'bcc' | 'replyTo' | 'messageId' | 'resendEmailId'
>;

export function toEmailInboxListRecord(record: EmailInboxRecord): EmailInboxListRecord {
  const {
    bodyText: _bodyText,
    bodyHtml: _bodyHtml,
    headers: _headers,
    to: _to,
    cc: _cc,
    bcc: _bcc,
    replyTo: _replyTo,
    messageId: _messageId,
    resendEmailId: _resendEmailId,
    ...list
  } = record;
  return list;
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
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_ack_at TIMESTAMPTZ`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_triage_at TIMESTAMPTZ`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_triage_action TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_triage_rule_id TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_kind TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS body_text TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS to_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS cc_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS bcc_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS reply_to_addrs JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS headers_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS message_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS resend_email_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS verification_code TEXT`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS delete_after_at TIMESTAMPTZ`,
];

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS email_inbox_received_idx ON email_inbox (received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS email_inbox_category_idx ON email_inbox (category)`,
  `CREATE INDEX IF NOT EXISTS email_inbox_job_slug_idx ON email_inbox (job_slug) WHERE job_slug IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS email_inbox_message_id_idx ON email_inbox (message_id) WHERE message_id <> ''`,
  `CREATE INDEX IF NOT EXISTS email_inbox_delete_after_idx ON email_inbox (delete_after_at) WHERE delete_after_at IS NOT NULL`,
];

const INBOX_LIST_SELECT = `id, received_at, from_address, subject, body_snippet, status, action, notified,
              summary, category, contact_uid, contact_name, job_slug, job_title, route_note,
              proposed_meeting_start, scheduling_note, booking_uid, booking_start, seen_at,
              automation_ack_at, automation_triage_at, automation_triage_action, automation_triage_rule_id,
              automation_kind, verification_code, attachments_json`;

const INBOX_SELECT = `${INBOX_LIST_SELECT}, body_text, body_html, to_addrs, cc_addrs, bcc_addrs, reply_to_addrs,
              headers_json, message_id, resend_email_id`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
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
  body_text?: string;
  body_html?: string;
  to_addrs?: string[] | null;
  cc_addrs?: string[] | null;
  bcc_addrs?: string[] | null;
  reply_to_addrs?: string[] | null;
  headers_json?: Record<string, string> | null;
  message_id?: string;
  resend_email_id?: string;
  attachments_json?: unknown;
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
  automation_ack_at?: Date | string | null;
  automation_triage_at?: Date | string | null;
  automation_triage_action?: string | null;
  automation_triage_rule_id?: string | null;
  automation_kind?: string | null;
  verification_code?: string | null;
  delete_after_at?: Date | string | null;
};

function normalizeCategory(raw: string | undefined): EmailCategory {
  const c = String(raw ?? 'review').toLowerCase();
  if (
    c === 'junk' ||
    c === 'client' ||
    c === 'alert' ||
    c === 'internal' ||
    c === 'review' ||
    c === 'receipt' ||
    c === 'project'
  ) {
    return c;
  }
  return 'review';
}

function parseJsonStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

function parseHeadersJson(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );
}

function rowToRecord(row: InboxRow): EmailInboxRecord {
  return {
    id: row.id,
    receivedAt: new Date(row.received_at).toISOString(),
    from: row.from_address,
    subject: row.subject,
    bodySnippet: row.body_snippet,
    bodyText: row.body_text ?? row.body_snippet ?? '',
    bodyHtml: row.body_html ?? '',
    to: parseJsonStringArray(row.to_addrs),
    cc: parseJsonStringArray(row.cc_addrs),
    bcc: parseJsonStringArray(row.bcc_addrs),
    replyTo: parseJsonStringArray(row.reply_to_addrs),
    headers: parseHeadersJson(row.headers_json),
    messageId: row.message_id ?? '',
    resendEmailId: row.resend_email_id ?? '',
    attachments: normalizeEmailAttachments(row.attachments_json),
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
    automationAckAt: row.automation_ack_at
      ? new Date(row.automation_ack_at).toISOString()
      : null,
    automationTriageAt: row.automation_triage_at
      ? new Date(row.automation_triage_at).toISOString()
      : null,
    automationTriageAction: row.automation_triage_action ?? null,
    automationTriageRuleId: row.automation_triage_rule_id ?? null,
    automationKind: row.automation_kind ?? null,
    verificationCode: row.verification_code ?? null,
    deleteAfterAt: row.delete_after_at ? new Date(row.delete_after_at).toISOString() : null,
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
      bodyText: String(e.bodyText ?? e.bodySnippet ?? ''),
      bodyHtml: String(e.bodyHtml ?? ''),
      to: Array.isArray(e.to) ? e.to.map(String) : [],
      cc: Array.isArray(e.cc) ? e.cc.map(String) : [],
      bcc: Array.isArray(e.bcc) ? e.bcc.map(String) : [],
      replyTo: Array.isArray(e.replyTo) ? e.replyTo.map(String) : [],
      headers: e.headers && typeof e.headers === 'object' ? parseHeadersJson(e.headers) : {},
      messageId: String(e.messageId ?? ''),
      resendEmailId: String(e.resendEmailId ?? ''),
      attachments: normalizeEmailAttachments(e.attachments),
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
      automationAckAt: e.automationAckAt ?? null,
      automationTriageAt: e.automationTriageAt ?? null,
      automationTriageAction: e.automationTriageAction ?? null,
      automationTriageRuleId: e.automationTriageRuleId ?? null,
      automationKind: e.automationKind ?? null,
      verificationCode: e.verificationCode ?? null,
      deleteAfterAt: e.deleteAfterAt ?? null,
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

/** Matches admin inbox "Projects" tab — category project or legacy job match. */
export function isEmailInboxProject(
  record: Pick<EmailInboxRecord, 'category' | 'jobSlug' | 'action'>,
): boolean {
  const category = String(record.category || '').toLowerCase();
  if (category === 'project') return true;
  return Boolean(record.jobSlug) && String(record.action || '').toLowerCase() === 'matched';
}

/** Matches admin inbox "Archive" tab — filed/routed mail not shown under Projects. */
export function isEmailInboxRouted(
  record: Pick<EmailInboxRecord, 'category' | 'jobSlug' | 'action'>,
): boolean {
  if (isEmailInboxProject(record)) return false;
  const action = String(record.action || '').toLowerCase();
  return action === 'filed' || action === 'matched';
}

/** Matches admin inbox default "All" tab — active mail still in the working queue. */
export function isEmailInboxActive(
  record: Pick<EmailInboxRecord, 'category' | 'jobSlug' | 'action'>,
): boolean {
  const category = String(record.category || '').toLowerCase();
  return (
    category !== 'junk' &&
    category !== 'receipt' &&
    !isEmailInboxProject(record) &&
    !isEmailInboxRouted(record)
  );
}

export function computeInboxDigest(events: EmailInboxRecord[], hideJunk: boolean): EmailInboxDigest {
  let total = 0;
  let visible = 0;
  let junkHidden = 0;
  let client = 0;
  let filed = 0;
  let review = 0;
  let alert = 0;
  for (const e of events) {
    total++;
    if (e.category === 'junk') {
      junkHidden++;
      if (hideJunk) continue;
    }
    visible++;
    if (e.category === 'client') client++;
    else if (e.category === 'review') review++;
    else if (e.category === 'alert') alert++;
    if (e.action === 'filed') filed++;
  }
  return { total, visible, junkHidden, client, filed, review, alert };
}

async function digestFromPg(hideJunk: boolean): Promise<EmailInboxDigest | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{
      total: string;
      visible: string;
      junk_hidden: string;
      client: string;
      filed: string;
      review: string;
      alert: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE category <> 'junk')::text AS visible,
         COUNT(*) FILTER (WHERE category = 'junk')::text AS junk_hidden,
         COUNT(*) FILTER (WHERE category = 'client')::text AS client,
         COUNT(*) FILTER (WHERE action = 'filed')::text AS filed,
         COUNT(*) FILTER (WHERE category = 'review')::text AS review,
         COUNT(*) FILTER (WHERE category = 'alert')::text AS alert
       FROM email_inbox`,
    );
    const row = rows[0];
    if (!row) return null;
    const digest: EmailInboxDigest = {
      total: Number(row.total),
      visible: Number(row.visible),
      junkHidden: Number(row.junk_hidden),
      client: Number(row.client),
      filed: Number(row.filed),
      review: Number(row.review),
      alert: Number(row.alert),
    };
    if (!hideJunk) digest.visible = digest.total;
    return digest;
  } catch (e) {
    console.error('[email-inbox] pg digest failed', e);
    return null;
  }
}

/** SQL-backed inbox counts — avoids loading thousands of rows for dashboard totals. */
export async function storeEmailInboxDigest(hideJunk = true): Promise<EmailInboxDigest> {
  const fromPg = await digestFromPg(hideJunk);
  if (fromPg) return fromPg;
  const events = await listFromFile(10_000, false);
  return computeInboxDigest(events, hideJunk);
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
    bodyText: input.bodyText ?? input.bodySnippet,
    bodyHtml: input.bodyHtml ?? '',
    to: input.to ?? [],
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    replyTo: input.replyTo ?? [],
    headers: input.headers ?? {},
    messageId: input.messageId ?? '',
    resendEmailId: input.resendEmailId ?? '',
    attachments: normalizeEmailAttachments(input.attachments),
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
    automationAckAt: null,
    automationTriageAt: null,
    automationTriageAction: null,
    automationTriageRuleId: null,
    automationKind: input.automationKind ?? null,
    verificationCode: input.verificationCode ?? null,
    deleteAfterAt: input.deleteAfterAt ?? null,
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
      `SELECT ${INBOX_LIST_SELECT}
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
      `SELECT ${INBOX_LIST_SELECT}
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
        (id, from_address, subject, body_snippet, body_text, body_html, to_addrs, cc_addrs, bcc_addrs,
         reply_to_addrs, headers_json, message_id, resend_email_id, attachments_json,
         status, action, notified, summary, category, contact_uid, contact_name, job_slug, job_title,
         route_note, proposed_meeting_start, scheduling_note, booking_uid, booking_start, automation_kind,
         verification_code, delete_after_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14::jsonb,
               $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
       RETURNING ${INBOX_SELECT}`,
      [
        id,
        input.from,
        input.subject,
        input.bodySnippet,
        input.bodyText ?? input.bodySnippet,
        input.bodyHtml ?? '',
        JSON.stringify(input.to ?? []),
        JSON.stringify(input.cc ?? []),
        JSON.stringify(input.bcc ?? []),
        JSON.stringify(input.replyTo ?? []),
        JSON.stringify(input.headers ?? {}),
        input.messageId ?? '',
        input.resendEmailId ?? '',
        JSON.stringify(normalizeEmailAttachments(input.attachments)),
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
        input.automationKind ?? null,
        input.verificationCode ?? null,
        input.deleteAfterAt ?? null,
      ],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch (e) {
    console.error('[email-inbox] pg append failed', e);
    return null;
  }
}

/** Most recent inbox row whose stored Message-ID matches any of the given ids. */
export async function storeFindInboxByMessageIds(messageIds: string[]): Promise<EmailInboxRecord | null> {
  const normalized = [...new Set(messageIds.map(normalizeMessageId).filter(Boolean))];
  if (!normalized.length) return null;

  if (databaseUrl()) {
    try {
      const pool = await ensureSchema();
      if (!pool) return null;
      const { rows } = await pool.query(
        `SELECT ${INBOX_SELECT} FROM email_inbox
         WHERE message_id = ANY($1::text[])
         ORDER BY received_at DESC LIMIT 1`,
        [normalized],
      );
      return rows[0] ? rowToRecord(rows[0]) : null;
    } catch (e) {
      console.error('[email-inbox] pg find by message_id failed', e);
      return null;
    }
  }

  const path = inboxFilePath();
  if (!existsSync(path)) return null;
  const idSet = new Set(normalized);
  const hit = parseFileEvents(readFileSync(path, 'utf8'))
    .filter((e) => idSet.has(normalizeMessageId(e.messageId)))
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
  return hit ?? null;
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

const RECEIPT_SCAN_SELECT = `${INBOX_LIST_SELECT}, body_text`;

async function listReceiptScanFromPg(limit: number, since?: Date): Promise<EmailInboxRecord[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const sinceFilter = since ? 'AND received_at >= $2' : '';
    const params: unknown[] = since ? [limit, since.toISOString()] : [limit];
    const { rows } = await pool.query(
      `SELECT ${RECEIPT_SCAN_SELECT}
       FROM email_inbox
       WHERE category NOT IN ('receipt', 'junk') ${sinceFilter}
       ORDER BY received_at DESC
       LIMIT $1`,
      params,
    );
    return rows.map(rowToRecord);
  } catch (e) {
    console.error('[email-inbox] receipt scan list failed', e);
    return [];
  }
}

function listReceiptScanFromFile(limit: number, since?: Date): EmailInboxRecord[] {
  const path = inboxFilePath();
  if (!existsSync(path)) return [];
  const sinceMs = since ? since.getTime() : null;
  return parseFileEvents(readFileSync(path, 'utf8'))
    .filter((e) => {
      if (e.category === 'receipt' || e.category === 'junk') return false;
      if (sinceMs != null && new Date(e.receivedAt).getTime() < sinceMs) return false;
      return true;
    })
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, limit);
}

/** Inbox rows (with body text) that are not already filed as receipts — for recovery scan. */
export async function storeListEmailInboxReceiptScan(
  limit = 500,
  since?: Date,
): Promise<EmailInboxRecord[]> {
  if (databaseUrl()) return listReceiptScanFromPg(limit, since);
  return listReceiptScanFromFile(limit, since);
}

async function listSleepDeferredFromPg(limit: number): Promise<EmailInboxRecord[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const { rows } = await pool.query(
      `SELECT ${INBOX_LIST_SELECT}
       FROM email_inbox
       WHERE status = 'SLEEP_DEFERRED'
       ORDER BY received_at ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map(rowToRecord);
  } catch (e) {
    console.error('[email-inbox] sleep deferred list failed', e);
    return [];
  }
}

function listSleepDeferredFromFile(limit: number): EmailInboxRecord[] {
  const path = inboxFilePath();
  if (!existsSync(path)) return [];
  return parseFileEvents(readFileSync(path, 'utf8'))
    .filter((e) => e.status === 'SLEEP_DEFERRED')
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())
    .slice(0, limit);
}

/** Inbound rows held during sleep mode — oldest first for morning catch-up. */
export async function storeListSleepDeferredEmails(limit = 15): Promise<EmailInboxRecord[]> {
  if (databaseUrl()) return listSleepDeferredFromPg(limit);
  return listSleepDeferredFromFile(limit);
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
    | 'contactUid'
    | 'contactName'
    | 'automationKind'
    | 'notified'
    | 'verificationCode'
    | 'attachments'
    | 'summary'
  >
> & {
  markSeen?: boolean;
  markAutomationAck?: boolean;
  rejectProjectMatch?: boolean;
  acceptAutomationDecision?: boolean;
  automationTriageAction?: string;
  automationTriageRuleId?: string | null;
  markAutomationTriage?: boolean;
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
    ...(patch.contactUid !== undefined ? { contactUid: patch.contactUid } : {}),
    ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
    ...(patch.automationKind !== undefined ? { automationKind: patch.automationKind } : {}),
    ...(patch.notified !== undefined ? { notified: patch.notified } : {}),
    ...(patch.verificationCode !== undefined ? { verificationCode: patch.verificationCode } : {}),
    ...(patch.attachments !== undefined
      ? { attachments: normalizeEmailAttachments(patch.attachments) }
      : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.markSeen && !cur.seenAt ? { seenAt: new Date().toISOString() } : {}),
    ...(patch.markAutomationAck && !cur.automationAckAt
      ? { automationAckAt: new Date().toISOString() }
      : {}),
    ...(patch.markAutomationTriage && !cur.automationTriageAt
      ? { automationTriageAt: new Date().toISOString() }
      : {}),
    ...(patch.automationTriageAction != null
      ? { automationTriageAction: patch.automationTriageAction }
      : {}),
    ...(patch.automationTriageRuleId !== undefined
      ? { automationTriageRuleId: patch.automationTriageRuleId }
      : {}),
    ...(patch.acceptAutomationDecision && !cur.automationTriageAt
      ? {
          automationTriageAt: new Date().toISOString(),
          automationTriageAction: 'accepted',
        }
      : {}),
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
    if (patch.contactUid !== undefined) {
      sets.push(`contact_uid = $${i++}`);
      vals.push(patch.contactUid);
    }
    if (patch.contactName !== undefined) {
      sets.push(`contact_name = $${i++}`);
      vals.push(patch.contactName);
    }
    if (patch.automationKind !== undefined) {
      sets.push(`automation_kind = $${i++}`);
      vals.push(patch.automationKind);
    }
    if (patch.notified !== undefined) {
      sets.push(`notified = $${i++}`);
      vals.push(patch.notified);
    }
    if (patch.verificationCode !== undefined) {
      sets.push(`verification_code = $${i++}`);
      vals.push(patch.verificationCode);
    }
    if (patch.attachments !== undefined) {
      sets.push(`attachments_json = $${i++}::jsonb`);
      vals.push(JSON.stringify(normalizeEmailAttachments(patch.attachments)));
    }
    if (patch.summary !== undefined) {
      sets.push(`summary = $${i++}`);
      vals.push(patch.summary);
    }
    if (patch.markSeen) {
      sets.push(`seen_at = COALESCE(seen_at, now())`);
    }
    if (patch.markAutomationAck) {
      sets.push(`automation_ack_at = COALESCE(automation_ack_at, now())`);
    }
    if (patch.markAutomationTriage) {
      sets.push(`automation_triage_at = COALESCE(automation_triage_at, now())`);
    }
    if (patch.automationTriageAction != null) {
      sets.push(`automation_triage_action = $${i++}`);
      vals.push(patch.automationTriageAction);
    }
    if (patch.automationTriageRuleId !== undefined) {
      sets.push(`automation_triage_rule_id = $${i++}`);
      vals.push(patch.automationTriageRuleId);
    }
    if (patch.acceptAutomationDecision) {
      sets.push(`automation_triage_at = COALESCE(automation_triage_at, now())`);
      sets.push(`automation_triage_action = COALESCE(automation_triage_action, 'accepted')`);
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

async function listExpiredFromPg(limit: number): Promise<EmailInboxRecord[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const { rows } = await pool.query(
      `SELECT ${INBOX_SELECT}
       FROM email_inbox
       WHERE delete_after_at IS NOT NULL AND delete_after_at <= now()
       ORDER BY delete_after_at ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map(rowToRecord);
  } catch (e) {
    console.error('[email-inbox] pg list expired failed', e);
    return [];
  }
}

function listExpiredFromFile(limit: number): EmailInboxRecord[] {
  const path = inboxFilePath();
  if (!existsSync(path)) return [];
  const now = Date.now();
  return parseFileEvents(readFileSync(path, 'utf8'))
    .filter((e) => e.deleteAfterAt && new Date(e.deleteAfterAt).getTime() <= now)
    .sort(
      (a, b) =>
        new Date(a.deleteAfterAt!).getTime() - new Date(b.deleteAfterAt!).getTime(),
    )
    .slice(0, limit);
}

/** Inbox rows whose delete_after_at has passed — for scheduled cleanup. */
export async function storeListExpiredEmailInbox(limit = 50): Promise<EmailInboxRecord[]> {
  const capped = Math.max(1, Math.min(limit, 200));
  if (databaseUrl()) return listExpiredFromPg(capped);
  return listExpiredFromFile(capped);
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
