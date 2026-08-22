/**
 * Persist unsent admin compose/reply messages for the Draft folder.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getPgPool } from './pgPool';

export type EmailDraftRecipient = {
  email: string;
  name: string;
  uid: string | null;
};

export type EmailDraftRecord = {
  id: string;
  to: EmailDraftRecipient[];
  cc: EmailDraftRecipient[];
  subject: string;
  body: string;
  inReplyToEmailId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type CreateEmailDraftInput = {
  to?: EmailDraftRecipient[];
  cc?: EmailDraftRecipient[];
  subject?: string;
  body?: string;
  inReplyToEmailId?: string | null;
  createdBy?: string | null;
};

export type UpdateEmailDraftInput = {
  to?: EmailDraftRecipient[];
  cc?: EmailDraftRecipient[];
  subject?: string;
  body?: string;
  inReplyToEmailId?: string | null;
};

const MAX_FILE_ROWS = 500;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS email_drafts (
  id                    UUID PRIMARY KEY,
  to_recipients         JSONB NOT NULL DEFAULT '[]',
  cc_recipients         JSONB NOT NULL DEFAULT '[]',
  subject               TEXT NOT NULL DEFAULT '',
  body                  TEXT NOT NULL DEFAULT '',
  in_reply_to_email_id  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            TEXT
);
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS cc_recipients JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS email_drafts_updated_idx
  ON email_drafts (updated_at DESC);
CREATE INDEX IF NOT EXISTS email_drafts_created_by_idx
  ON email_drafts (created_by, updated_at DESC) WHERE created_by IS NOT NULL;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'email-drafts.json');

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

function normalizeRecipient(raw: unknown): EmailDraftRecipient | null {
  if (typeof raw === 'string') {
    const email = raw.trim().toLowerCase();
    return email ? { email, name: '', uid: null } : null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const email = String(obj.email ?? '').trim().toLowerCase();
    if (!email) return null;
    return {
      email,
      name: String(obj.name ?? '').trim(),
      uid: obj.uid != null && String(obj.uid).trim() ? String(obj.uid).trim() : null,
    };
  }
  return null;
}

export function normalizeEmailDraftRecipients(raw: unknown): EmailDraftRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRecipient).filter((r): r is EmailDraftRecipient => Boolean(r));
}

function readFileRows(): EmailDraftRecord[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
    if (!Array.isArray(parsed?.rows)) return [];
    return (parsed.rows as EmailDraftRecord[]).map((row) => ({
      ...row,
      to: normalizeEmailDraftRecipients(row.to),
      cc: normalizeEmailDraftRecipients(row.cc),
    }));
  } catch {
    return [];
  }
}

function writeFileRows(rows: EmailDraftRecord[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify({ rows: rows.slice(0, MAX_FILE_ROWS) }, null, 2), 'utf8');
}

function rowToRecord(row: {
  id: string;
  to_recipients: unknown;
  cc_recipients?: unknown;
  subject: string;
  body: string;
  in_reply_to_email_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string | null;
}): EmailDraftRecord {
  return {
    id: row.id,
    to: normalizeEmailDraftRecipients(row.to_recipients),
    cc: normalizeEmailDraftRecipients(row.cc_recipients),
    subject: row.subject || '',
    body: row.body || '',
    inReplyToEmailId: row.in_reply_to_email_id?.trim() || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by?.trim() || null,
  };
}

export async function listEmailDrafts(limit = 200): Promise<EmailDraftRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 500);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        to_recipients: unknown;
        cc_recipients: unknown;
        subject: string;
        body: string;
        in_reply_to_email_id: string | null;
        created_at: Date;
        updated_at: Date;
        created_by: string | null;
      }>(
        `SELECT id, to_recipients, cc_recipients, subject, body, in_reply_to_email_id, created_at, updated_at, created_by
         FROM email_drafts
         ORDER BY updated_at DESC
         LIMIT $1`,
        [capped],
      );
      return rows.map(rowToRecord);
    }
  } catch (e) {
    console.warn('[email-drafts] pg list failed', e);
  }

  return readFileRows()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, capped);
}

export async function getEmailDraft(id: string): Promise<EmailDraftRecord | null> {
  const draftId = id.trim();
  if (!draftId) return null;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        to_recipients: unknown;
        cc_recipients: unknown;
        subject: string;
        body: string;
        in_reply_to_email_id: string | null;
        created_at: Date;
        updated_at: Date;
        created_by: string | null;
      }>(
        `SELECT id, to_recipients, cc_recipients, subject, body, in_reply_to_email_id, created_at, updated_at, created_by
         FROM email_drafts
         WHERE id = $1
         LIMIT 1`,
        [draftId],
      );
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
  } catch (e) {
    console.warn('[email-drafts] pg get failed', e);
  }

  return readFileRows().find((r) => r.id === draftId) ?? null;
}

export async function createEmailDraft(input: CreateEmailDraftInput): Promise<EmailDraftRecord> {
  const now = new Date().toISOString();
  const record: EmailDraftRecord = {
    id: randomUUID(),
    to: normalizeEmailDraftRecipients(input.to),
    cc: normalizeEmailDraftRecipients(input.cc),
    subject: input.subject?.trim() || '',
    body: input.body ?? '',
    inReplyToEmailId: input.inReplyToEmailId?.trim() || null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy?.trim() || null,
  };

  try {
    const pool = await ensureSchema();
    if (pool) {
      await pool.query(
        `INSERT INTO email_drafts
          (id, to_recipients, cc_recipients, subject, body, in_reply_to_email_id, created_by)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)`,
        [
          record.id,
          JSON.stringify(record.to),
          JSON.stringify(record.cc),
          record.subject,
          record.body,
          record.inReplyToEmailId,
          record.createdBy,
        ],
      );
      return record;
    }
  } catch (e) {
    console.warn('[email-drafts] pg insert failed', e);
  }

  const rows = [record, ...readFileRows()].slice(0, MAX_FILE_ROWS);
  writeFileRows(rows);
  return record;
}

export async function updateEmailDraft(
  id: string,
  input: UpdateEmailDraftInput,
): Promise<EmailDraftRecord | null> {
  const existing = await getEmailDraft(id);
  if (!existing) return null;

  const updated: EmailDraftRecord = {
    ...existing,
    to: input.to !== undefined ? normalizeEmailDraftRecipients(input.to) : existing.to,
    cc: input.cc !== undefined ? normalizeEmailDraftRecipients(input.cc) : existing.cc || [],
    subject: input.subject !== undefined ? input.subject.trim() : existing.subject,
    body: input.body !== undefined ? input.body : existing.body,
    inReplyToEmailId:
      input.inReplyToEmailId !== undefined
        ? input.inReplyToEmailId?.trim() || null
        : existing.inReplyToEmailId,
    updatedAt: new Date().toISOString(),
  };

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rowCount } = await pool.query(
        `UPDATE email_drafts
         SET to_recipients = $2::jsonb,
             cc_recipients = $3::jsonb,
             subject = $4,
             body = $5,
             in_reply_to_email_id = $6,
             updated_at = now()
         WHERE id = $1`,
        [
          id,
          JSON.stringify(updated.to),
          JSON.stringify(updated.cc),
          updated.subject,
          updated.body,
          updated.inReplyToEmailId,
        ],
      );
      if (rowCount) return updated;
    }
  } catch (e) {
    console.warn('[email-drafts] pg update failed', e);
  }

  const rows = readFileRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = updated;
  writeFileRows(rows);
  return updated;
}

export async function deleteEmailDraft(id: string): Promise<boolean> {
  const draftId = id.trim();
  if (!draftId) return false;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rowCount } = await pool.query(`DELETE FROM email_drafts WHERE id = $1`, [draftId]);
      if (rowCount) return true;
    }
  } catch (e) {
    console.warn('[email-drafts] pg delete failed', e);
  }

  const rows = readFileRows();
  const next = rows.filter((r) => r.id !== draftId);
  if (next.length === rows.length) return false;
  writeFileRows(next);
  return true;
}
