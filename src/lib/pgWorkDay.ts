/**
 * Postgres store for Work Day — field sessions, segments, properties, GPS samples.
 */

import { randomUUID } from 'crypto';
import pg from 'pg';
import { getPgPool } from './pgPool';

export interface ClientPropertyRow {
  id: string;
  contact_uid: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  created_at: string | Date;
  archived: boolean;
}

export interface WorkDaySessionRow {
  id: string;
  clerk_user_id: string;
  started_at: string | Date;
  ended_at: string | Date | null;
  status: string;
}

export interface WorkDaySegmentRow {
  id: string;
  session_id: string;
  contact_uid: string;
  property_id: string | null;
  job_slug: string | null;
  started_at: string | Date;
  ended_at: string | Date | null;
}

const WORK_DAY_MIGRATE_SQL = `
ALTER TABLE work_day_segments ADD COLUMN IF NOT EXISTS job_slug VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_work_day_segments_job ON work_day_segments(job_slug);
`;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS client_properties (
  id UUID PRIMARY KEY,
  contact_uid VARCHAR(255) NOT NULL,
  label VARCHAR(500) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  place_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_client_properties_contact ON client_properties(contact_uid) WHERE NOT archived;

CREATE TABLE IF NOT EXISTS work_day_sessions (
  id UUID PRIMARY KEY,
  clerk_user_id VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed'))
);
CREATE INDEX IF NOT EXISTS idx_work_day_sessions_user ON work_day_sessions(clerk_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_day_sessions_active ON work_day_sessions(clerk_user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS work_day_segments (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES work_day_sessions(id) ON DELETE CASCADE,
  contact_uid VARCHAR(255) NOT NULL,
  property_id UUID REFERENCES client_properties(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_work_day_segments_session ON work_day_segments(session_id, started_at);

CREATE TABLE IF NOT EXISTS work_day_location_samples (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES work_day_sessions(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES work_day_segments(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_day_loc_session ON work_day_location_samples(session_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS work_day_reconcile_runs (
  id UUID PRIMARY KEY,
  week_start DATE NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_day_reconcile_week ON work_day_reconcile_runs(week_start);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => pool.query(WORK_DAY_MIGRATE_SQL))
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

function pgTimestamp(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function pgDateOnly(value: unknown): string {
  const iso = pgTimestamp(value);
  return iso.slice(0, 10);
}

export type WorkDaySegment = {
  id: string;
  sessionId: string;
  jobSlug: string;
  startedAt: string;
  endedAt: string | null;
};

export type WorkDaySession = {
  id: string;
  clerkUserId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed';
  openSegment: WorkDaySegment | null;
};

function mapSegment(row: WorkDaySegmentRow): WorkDaySegment {
  const slug = (row.job_slug || '').trim();
  return {
    id: row.id,
    sessionId: row.session_id,
    jobSlug: slug,
    startedAt: pgTimestamp(row.started_at),
    endedAt: row.ended_at ? pgTimestamp(row.ended_at) : null,
  };
}

async function loadOpenSegment(
  pool: pg.Pool,
  sessionId: string,
): Promise<WorkDaySegment | null> {
  const { rows } = await pool.query<WorkDaySegmentRow>(
    `SELECT id, session_id, contact_uid, property_id, job_slug, started_at, ended_at
     FROM work_day_segments
     WHERE session_id = $1 AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [sessionId],
  );
  const row = rows[0];
  return row ? mapSegment(row) : null;
}

export async function dbGetActiveSession(clerkUserId: string): Promise<WorkDaySession | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<WorkDaySessionRow>(
      `SELECT id, clerk_user_id, started_at, ended_at, status
       FROM work_day_sessions
       WHERE clerk_user_id = $1 AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
      [clerkUserId],
    );
    const row = rows[0];
    if (!row) return null;
    const openSegment = await loadOpenSegment(pool, row.id);
    return {
      id: row.id,
      clerkUserId: row.clerk_user_id,
      startedAt: pgTimestamp(row.started_at),
      endedAt: row.ended_at ? pgTimestamp(row.ended_at) : null,
      status: row.status === 'completed' ? 'completed' : 'active',
      openSegment,
    };
  } catch (e) {
    console.error('[work-day:pg] get active session error:', e);
    return null;
  }
}

async function closeOpenSegment(pool: pg.Pool, sessionId: string, endedAt: string): Promise<void> {
  await pool.query(
    `UPDATE work_day_segments SET ended_at = $2 WHERE session_id = $1 AND ended_at IS NULL`,
    [sessionId, endedAt],
  );
}

async function openSegment(
  pool: pg.Pool,
  sessionId: string,
  jobSlug: string,
  startedAt: string,
): Promise<WorkDaySegment> {
  const id = randomUUID();
  const slug = jobSlug.trim();
  const { rows } = await pool.query<WorkDaySegmentRow>(
    `INSERT INTO work_day_segments (id, session_id, contact_uid, property_id, job_slug, started_at)
     VALUES ($1, $2, '', NULL, $3, $4)
     RETURNING id, session_id, contact_uid, property_id, job_slug, started_at, ended_at`,
    [id, sessionId, slug, startedAt],
  );
  return mapSegment(rows[0]!);
}

export async function dbStartWorkDaySession(
  clerkUserId: string,
  jobSlug: string,
): Promise<{ ok: true; session: WorkDaySession } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Database not configured' };
    const slug = jobSlug.trim();
    if (!slug) return { ok: false, error: 'jobSlug is required' };

    const existing = await dbGetActiveSession(clerkUserId);
    if (existing) return { ok: false, error: 'Work day already active' };

    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO work_day_sessions (id, clerk_user_id, started_at, status)
       VALUES ($1, $2, $3, 'active')`,
      [sessionId, clerkUserId, startedAt],
    );
    const openSegment = await openSegment(pool, sessionId, slug, startedAt);
    return {
      ok: true,
      session: {
        id: sessionId,
        clerkUserId,
        startedAt,
        endedAt: null,
        status: 'active',
        openSegment,
      },
    };
  } catch (e) {
    console.error('[work-day:pg] start session error:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function dbStopWorkDaySession(
  clerkUserId: string,
): Promise<{ ok: true; session: WorkDaySession } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Database not configured' };

    const active = await dbGetActiveSession(clerkUserId);
    if (!active) return { ok: false, error: 'No active work day' };

    const endedAt = new Date().toISOString();
    await closeOpenSegment(pool, active.id, endedAt);
    await pool.query(
      `UPDATE work_day_sessions SET ended_at = $2, status = 'completed' WHERE id = $1`,
      [active.id, endedAt],
    );
    return {
      ok: true,
      session: {
        ...active,
        endedAt,
        status: 'completed',
        openSegment: null,
      },
    };
  } catch (e) {
    console.error('[work-day:pg] stop session error:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function dbSwitchWorkDaySegment(
  clerkUserId: string,
  jobSlug: string,
): Promise<{ ok: true; session: WorkDaySession } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Database not configured' };
    const slug = jobSlug.trim();
    if (!slug) return { ok: false, error: 'jobSlug is required' };

    const active = await dbGetActiveSession(clerkUserId);
    if (!active) return { ok: false, error: 'No active work day' };

    const now = new Date().toISOString();
    await closeOpenSegment(pool, active.id, now);
    const openSegment = await openSegment(pool, active.id, slug, now);
    return {
      ok: true,
      session: { ...active, openSegment },
    };
  } catch (e) {
    console.error('[work-day:pg] switch segment error:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function dbRecordWorkDayLocation(input: {
  clerkUserId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Database not configured' };

    const active = await dbGetActiveSession(input.clerkUserId);
    if (!active) return { ok: false, error: 'No active work day' };

    const segmentId = active.openSegment?.id ?? null;
    await pool.query(
      `INSERT INTO work_day_location_samples (id, session_id, segment_id, lat, lng, accuracy, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [randomUUID(), active.id, segmentId, input.lat, input.lng, input.accuracy ?? null],
    );
    return { ok: true };
  } catch (e) {
    console.error('[work-day:pg] location sample error:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function dbLastLocationSampleTime(sessionId: string): Promise<string | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{ recorded_at: Date }>(
      `SELECT recorded_at FROM work_day_location_samples
       WHERE session_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [sessionId],
    );
    return rows[0] ? pgTimestamp(rows[0].recorded_at) : null;
  } catch {
    return null;
  }
}

export type WorkDaySummaryLine = {
  jobSlug: string;
  clerkUserId: string;
  hours: number;
  sampleCount: number;
  segmentCount: number;
};

function segmentHours(startedAt: string, endedAt: string | null, now: Date): number {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(((end - start) / 3600000) * 100) / 100;
}

/** Week bounds [start, end) in UTC from Monday YYYY-MM-DD. */
export function weekRangeUtc(weekStartMonday: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartMonday.trim());
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 7 * 86400000);
  return { start, end };
}

export function mondayOfWeekContaining(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export async function dbWorkDayWeekSummary(weekStart: string): Promise<{
  lines: WorkDaySummaryLine[];
  approved: boolean;
  approvedAt: string | null;
} | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const range = weekRangeUtc(weekStart);
    if (!range) return { lines: [], approved: false, approvedAt: null };

    const { rows: segRows } = await pool.query<
      WorkDaySegmentRow & { clerk_user_id: string }
    >(
      `SELECT s.id, s.session_id, s.contact_uid, s.property_id, s.job_slug, s.started_at, s.ended_at,
              sess.clerk_user_id
       FROM work_day_segments s
       JOIN work_day_sessions sess ON sess.id = s.session_id
       WHERE s.started_at >= $1 AND s.started_at < $2`,
      [range.start.toISOString(), range.end.toISOString()],
    );

    const now = new Date();
    const bucket = new Map<string, WorkDaySummaryLine>();
    for (const row of segRows) {
      const jobSlug = (row.job_slug || '').trim();
      if (!jobSlug) continue;
      const key = `${row.clerk_user_id}\0${jobSlug}`;
      const hours = segmentHours(pgTimestamp(row.started_at), row.ended_at ? pgTimestamp(row.ended_at) : null, now);
      const existing = bucket.get(key);
      if (existing) {
        existing.hours = Math.round((existing.hours + hours) * 100) / 100;
        existing.segmentCount += 1;
      } else {
        bucket.set(key, {
          jobSlug,
          clerkUserId: row.clerk_user_id,
          hours,
          sampleCount: 0,
          segmentCount: 1,
        });
      }
    }

    const { rows: sampleRows } = await pool.query<{
      job_slug: string | null;
      clerk_user_id: string;
      cnt: string;
    }>(
      `SELECT sess.clerk_user_id, seg.job_slug, COUNT(*)::text AS cnt
       FROM work_day_location_samples loc
       JOIN work_day_sessions sess ON sess.id = loc.session_id
       LEFT JOIN work_day_segments seg ON seg.id = loc.segment_id
       WHERE loc.recorded_at >= $1 AND loc.recorded_at < $2
       GROUP BY sess.clerk_user_id, seg.job_slug`,
      [range.start.toISOString(), range.end.toISOString()],
    );

    for (const row of sampleRows) {
      const jobSlug = (row.job_slug || '').trim();
      if (!jobSlug) continue;
      const key = `${row.clerk_user_id}\0${jobSlug}`;
      const line = bucket.get(key);
      const cnt = Number(row.cnt) || 0;
      if (line) line.sampleCount = cnt;
    }

    const { rows: approveRows } = await pool.query<{ approved_at: Date }>(
      `SELECT approved_at FROM work_day_reconcile_runs WHERE week_start = $1::date LIMIT 1`,
      [pgDateOnly(weekStart)],
    );

    return {
      lines: [...bucket.values()].sort((a, b) => b.hours - a.hours),
      approved: approveRows.length > 0,
      approvedAt: approveRows[0] ? pgTimestamp(approveRows[0].approved_at) : null,
    };
  } catch (e) {
    console.error('[work-day:pg] week summary error:', e);
    return null;
  }
}

export async function dbSaveReconcileRun(input: {
  weekStart: string;
  approvedBy: string;
  payload: unknown;
}): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO work_day_reconcile_runs (id, week_start, approved_by, payload)
       VALUES ($1, $2::date, $3, $4::jsonb)
       ON CONFLICT (week_start) DO UPDATE SET
         approved_at = NOW(),
         approved_by = EXCLUDED.approved_by,
         payload = EXCLUDED.payload`,
      [randomUUID(), pgDateOnly(input.weekStart), input.approvedBy, JSON.stringify(input.payload ?? {})],
    );
    return true;
  } catch (e) {
    console.error('[work-day:pg] reconcile save error:', e);
    return false;
  }
}

export async function dbCountLocationSamplesForWeek(weekStart: string): Promise<number> {
  try {
    const pool = await ensureSchema();
    if (!pool) return 0;
    const range = weekRangeUtc(weekStart);
    if (!range) return 0;
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM work_day_location_samples
       WHERE recorded_at >= $1 AND recorded_at < $2`,
      [range.start.toISOString(), range.end.toISOString()],
    );
    return Number(rows[0]?.cnt) || 0;
  } catch {
    return 0;
  }
}
