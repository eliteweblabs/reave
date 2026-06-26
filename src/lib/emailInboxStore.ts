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

export interface EmailInboxRecord {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  bodySnippet: string;
  status: string;
  action: string;
  notified: boolean;
}

export interface EmailInboxInput {
  from: string;
  subject: string;
  bodySnippet: string;
  status: string;
  action: string;
  notified: boolean;
}

const MAX_FILE_EVENTS = 500;

const SCHEMA_SQL = `
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
CREATE INDEX IF NOT EXISTS email_inbox_received_idx ON email_inbox (received_at DESC);
`;

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

function rowToRecord(row: {
  id: string;
  received_at: Date | string;
  from_address: string;
  subject: string;
  body_snippet: string;
  status: string;
  action: string;
  notified: boolean;
}): EmailInboxRecord {
  return {
    id: row.id,
    receivedAt: new Date(row.received_at).toISOString(),
    from: row.from_address,
    subject: row.subject,
    bodySnippet: row.body_snippet,
    status: row.status,
    action: row.action,
    notified: !!row.notified,
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

async function listFromFile(limit: number): Promise<EmailInboxRecord[]> {
  const path = inboxFilePath();
  if (!existsSync(path)) return [];
  const events = parseFileEvents(readFileSync(path, 'utf8'));
  return events
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, limit);
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
  };
  const next = [record, ...existing].slice(0, MAX_FILE_EVENTS);
  if (!writeFileEvents(next)) return null;
  return record;
}

async function listFromPg(limit: number): Promise<EmailInboxRecord[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const { rows } = await pool.query(
      `SELECT id, received_at, from_address, subject, body_snippet, status, action, notified
       FROM email_inbox ORDER BY received_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map(rowToRecord);
  } catch (e) {
    console.error('[email-inbox] pg list failed', e);
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
        (id, from_address, subject, body_snippet, status, action, notified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, received_at, from_address, subject, body_snippet, status, action, notified`,
      [id, input.from, input.subject, input.bodySnippet, input.status, input.action, input.notified]
    );
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch (e) {
    console.error('[email-inbox] pg append failed', e);
    return null;
  }
}

export async function storeListEmailInbox(limit = 100): Promise<EmailInboxRecord[]> {
  if (databaseUrl()) return listFromPg(limit);
  return listFromFile(limit);
}

export async function storeRecordEmailInbox(input: EmailInboxInput): Promise<EmailInboxRecord | null> {
  if (databaseUrl()) return appendToPg(input);
  return appendToFile(input);
}
