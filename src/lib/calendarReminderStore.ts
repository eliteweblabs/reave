/**
 * Postgres queue for calendar booking reminders (push + dashboard).
 */

import { randomUUID } from 'crypto';
import pg from 'pg';
import { getPgPool } from './pgPool';
import { reminderDedupKey } from './calendarReminderLogic';

export type CalendarReminderStatus = 'pending' | 'sending' | 'sent' | 'canceled' | 'skipped' | 'failed';

export type CalendarReminder = {
  id: string;
  bookingUid: string;
  offsetMinutes: number;
  fireAt: string;
  startTime: string;
  title: string;
  attendee: string;
  status: CalendarReminderStatus;
  dedupKey: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertCalendarReminderInput = {
  bookingUid: string;
  offsetMinutes: number;
  fireAt: Date | string;
  startTime: Date | string;
  title?: string | null;
  attendee?: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS calendar_reminders (
  id              TEXT PRIMARY KEY,
  booking_uid     TEXT NOT NULL,
  offset_minutes  INT NOT NULL DEFAULT 15,
  fire_at         TIMESTAMPTZ NOT NULL,
  start_time      TIMESTAMPTZ NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  attendee        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  dedup_key       TEXT NOT NULL UNIQUE,
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_reminders_due_idx
  ON calendar_reminders (status, fire_at);
CREATE INDEX IF NOT EXISTS calendar_reminders_booking_idx
  ON calendar_reminders (booking_uid, status);
`;

const SELECT_COLS = `id, booking_uid, offset_minutes, fire_at, start_time, title, attendee,
  status, dedup_key, sent_at, error, created_at, updated_at`;

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

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToReminder(row: {
  id: string;
  booking_uid: string;
  offset_minutes: number;
  fire_at: Date | string;
  start_time: Date | string;
  title: string;
  attendee: string;
  status: string;
  dedup_key: string;
  sent_at: Date | string | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): CalendarReminder {
  return {
    id: row.id,
    bookingUid: row.booking_uid,
    offsetMinutes: Number(row.offset_minutes) || 15,
    fireAt: new Date(row.fire_at).toISOString(),
    startTime: new Date(row.start_time).toISOString(),
    title: row.title ?? '',
    attendee: row.attendee ?? '',
    status: (row.status as CalendarReminderStatus) || 'pending',
    dedupKey: row.dedup_key,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function storeFindCalendarReminderByDedup(
  dedupKey: string,
): Promise<CalendarReminder | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM calendar_reminders WHERE dedup_key = $1 LIMIT 1`,
    [dedupKey],
  );
  return rows[0] ? rowToReminder(rows[0]) : null;
}

export async function storeUpsertCalendarReminder(
  input: UpsertCalendarReminderInput,
): Promise<CalendarReminder | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const bookingUid = input.bookingUid.trim();
  if (!bookingUid) return null;
  const offsetMinutes = Math.round(input.offsetMinutes);
  const dedupKey = reminderDedupKey(bookingUid, offsetMinutes);
  const fireAt = iso(input.fireAt);
  const startTime = iso(input.startTime);
  const title = (input.title ?? '').trim().slice(0, 240);
  const attendee = (input.attendee ?? '').trim().slice(0, 160);
  const id = randomUUID();

  const { rows } = await pool.query(
    `INSERT INTO calendar_reminders
       (id, booking_uid, offset_minutes, fire_at, start_time, title, attendee, status, dedup_key)
     VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,'pending',$8)
     ON CONFLICT (dedup_key) DO UPDATE SET
       fire_at = EXCLUDED.fire_at,
       start_time = EXCLUDED.start_time,
       title = EXCLUDED.title,
       attendee = EXCLUDED.attendee,
       status = CASE
         WHEN calendar_reminders.status IN ('sent', 'sending')
          AND calendar_reminders.start_time IS NOT DISTINCT FROM EXCLUDED.start_time
         THEN calendar_reminders.status
         ELSE 'pending'
       END,
       sent_at = CASE
         WHEN calendar_reminders.status = 'sent'
          AND calendar_reminders.start_time IS NOT DISTINCT FROM EXCLUDED.start_time
         THEN calendar_reminders.sent_at
         ELSE NULL
       END,
       error = CASE
         WHEN calendar_reminders.status IN ('sent', 'sending')
          AND calendar_reminders.start_time IS NOT DISTINCT FROM EXCLUDED.start_time
         THEN calendar_reminders.error
         ELSE NULL
       END,
       updated_at = now()
     RETURNING ${SELECT_COLS}`,
    [id, bookingUid, offsetMinutes, fireAt, startTime, title, attendee, dedupKey],
  );
  return rows[0] ? rowToReminder(rows[0]) : null;
}

/** Claim due pending rows (and stuck sending) so overlapping polls do not double-send. */
export async function storeClaimDueCalendarReminders(limit = 50): Promise<CalendarReminder[]> {
  const pool = await ensureSchema();
  if (!pool) return [];
  const cap = Math.max(1, Math.min(limit, 200));
  await pool.query(
    `UPDATE calendar_reminders
     SET status = 'pending', updated_at = now()
     WHERE status = 'sending' AND updated_at < now() - interval '2 minutes'`,
  );
  const { rows } = await pool.query(
    `UPDATE calendar_reminders
     SET status = 'sending', updated_at = now()
     WHERE id IN (
       SELECT id FROM calendar_reminders
       WHERE status = 'pending' AND fire_at <= now()
       ORDER BY fire_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING ${SELECT_COLS}`,
    [cap],
  );
  return rows.map(rowToReminder);
}

export async function storeMarkCalendarReminder(
  id: string,
  status: Exclude<CalendarReminderStatus, 'pending' | 'sending'>,
  error?: string | null,
): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;
  await pool.query(
    `UPDATE calendar_reminders
     SET status = $2,
         sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
         error = $3,
         updated_at = now()
     WHERE id = $1`,
    [id, status, error ?? null],
  );
}

/** Return a claimed row to pending so the next poll can retry. */
export async function storeReleaseCalendarReminder(id: string, error?: string | null): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;
  await pool.query(
    `UPDATE calendar_reminders
     SET status = 'pending', error = $2, updated_at = now()
     WHERE id = $1 AND status = 'sending'`,
    [id, error ?? null],
  );
}

export async function storeCancelCalendarRemindersForBooking(bookingUid: string): Promise<number> {
  const pool = await ensureSchema();
  if (!pool) return 0;
  const uid = bookingUid.trim();
  if (!uid) return 0;
  const { rowCount } = await pool.query(
    `UPDATE calendar_reminders
     SET status = 'canceled', updated_at = now()
     WHERE booking_uid = $1 AND status IN ('pending', 'sending')`,
    [uid],
  );
  return rowCount ?? 0;
}

/**
 * Cancel pending reminders whose offset is no longer in the configured set
 * (e.g. admin changed lead time from 15 → 30).
 */
export async function storeCancelStaleOffsetCalendarReminders(
  allowedOffsets: number[],
): Promise<number> {
  const pool = await ensureSchema();
  if (!pool) return 0;
  const offsets = [
    ...new Set(
      allowedOffsets
        .map((n) => Math.round(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 1),
    ),
  ];
  if (!offsets.length) return 0;
  const { rowCount } = await pool.query(
    `UPDATE calendar_reminders
     SET status = 'canceled', updated_at = now()
     WHERE status IN ('pending', 'sending')
       AND NOT (offset_minutes = ANY($1::int[]))`,
    [offsets],
  );
  return rowCount ?? 0;
}

/** Cancel pending reminders whose booking is no longer in the upcoming accepted set. */
export async function storeCancelOrphanCalendarReminders(activeUids: string[]): Promise<number> {
  const pool = await ensureSchema();
  if (!pool) return 0;
  const uids = activeUids.map((u) => u.trim()).filter(Boolean);
  if (!uids.length) {
    const { rowCount } = await pool.query(
      `UPDATE calendar_reminders
       SET status = 'canceled', updated_at = now()
       WHERE status IN ('pending', 'sending') AND start_time > now()`,
    );
    return rowCount ?? 0;
  }
  const { rowCount } = await pool.query(
    `UPDATE calendar_reminders
     SET status = 'canceled', updated_at = now()
     WHERE status IN ('pending', 'sending')
       AND start_time > now()
       AND NOT (booking_uid = ANY($1::text[]))`,
    [uids],
  );
  return rowCount ?? 0;
}

export async function storeSkipPastCalendarReminders(): Promise<number> {
  const pool = await ensureSchema();
  if (!pool) return 0;
  const { rowCount } = await pool.query(
    `UPDATE calendar_reminders
     SET status = 'skipped', updated_at = now()
     WHERE status IN ('pending', 'sending') AND start_time <= now()`,
  );
  return rowCount ?? 0;
}
