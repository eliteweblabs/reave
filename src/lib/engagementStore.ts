/**
 * Engagement events for dashboard review banners (vault submits, share opens, deck views).
 * Postgres (DATABASE_URL) when set; otherwise JSON under src/knowledge/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type EngagementEventType = 'vault_entry' | 'share_open' | 'deck_view';

export type EngagementEvent = {
  id: string;
  type: EngagementEventType;
  title: string;
  detail: string;
  createdAt: string;
  staffAckAt: string | null;
  contactUid: string | null;
  contactName: string | null;
  jobSlug: string | null;
  jobTitle: string | null;
  /** Dedupe key (e.g. link token, vault batch id, deck session). */
  dedupeKey: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS engagement_events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  staff_ack_at  TIMESTAMPTZ,
  contact_uid   TEXT,
  contact_name  TEXT,
  job_slug      TEXT,
  job_title     TEXT,
  dedupe_key    TEXT
);
CREATE INDEX IF NOT EXISTS engagement_events_pending_idx
  ON engagement_events (staff_ack_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS engagement_events_dedupe_uidx
  ON engagement_events (type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'engagement-events.json');
const MAX_FILE_EVENTS = 2000;

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

function readFileEvents(): EngagementEvent[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
    return Array.isArray(parsed) ? (parsed as EngagementEvent[]) : [];
  } catch {
    return [];
  }
}

function writeFileEvents(events: EngagementEvent[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify(events.slice(0, MAX_FILE_EVENTS), null, 2), 'utf8');
}

function rowToEvent(row: {
  id: string;
  type: string;
  title: string;
  detail: string;
  created_at: Date | string;
  staff_ack_at: Date | string | null;
  contact_uid: string | null;
  contact_name: string | null;
  job_slug: string | null;
  job_title: string | null;
  dedupe_key: string | null;
}): EngagementEvent {
  return {
    id: row.id,
    type: row.type as EngagementEventType,
    title: row.title,
    detail: row.detail || '',
    createdAt: new Date(row.created_at).toISOString(),
    staffAckAt: row.staff_ack_at ? new Date(row.staff_ack_at).toISOString() : null,
    contactUid: row.contact_uid,
    contactName: row.contact_name,
    jobSlug: row.job_slug,
    jobTitle: row.job_title,
    dedupeKey: row.dedupe_key,
  };
}

export type CreateEngagementInput = {
  type: EngagementEventType;
  title: string;
  detail?: string;
  contactUid?: string | null;
  contactName?: string | null;
  jobSlug?: string | null;
  jobTitle?: string | null;
  dedupeKey?: string | null;
};

/** Insert an engagement event. Returns null when dedupeKey already has a pending event. */
export async function storeCreateEngagementEvent(
  input: CreateEngagementInput,
): Promise<EngagementEvent | null> {
  const event: EngagementEvent = {
    id: randomUUID(),
    type: input.type,
    title: input.title.trim(),
    detail: (input.detail || '').trim(),
    createdAt: new Date().toISOString(),
    staffAckAt: null,
    contactUid: input.contactUid?.trim() || null,
    contactName: input.contactName?.trim() || null,
    jobSlug: input.jobSlug?.trim() || null,
    jobTitle: input.jobTitle?.trim() || null,
    dedupeKey: input.dedupeKey?.trim() || null,
  };
  if (!event.title) return null;

  const pool = await ensureSchema();
  if (pool) {
    try {
      const res = await pool.query(
        `INSERT INTO engagement_events
          (id, type, title, detail, created_at, contact_uid, contact_name, job_slug, job_title, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING
         RETURNING id, type, title, detail, created_at, staff_ack_at, contact_uid, contact_name,
                   job_slug, job_title, dedupe_key`,
        [
          event.id,
          event.type,
          event.title,
          event.detail,
          event.createdAt,
          event.contactUid,
          event.contactName,
          event.jobSlug,
          event.jobTitle,
          event.dedupeKey,
        ],
      );
      if (!res.rows[0]) return null;
      return rowToEvent(res.rows[0]);
    } catch (e) {
      // Unique partial index conflict on older PG without ON CONFLICT target match
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) return null;
      throw e;
    }
  }

  const events = readFileEvents();
  if (
    event.dedupeKey &&
    events.some((e) => e.type === event.type && e.dedupeKey === event.dedupeKey && !e.staffAckAt)
  ) {
    return null;
  }
  events.unshift(event);
  writeFileEvents(events);
  return event;
}

export async function storeListPendingEngagementEvents(opts?: {
  limit?: number;
  maxAgeDays?: number;
  types?: EngagementEventType[];
}): Promise<EngagementEvent[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 500);
  const maxAgeMs = (opts?.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const types = opts?.types;

  const pool = await ensureSchema();
  if (pool) {
    const params: unknown[] = [cutoff, limit];
    let typeClause = '';
    if (types?.length) {
      params.push(types);
      typeClause = ` AND type = ANY($${params.length}::text[])`;
    }
    const res = await pool.query(
      `SELECT id, type, title, detail, created_at, staff_ack_at, contact_uid, contact_name,
              job_slug, job_title, dedupe_key
       FROM engagement_events
       WHERE staff_ack_at IS NULL AND created_at >= $1${typeClause}
       ORDER BY created_at DESC
       LIMIT $2`,
      params,
    );
    return res.rows.map(rowToEvent);
  }

  return readFileEvents()
    .filter(
      (e) =>
        !e.staffAckAt &&
        e.createdAt >= cutoff &&
        (!types?.length || types.includes(e.type)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function storeCountPendingEngagementEvents(opts?: {
  maxAgeDays?: number;
}): Promise<number> {
  return (await storeListPendingEngagementEvents({ limit: 500, maxAgeDays: opts?.maxAgeDays })).length;
}

export async function storeAckEngagementEvent(
  id: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const eventId = id.trim();
  if (!eventId) return { ok: false, error: 'Invalid engagement id' };
  const now = new Date().toISOString();

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `UPDATE engagement_events
       SET staff_ack_at = COALESCE(staff_ack_at, $2::timestamptz)
       WHERE id = $1
       RETURNING id`,
      [eventId, now],
    );
    if (!res.rows[0]) return { ok: false, error: 'Not found' };
    return { ok: true, id: eventId };
  }

  const events = readFileEvents();
  const idx = events.findIndex((e) => e.id === eventId);
  if (idx < 0) return { ok: false, error: 'Not found' };
  const row = events[idx]!;
  if (!row.staffAckAt) row.staffAckAt = now;
  events[idx] = row;
  writeFileEvents(events);
  return { ok: true, id: eventId };
}
