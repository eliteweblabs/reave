/**
 * Persist admin compose messages queued for a later send.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import {
  normalizeEmailComposeImages,
  type EmailComposeImage,
} from './emailComposeImages';
import {
  createEmailDraft,
  normalizeEmailDraftRecipients,
  type EmailDraftRecipient,
  type EmailDraftRecord,
} from './emailDraftStore';
import { getPgPool } from './pgPool';

export type ScheduledEmailStatus = 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed';

export type ScheduledEmailRecord = {
  id: string;
  to: EmailDraftRecipient[];
  cc: EmailDraftRecipient[];
  from: string;
  subject: string;
  body: string;
  images: EmailComposeImage[];
  inReplyToEmailId: string | null;
  useBrandedTemplate: boolean;
  scheduledAt: string;
  status: ScheduledEmailStatus;
  resendId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type CreateScheduledEmailInput = {
  to?: EmailDraftRecipient[];
  cc?: EmailDraftRecipient[];
  from?: string;
  subject?: string;
  body?: string;
  images?: EmailComposeImage[];
  inReplyToEmailId?: string | null;
  useBrandedTemplate?: boolean;
  scheduledAt: string;
  createdBy?: string | null;
};

export type UpdateScheduledEmailInput = {
  to?: EmailDraftRecipient[];
  cc?: EmailDraftRecipient[];
  from?: string;
  subject?: string;
  body?: string;
  images?: EmailComposeImage[];
  inReplyToEmailId?: string | null;
  useBrandedTemplate?: boolean;
  scheduledAt?: string;
};

const MAX_FILE_ROWS = 500;
const STATUSES: ScheduledEmailStatus[] = ['pending', 'sending', 'sent', 'cancelled', 'failed'];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS email_scheduled (
  id                    UUID PRIMARY KEY,
  to_recipients         JSONB NOT NULL DEFAULT '[]',
  cc_recipients         JSONB NOT NULL DEFAULT '[]',
  subject               TEXT NOT NULL DEFAULT '',
  body                  TEXT NOT NULL DEFAULT '',
  images                JSONB NOT NULL DEFAULT '[]',
  in_reply_to_email_id  TEXT,
  scheduled_at          TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  resend_id             TEXT,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            TEXT
);
ALTER TABLE email_scheduled ADD COLUMN IF NOT EXISTS from_address TEXT NOT NULL DEFAULT '';
ALTER TABLE email_scheduled ADD COLUMN IF NOT EXISTS use_branded_template BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS email_scheduled_due_idx
  ON email_scheduled (scheduled_at ASC)
  WHERE status IN ('pending', 'sending', 'failed');
CREATE INDEX IF NOT EXISTS email_scheduled_created_by_idx
  ON email_scheduled (created_by, scheduled_at ASC) WHERE created_by IS NOT NULL;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'email-scheduled.json');

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

function normalizeStatus(raw: unknown): ScheduledEmailStatus {
  const value = String(raw || '').trim().toLowerCase();
  return STATUSES.includes(value as ScheduledEmailStatus) ? (value as ScheduledEmailStatus) : 'pending';
}

function readFileRows(): ScheduledEmailRecord[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
    if (!Array.isArray(parsed?.rows)) return [];
    return (parsed.rows as ScheduledEmailRecord[]).map((row) => ({
      ...row,
      to: normalizeEmailDraftRecipients(row.to),
      cc: normalizeEmailDraftRecipients(row.cc),
      from: String(row.from ?? '').trim(),
      images: normalizeEmailComposeImages(row.images),
      status: normalizeStatus(row.status),
      useBrandedTemplate: row.useBrandedTemplate !== false,
    }));
  } catch {
    return [];
  }
}

function writeFileRows(rows: ScheduledEmailRecord[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify({ rows: rows.slice(0, MAX_FILE_ROWS) }, null, 2), 'utf8');
}

function rowToRecord(row: {
  id: string;
  to_recipients: unknown;
  cc_recipients?: unknown;
  from_address?: string | null;
  subject: string;
  body: string;
  images?: unknown;
  in_reply_to_email_id: string | null;
  use_branded_template?: boolean | null;
  scheduled_at: Date | string;
  status: string;
  resend_id?: string | null;
  error?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string | null;
}): ScheduledEmailRecord {
  return {
    id: row.id,
    to: normalizeEmailDraftRecipients(row.to_recipients),
    cc: normalizeEmailDraftRecipients(row.cc_recipients),
    from: row.from_address?.trim() || '',
    subject: row.subject || '',
    body: row.body || '',
    images: normalizeEmailComposeImages(row.images),
    inReplyToEmailId: row.in_reply_to_email_id?.trim() || null,
    useBrandedTemplate: row.use_branded_template !== false,
    scheduledAt: new Date(row.scheduled_at).toISOString(),
    status: normalizeStatus(row.status),
    resendId: row.resend_id?.trim() || null,
    error: row.error?.trim() || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by?.trim() || null,
  };
}

const OPEN_STATUSES: ScheduledEmailStatus[] = ['pending', 'sending', 'failed'];

function isOpenRecord(row: ScheduledEmailRecord): boolean {
  return OPEN_STATUSES.includes(row.status);
}

export async function listScheduledEmails(limit = 200): Promise<ScheduledEmailRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 500);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query(
        `SELECT id, to_recipients, cc_recipients, from_address, subject, body, images, in_reply_to_email_id,
                use_branded_template, scheduled_at, status, resend_id, error, created_at, updated_at, created_by
         FROM email_scheduled
         WHERE status IN ('pending', 'sending', 'failed')
         ORDER BY scheduled_at ASC
         LIMIT $1`,
        [capped],
      );
      return rows.map(rowToRecord);
    }
  } catch (e) {
    console.warn('[email-scheduled] pg list failed', e);
  }

  return readFileRows()
    .filter(isOpenRecord)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, capped);
}

export async function getScheduledEmail(id: string): Promise<ScheduledEmailRecord | null> {
  const scheduledId = id.trim();
  if (!scheduledId) return null;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query(
        `SELECT id, to_recipients, cc_recipients, from_address, subject, body, images, in_reply_to_email_id,
                use_branded_template, scheduled_at, status, resend_id, error, created_at, updated_at, created_by
         FROM email_scheduled
         WHERE id = $1
         LIMIT 1`,
        [scheduledId],
      );
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
  } catch (e) {
    console.warn('[email-scheduled] pg get failed', e);
  }

  return readFileRows().find((r) => r.id === scheduledId) ?? null;
}

export async function createScheduledEmail(
  input: CreateScheduledEmailInput,
): Promise<ScheduledEmailRecord> {
  const now = new Date().toISOString();
  const record: ScheduledEmailRecord = {
    id: randomUUID(),
    to: normalizeEmailDraftRecipients(input.to),
    cc: normalizeEmailDraftRecipients(input.cc),
    from: input.from?.trim() || '',
    subject: input.subject?.trim() || '',
    body: input.body ?? '',
    images: normalizeEmailComposeImages(input.images),
    inReplyToEmailId: input.inReplyToEmailId?.trim() || null,
    useBrandedTemplate: input.useBrandedTemplate !== false,
    scheduledAt: new Date(input.scheduledAt).toISOString(),
    status: 'pending',
    resendId: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy?.trim() || null,
  };

  try {
    const pool = await ensureSchema();
    if (pool) {
      await pool.query(
        `INSERT INTO email_scheduled
          (id, to_recipients, cc_recipients, from_address, subject, body, images, in_reply_to_email_id,
           use_branded_template, scheduled_at, status, created_by)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7::jsonb, $8, $9, $10, 'pending', $11)`,
        [
          record.id,
          JSON.stringify(record.to),
          JSON.stringify(record.cc),
          record.from,
          record.subject,
          record.body,
          JSON.stringify(record.images),
          record.inReplyToEmailId,
          record.useBrandedTemplate,
          record.scheduledAt,
          record.createdBy,
        ],
      );
      return record;
    }
  } catch (e) {
    console.warn('[email-scheduled] pg insert failed', e);
  }

  const rows = [record, ...readFileRows()].slice(0, MAX_FILE_ROWS);
  writeFileRows(rows);
  return record;
}

export async function updateScheduledEmail(
  id: string,
  input: UpdateScheduledEmailInput,
): Promise<ScheduledEmailRecord | null> {
  const existing = await getScheduledEmail(id);
  if (!existing || !isOpenRecord(existing)) return null;

  const updated: ScheduledEmailRecord = {
    ...existing,
    to: input.to !== undefined ? normalizeEmailDraftRecipients(input.to) : existing.to,
    cc: input.cc !== undefined ? normalizeEmailDraftRecipients(input.cc) : existing.cc || [],
    from: input.from !== undefined ? input.from.trim() : existing.from || '',
    subject: input.subject !== undefined ? input.subject.trim() : existing.subject,
    body: input.body !== undefined ? input.body : existing.body,
    images: input.images !== undefined ? normalizeEmailComposeImages(input.images) : existing.images || [],
    inReplyToEmailId:
      input.inReplyToEmailId !== undefined
        ? input.inReplyToEmailId?.trim() || null
        : existing.inReplyToEmailId,
    useBrandedTemplate:
      input.useBrandedTemplate !== undefined
        ? input.useBrandedTemplate !== false
        : existing.useBrandedTemplate !== false,
    scheduledAt: input.scheduledAt !== undefined ? new Date(input.scheduledAt).toISOString() : existing.scheduledAt,
    status: 'pending',
    error: null,
    updatedAt: new Date().toISOString(),
  };

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rowCount } = await pool.query(
        `UPDATE email_scheduled
         SET to_recipients = $2::jsonb,
             cc_recipients = $3::jsonb,
             from_address = $4,
             subject = $5,
             body = $6,
             images = $7::jsonb,
             in_reply_to_email_id = $8,
             use_branded_template = $9,
             scheduled_at = $10,
             status = 'pending',
             error = NULL,
             updated_at = now()
         WHERE id = $1 AND status IN ('pending', 'sending', 'failed')`,
        [
          id,
          JSON.stringify(updated.to),
          JSON.stringify(updated.cc),
          updated.from,
          updated.subject,
          updated.body,
          JSON.stringify(updated.images),
          updated.inReplyToEmailId,
          updated.useBrandedTemplate,
          updated.scheduledAt,
        ],
      );
      if (rowCount) return updated;
    }
  } catch (e) {
    console.warn('[email-scheduled] pg update failed', e);
  }

  const rows = readFileRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = updated;
  writeFileRows(rows);
  return updated;
}

export async function claimDueScheduledEmails(limit = 20): Promise<ScheduledEmailRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 50);
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query(
        `UPDATE email_scheduled
         SET status = 'sending', updated_at = now()
         WHERE id IN (
           SELECT id FROM email_scheduled
           WHERE (status = 'pending' AND scheduled_at <= now())
              OR (status = 'sending' AND updated_at <= $2::timestamptz)
           ORDER BY scheduled_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, to_recipients, cc_recipients, from_address, subject, body, images, in_reply_to_email_id,
                   use_branded_template, scheduled_at, status, resend_id, error, created_at, updated_at, created_by`,
        [capped, staleBefore],
      );
      return rows.map(rowToRecord);
    }
  } catch (e) {
    console.warn('[email-scheduled] pg claim failed', e);
  }

  const now = Date.now();
  const staleMs = new Date(staleBefore).getTime();
  const rows = readFileRows();
  const claimed: ScheduledEmailRecord[] = [];
  for (const row of rows) {
    if (claimed.length >= capped) break;
    const due = new Date(row.scheduledAt).getTime() <= now;
    const staleSending = row.status === 'sending' && new Date(row.updatedAt).getTime() <= staleMs;
    if ((row.status === 'pending' && due) || staleSending) {
      row.status = 'sending';
      row.updatedAt = new Date().toISOString();
      claimed.push(row);
    }
  }
  if (claimed.length) writeFileRows(rows);
  return claimed;
}

export async function markScheduledEmailSent(
  id: string,
  resendId?: string | null,
): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (pool) {
      await pool.query(
        `UPDATE email_scheduled
         SET status = 'sent', resend_id = $2, error = NULL, updated_at = now()
         WHERE id = $1`,
        [id, resendId?.trim() || null],
      );
      return;
    }
  } catch (e) {
    console.warn('[email-scheduled] pg mark sent failed', e);
  }

  const rows = readFileRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  rows[idx] = {
    ...rows[idx],
    status: 'sent',
    resendId: resendId?.trim() || null,
    error: null,
    updatedAt: new Date().toISOString(),
  };
  writeFileRows(rows);
}

export async function markScheduledEmailFailed(id: string, error: string): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (pool) {
      await pool.query(
        `UPDATE email_scheduled
         SET status = 'failed', error = $2, updated_at = now()
         WHERE id = $1`,
        [id, error.slice(0, 500)],
      );
      return;
    }
  } catch (e) {
    console.warn('[email-scheduled] pg mark failed failed', e);
  }

  const rows = readFileRows();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  rows[idx] = {
    ...rows[idx],
    status: 'failed',
    error: error.slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  writeFileRows(rows);
}

export async function deleteScheduledEmail(id: string): Promise<boolean> {
  const scheduledId = id.trim();
  if (!scheduledId) return false;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rowCount } = await pool.query(`DELETE FROM email_scheduled WHERE id = $1`, [scheduledId]);
      if (rowCount) return true;
    }
  } catch (e) {
    console.warn('[email-scheduled] pg delete failed', e);
  }

  const rows = readFileRows();
  const next = rows.filter((r) => r.id !== scheduledId);
  if (next.length === rows.length) return false;
  writeFileRows(next);
  return true;
}

export async function cancelScheduledEmailToDraft(
  id: string,
): Promise<{ draft: EmailDraftRecord } | null> {
  const existing = await getScheduledEmail(id);
  if (!existing || existing.status === 'sent') return null;

  const draft = await createEmailDraft({
    to: existing.to,
    cc: existing.cc,
    from: existing.from,
    subject: existing.subject,
    body: existing.body,
    images: existing.images,
    inReplyToEmailId: existing.inReplyToEmailId,
    useBrandedTemplate: existing.useBrandedTemplate !== false,
    createdBy: existing.createdBy,
  });
  await deleteScheduledEmail(id);
  return { draft };
}

export function scheduledEmailToComposeBody(row: ScheduledEmailRecord): Record<string, unknown> {
  return {
    to: row.to.map((r) => r.email),
    cc: row.cc.map((r) => r.email),
    from: row.from || undefined,
    subject: row.subject,
    text: row.body,
    images: row.images,
    inReplyToEmailId: row.inReplyToEmailId,
    useBrandedTemplate: row.useBrandedTemplate !== false,
  };
}
