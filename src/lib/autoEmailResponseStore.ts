/**
 * Pending auto-reply drafts — owner approves before Resend send.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getPgPool } from './pgPool';

export type AutoEmailResponseDraftStatus = 'pending' | 'approved' | 'rejected';

export type AutoEmailResponseDraftRecord = {
  id: string;
  inboxEmailId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: AutoEmailResponseDraftStatus;
  resendId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type CreateAutoEmailResponseDraftInput = {
  inboxEmailId: string;
  toEmail?: string;
  subject?: string;
  body: string;
  createdBy?: string | null;
};

const MAX_FILE_ROWS = 500;
const STATUSES: AutoEmailResponseDraftStatus[] = ['pending', 'approved', 'rejected'];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auto_email_response_drafts (
  id               UUID PRIMARY KEY,
  inbox_email_id   TEXT NOT NULL,
  to_email         TEXT NOT NULL DEFAULT '',
  subject          TEXT NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  resend_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       TEXT,
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auto_email_response_drafts_status_idx
  ON auto_email_response_drafts (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS auto_email_response_drafts_inbox_idx
  ON auto_email_response_drafts (inbox_email_id);
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'auto-email-response-drafts.json');

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

function normalizeStatus(raw: unknown): AutoEmailResponseDraftStatus {
  const s = String(raw || 'pending').trim().toLowerCase();
  return (STATUSES as readonly string[]).includes(s) ? (s as AutoEmailResponseDraftStatus) : 'pending';
}

function rowToRecord(row: {
  id: string;
  inbox_email_id: string;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  resend_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
}): AutoEmailResponseDraftRecord {
  return {
    id: row.id,
    inboxEmailId: row.inbox_email_id?.trim() || '',
    toEmail: row.to_email?.trim() || '',
    subject: row.subject || '',
    body: row.body || '',
    status: normalizeStatus(row.status),
    resendId: row.resend_id?.trim() || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by?.trim() || null,
    reviewedBy: row.reviewed_by?.trim() || null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
  };
}

function readFileRows(): AutoEmailResponseDraftRecord[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
    if (!Array.isArray(parsed?.rows)) return [];
    return (parsed.rows as AutoEmailResponseDraftRecord[]).map((row) => ({
      ...row,
      status: normalizeStatus(row.status),
    }));
  } catch {
    return [];
  }
}

function writeFileRows(rows: AutoEmailResponseDraftRecord[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify({ rows: rows.slice(0, MAX_FILE_ROWS) }, null, 2), 'utf8');
}

export async function listPendingAutoEmailResponseDrafts(
  limit = 100,
): Promise<AutoEmailResponseDraftRecord[]> {
  const cap = Math.min(Math.max(limit, 1), MAX_FILE_ROWS);
  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    const { rows } = await pool.query(
      `SELECT * FROM auto_email_response_drafts
       WHERE status = 'pending'
       ORDER BY updated_at DESC
       LIMIT $1`,
      [cap],
    );
    return rows.map(rowToRecord);
  }
  return readFileRows()
    .filter((row) => row.status === 'pending')
    .slice(0, cap);
}

export async function getAutoEmailResponseDraft(
  id: string,
): Promise<AutoEmailResponseDraftRecord | null> {
  const draftId = String(id || '').trim();
  if (!draftId) return null;

  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    const { rows } = await pool.query(`SELECT * FROM auto_email_response_drafts WHERE id = $1`, [
      draftId,
    ]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  return readFileRows().find((row) => row.id === draftId) ?? null;
}

export async function createAutoEmailResponseDraft(
  input: CreateAutoEmailResponseDraftInput,
): Promise<AutoEmailResponseDraftRecord> {
  const now = new Date().toISOString();
  const record: AutoEmailResponseDraftRecord = {
    id: randomUUID(),
    inboxEmailId: String(input.inboxEmailId || '').trim(),
    toEmail: String(input.toEmail || '').trim(),
    subject: String(input.subject || '').trim(),
    body: String(input.body || '').trim(),
    status: 'pending',
    resendId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy?.trim() || null,
    reviewedBy: null,
    reviewedAt: null,
  };

  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    const { rows } = await pool.query(
      `INSERT INTO auto_email_response_drafts
         (id, inbox_email_id, to_email, subject, body, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [
        record.id,
        record.inboxEmailId,
        record.toEmail,
        record.subject,
        record.body,
        record.createdBy,
      ],
    );
    return rowToRecord(rows[0]);
  }

  const rows = [record, ...readFileRows()].slice(0, MAX_FILE_ROWS);
  writeFileRows(rows);
  return record;
}

export async function markAutoEmailResponseDraftApproved(input: {
  id: string;
  subject: string;
  body: string;
  approvedBy: string;
  resendId?: string | null;
}): Promise<AutoEmailResponseDraftRecord | null> {
  const reviewedAt = new Date().toISOString();
  const pool = await ensureSchema().catch(() => null);

  if (pool) {
    const { rows } = await pool.query(
      `UPDATE auto_email_response_drafts SET
         subject = $2,
         body = $3,
         status = 'approved',
         resend_id = $4,
         reviewed_by = $5,
         reviewed_at = $6,
         updated_at = $6
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [
        input.id,
        input.subject,
        input.body,
        input.resendId?.trim() || null,
        input.approvedBy.trim(),
        reviewedAt,
      ],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  const rows = readFileRows();
  const idx = rows.findIndex((row) => row.id === input.id && row.status === 'pending');
  if (idx < 0) return null;
  const updated: AutoEmailResponseDraftRecord = {
    ...rows[idx]!,
    subject: input.subject,
    body: input.body,
    status: 'approved',
    resendId: input.resendId?.trim() || null,
    reviewedBy: input.approvedBy.trim(),
    reviewedAt,
    updatedAt: reviewedAt,
  };
  rows[idx] = updated;
  writeFileRows(rows);
  return updated;
}

export async function markAutoEmailResponseDraftRejected(input: {
  id: string;
  rejectedBy: string;
}): Promise<AutoEmailResponseDraftRecord | null> {
  const reviewedAt = new Date().toISOString();
  const pool = await ensureSchema().catch(() => null);

  if (pool) {
    const { rows } = await pool.query(
      `UPDATE auto_email_response_drafts SET
         status = 'rejected',
         reviewed_by = $2,
         reviewed_at = $3,
         updated_at = $3
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [input.id, input.rejectedBy.trim(), reviewedAt],
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  const rows = readFileRows();
  const idx = rows.findIndex((row) => row.id === input.id && row.status === 'pending');
  if (idx < 0) return null;
  const updated: AutoEmailResponseDraftRecord = {
    ...rows[idx]!,
    status: 'rejected',
    reviewedBy: input.rejectedBy.trim(),
    reviewedAt,
    updatedAt: reviewedAt,
  };
  rows[idx] = updated;
  writeFileRows(rows);
  return updated;
}
