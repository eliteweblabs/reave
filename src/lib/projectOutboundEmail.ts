/**
 * Log outbound emails sent on behalf of a project — used to detect urgent client replies.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getPgPool } from './pgPool';
import { parseSenderEmail } from './emailAddress';
import { normalizeEmailBody, normalizeSentEmailHtml } from './emailBody';
import { serverEnv } from './serverEnv';

export type ProjectOutboundEmailRecord = {
  id: string;
  jobSlug: string;
  jobTitle: string;
  contactUid: string | null;
  toEmail: string;
  subject: string;
  resendId: string | null;
  sentAt: string;
  sentBy: string | null;
  source: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
};

export type RecordProjectOutboundInput = {
  jobSlug?: string | null;
  jobTitle?: string;
  contactUid?: string | null;
  toEmail: string;
  subject: string;
  resendId?: string | null;
  sentBy?: string | null;
  source?: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
};

export type OutboundEmailListRecord = ProjectOutboundEmailRecord;

const DEFAULT_REPLY_WINDOW_DAYS = 120;
const MAX_FILE_ROWS = 2000;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS project_outbound_emails (
  id            UUID PRIMARY KEY,
  job_slug      TEXT NOT NULL,
  job_title     TEXT NOT NULL DEFAULT '',
  contact_uid   TEXT,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  resend_id     TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by       TEXT,
  source        TEXT NOT NULL DEFAULT 'unknown',
  body_text     TEXT,
  body_html     TEXT
);
CREATE INDEX IF NOT EXISTS project_outbound_emails_to_idx
  ON project_outbound_emails (to_email, sent_at DESC);
CREATE INDEX IF NOT EXISTS project_outbound_emails_contact_idx
  ON project_outbound_emails (contact_uid, sent_at DESC) WHERE contact_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_outbound_emails_job_idx
  ON project_outbound_emails (job_slug, sent_at DESC);
ALTER TABLE project_outbound_emails ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE project_outbound_emails ADD COLUMN IF NOT EXISTS body_html TEXT;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'project-outbound-emails.json');

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

function normalizeToEmail(raw: string): string {
  return parseSenderEmail(raw);
}

function readFileRows(): ProjectOutboundEmailRecord[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
    return Array.isArray(parsed?.rows) ? (parsed.rows as ProjectOutboundEmailRecord[]) : [];
  } catch {
    return [];
  }
}

function writeFileRows(rows: ProjectOutboundEmailRecord[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify({ rows: rows.slice(0, MAX_FILE_ROWS) }, null, 2), 'utf8');
}

function clipOutboundBodies(input: {
  bodyText?: string | null;
  bodyHtml?: string | null;
}): { bodyText: string | null; bodyHtml: string | null } {
  const bodyText = normalizeEmailBody(input.bodyText || undefined, input.bodyHtml || undefined);
  const bodyHtml = normalizeSentEmailHtml(input.bodyText || undefined, input.bodyHtml || undefined);
  return {
    bodyText: bodyText || null,
    bodyHtml: bodyHtml || null,
  };
}

function rowToRecord(row: {
  id: string;
  job_slug: string;
  job_title: string;
  contact_uid: string | null;
  to_email: string;
  subject: string;
  resend_id: string | null;
  sent_at: Date | string;
  sent_by: string | null;
  source: string;
  body_text?: string | null;
  body_html?: string | null;
}): ProjectOutboundEmailRecord {
  return {
    id: row.id,
    jobSlug: row.job_slug,
    jobTitle: row.job_title,
    contactUid: row.contact_uid,
    toEmail: row.to_email,
    subject: row.subject,
    resendId: row.resend_id,
    sentAt: new Date(row.sent_at).toISOString(),
    sentBy: row.sent_by,
    source: row.source,
    bodyText: row.body_text ?? null,
    bodyHtml: row.body_html ?? null,
  };
}

/** Fire-and-forget — never throws to callers. */
export async function recordProjectOutboundEmail(input: RecordProjectOutboundInput): Promise<void> {
  const jobSlug = input.jobSlug?.trim() || '';
  const toEmail = normalizeToEmail(input.toEmail);
  if (!toEmail.includes('@')) return;

  const bodies = clipOutboundBodies(input);
  const record: ProjectOutboundEmailRecord = {
    id: randomUUID(),
    jobSlug,
    jobTitle: input.jobTitle?.trim() || jobSlug,
    contactUid: input.contactUid?.trim() || null,
    toEmail,
    subject: input.subject?.trim() || '',
    resendId: input.resendId?.trim() || null,
    sentAt: new Date().toISOString(),
    sentBy: input.sentBy?.trim() || null,
    source: input.source?.trim() || 'unknown',
    bodyText: bodies.bodyText,
    bodyHtml: bodies.bodyHtml,
  };

  try {
    const pool = await ensureSchema();
    if (pool) {
      await pool.query(
        `INSERT INTO project_outbound_emails
          (id, job_slug, job_title, contact_uid, to_email, subject, resend_id, sent_by, source, body_text, body_html)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          record.id,
          record.jobSlug,
          record.jobTitle,
          record.contactUid,
          record.toEmail,
          record.subject,
          record.resendId,
          record.sentBy,
          record.source,
          record.bodyText,
          record.bodyHtml,
        ],
      );
      return;
    }
  } catch (e) {
    console.warn('[project-outbound-email] pg insert failed', e);
  }

  try {
    const rows = [record, ...readFileRows()].slice(0, MAX_FILE_ROWS);
    writeFileRows(rows);
  } catch (e) {
    console.warn('[project-outbound-email] file insert failed', e);
  }
}

export type ProjectOutboundMatch = ProjectOutboundEmailRecord;

export async function findRecentProjectOutbound(opts: {
  senderEmail: string;
  contactUid?: string | null;
  withinDays?: number;
}): Promise<ProjectOutboundMatch | null> {
  const toEmail = normalizeToEmail(opts.senderEmail);
  const contactUid = opts.contactUid?.trim() || null;
  const withinDays = opts.withinDays ?? DEFAULT_REPLY_WINDOW_DAYS;
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        job_slug: string;
        job_title: string;
        contact_uid: string | null;
        to_email: string;
        subject: string;
        resend_id: string | null;
        sent_at: Date;
        sent_by: string | null;
        source: string;
      }>(
        `SELECT id, job_slug, job_title, contact_uid, to_email, subject, resend_id, sent_at, sent_by, source
         FROM project_outbound_emails
         WHERE sent_at >= $1
           AND (
             LOWER(to_email) = LOWER($2)
             OR ($3::text IS NOT NULL AND contact_uid = $3)
           )
         ORDER BY sent_at DESC
         LIMIT 1`,
        [since.toISOString(), toEmail, contactUid],
      );
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
  } catch (e) {
    console.warn('[project-outbound-email] pg lookup failed', e);
  }

  const rows = readFileRows().filter((r) => {
    const sent = new Date(r.sentAt).getTime();
    if (sent < since.getTime()) return false;
    if (r.toEmail.toLowerCase() === toEmail) return true;
    if (contactUid && r.contactUid === contactUid) return true;
    return false;
  });
  rows.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  return rows[0] ?? null;
}

export async function listOutboundEmails(limit = 200): Promise<OutboundEmailListRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 500);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        job_slug: string;
        job_title: string;
        contact_uid: string | null;
        to_email: string;
        subject: string;
        resend_id: string | null;
        sent_at: Date;
        sent_by: string | null;
        source: string;
      }>(
        `SELECT id, job_slug, job_title, contact_uid, to_email, subject, resend_id, sent_at, sent_by, source
         FROM project_outbound_emails
         ORDER BY sent_at DESC
         LIMIT $1`,
        [capped],
      );
      return rows.map(rowToRecord);
    }
  } catch (e) {
    console.warn('[project-outbound-email] pg list failed', e);
  }

  return readFileRows()
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, capped);
}

export async function getOutboundEmail(id: string): Promise<ProjectOutboundEmailRecord | null> {
  const key = id.trim();
  if (!key) return null;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        job_slug: string;
        job_title: string;
        contact_uid: string | null;
        to_email: string;
        subject: string;
        resend_id: string | null;
        sent_at: Date;
        sent_by: string | null;
        source: string;
        body_text: string | null;
        body_html: string | null;
      }>(
        `SELECT id, job_slug, job_title, contact_uid, to_email, subject, resend_id, sent_at, sent_by, source, body_text, body_html
         FROM project_outbound_emails
         WHERE id = $1
         LIMIT 1`,
        [key],
      );
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
  } catch (e) {
    console.warn('[project-outbound-email] pg get failed', e);
  }

  return readFileRows().find((r) => r.id === key) ?? null;
}

export async function updateOutboundEmailBodies(
  id: string,
  input: { bodyText?: string | null; bodyHtml?: string | null },
): Promise<void> {
  const key = id.trim();
  if (!key) return;
  const bodies = clipOutboundBodies(input);

  try {
    const pool = await ensureSchema();
    if (pool) {
      await pool.query(
        `UPDATE project_outbound_emails
         SET body_text = $2, body_html = $3
         WHERE id = $1`,
        [key, bodies.bodyText, bodies.bodyHtml],
      );
      return;
    }
  } catch (e) {
    console.warn('[project-outbound-email] pg body update failed', e);
  }

  try {
    const rows = readFileRows();
    const idx = rows.findIndex((r) => r.id === key);
    if (idx === -1) return;
    rows[idx] = { ...rows[idx]!, bodyText: bodies.bodyText, bodyHtml: bodies.bodyHtml };
    writeFileRows(rows);
  } catch (e) {
    console.warn('[project-outbound-email] file body update failed', e);
  }
}
