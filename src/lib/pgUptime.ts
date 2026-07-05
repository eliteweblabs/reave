/**
 * Postgres-backed UptimeRobot monitor + incident history.
 */
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type UptimeMonitorRow = {
  id: number;
  friendly_name: string;
  url: string | null;
  status: number;
  uptime_ratio_7d: number | null;
  uptime_ratio_30d: number | null;
  client_uid: string | null;
  last_checked_at: string | null;
  updated_at: string;
};

export type UptimeIncidentRow = {
  id: string;
  monitor_id: number;
  alert_type: string;
  status_before: number | null;
  status_after: number | null;
  duration_seconds: number | null;
  message: string | null;
  source: 'webhook' | 'poll';
  started_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

const MONITOR_COLUMNS =
  'id, friendly_name, url, status, uptime_ratio_7d, uptime_ratio_30d, client_uid, last_checked_at, updated_at';

const INCIDENT_COLUMNS =
  'id, monitor_id, alert_type, status_before, status_after, duration_seconds, message, source, started_at, resolved_at, created_at';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS uptime_monitors (
  id BIGINT PRIMARY KEY,
  friendly_name TEXT NOT NULL DEFAULT '',
  url TEXT,
  status INT NOT NULL DEFAULT 1,
  uptime_ratio_7d NUMERIC(6,3),
  uptime_ratio_30d NUMERIC(6,3),
  client_uid TEXT,
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uptime_monitors_client ON uptime_monitors (client_uid);
CREATE INDEX IF NOT EXISTS idx_uptime_monitors_status ON uptime_monitors (status);

CREATE TABLE IF NOT EXISTS uptime_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id BIGINT NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL DEFAULT '',
  status_before INT,
  status_after INT,
  duration_seconds INT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook', 'poll')),
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_monitor ON uptime_incidents (monitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_open ON uptime_incidents (monitor_id, resolved_at)
  WHERE resolved_at IS NULL;
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

export function isUptimeDbConfigured(): boolean {
  return !!databaseUrl();
}

function rowToMonitor(row: UptimeMonitorRow): UptimeMonitorRow {
  return {
    id: Number(row.id),
    friendly_name: row.friendly_name,
    url: row.url,
    status: Number(row.status),
    uptime_ratio_7d: row.uptime_ratio_7d != null ? Number(row.uptime_ratio_7d) : null,
    uptime_ratio_30d: row.uptime_ratio_30d != null ? Number(row.uptime_ratio_30d) : null,
    client_uid: row.client_uid,
    last_checked_at: row.last_checked_at,
    updated_at: row.updated_at,
  };
}

function rowToIncident(row: UptimeIncidentRow): UptimeIncidentRow {
  return {
    id: row.id,
    monitor_id: Number(row.monitor_id),
    alert_type: row.alert_type,
    status_before: row.status_before != null ? Number(row.status_before) : null,
    status_after: row.status_after != null ? Number(row.status_after) : null,
    duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    message: row.message,
    source: row.source,
    started_at: row.started_at,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
  };
}

export async function dbListUptimeMonitors(): Promise<UptimeMonitorRow[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<UptimeMonitorRow>(
      `SELECT ${MONITOR_COLUMNS} FROM uptime_monitors ORDER BY friendly_name ASC, id ASC`,
    );
    return rows.map(rowToMonitor);
  } catch (e) {
    console.warn('[uptime-db] list monitors failed', e);
    return null;
  }
}

export async function dbGetUptimeMonitor(id: number): Promise<UptimeMonitorRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<UptimeMonitorRow>(
      `SELECT ${MONITOR_COLUMNS} FROM uptime_monitors WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToMonitor(rows[0]) : null;
  } catch (e) {
    console.warn('[uptime-db] get monitor failed', e);
    return null;
  }
}

export async function dbUpsertUptimeMonitor(input: {
  id: number;
  friendly_name: string;
  url: string | null;
  status: number;
  uptime_ratio_7d: number | null;
  uptime_ratio_30d: number | null;
  client_uid?: string | null;
}): Promise<UptimeMonitorRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const now = new Date().toISOString();
    const { rows } = await pool.query<UptimeMonitorRow>(
      `INSERT INTO uptime_monitors (
        id, friendly_name, url, status, uptime_ratio_7d, uptime_ratio_30d, client_uid, last_checked_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (id) DO UPDATE SET
        friendly_name = EXCLUDED.friendly_name,
        url = EXCLUDED.url,
        status = EXCLUDED.status,
        uptime_ratio_7d = EXCLUDED.uptime_ratio_7d,
        uptime_ratio_30d = EXCLUDED.uptime_ratio_30d,
        client_uid = COALESCE(uptime_monitors.client_uid, EXCLUDED.client_uid),
        last_checked_at = EXCLUDED.last_checked_at,
        updated_at = EXCLUDED.updated_at
      RETURNING ${MONITOR_COLUMNS}`,
      [
        input.id,
        input.friendly_name,
        input.url,
        input.status,
        input.uptime_ratio_7d,
        input.uptime_ratio_30d,
        input.client_uid ?? null,
        now,
      ],
    );
    return rows[0] ? rowToMonitor(rows[0]) : null;
  } catch (e) {
    console.warn('[uptime-db] upsert monitor failed', e);
    return null;
  }
}

export async function dbSetMonitorClientUid(monitorId: number, clientUid: string | null): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    await pool.query(
      `UPDATE uptime_monitors SET client_uid = $2, updated_at = NOW() WHERE id = $1`,
      [monitorId, clientUid],
    );
  } catch (e) {
    console.warn('[uptime-db] set client uid failed', e);
  }
}

export async function dbInsertUptimeIncident(input: {
  monitor_id: number;
  alert_type: string;
  status_before?: number | null;
  status_after?: number | null;
  duration_seconds?: number | null;
  message?: string | null;
  source: 'webhook' | 'poll';
  started_at?: string | null;
  resolved_at?: string | null;
}): Promise<UptimeIncidentRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<UptimeIncidentRow>(
      `INSERT INTO uptime_incidents (
        monitor_id, alert_type, status_before, status_after, duration_seconds, message, source, started_at, resolved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${INCIDENT_COLUMNS}`,
      [
        input.monitor_id,
        input.alert_type,
        input.status_before ?? null,
        input.status_after ?? null,
        input.duration_seconds ?? null,
        input.message ?? null,
        input.source,
        input.started_at ?? null,
        input.resolved_at ?? null,
      ],
    );
    return rows[0] ? rowToIncident(rows[0]) : null;
  } catch (e) {
    console.warn('[uptime-db] insert incident failed', e);
    return null;
  }
}

export async function dbListUptimeIncidents(
  monitorId: number,
  limit = 50,
): Promise<UptimeIncidentRow[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const capped = Math.max(1, Math.min(limit, 200));
    const { rows } = await pool.query<UptimeIncidentRow>(
      `SELECT ${INCIDENT_COLUMNS}
       FROM uptime_incidents
       WHERE monitor_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [monitorId, capped],
    );
    return rows.map(rowToIncident);
  } catch (e) {
    console.warn('[uptime-db] list incidents failed', e);
    return null;
  }
}

export async function dbListMonitorsForClient(clientUid: string): Promise<UptimeMonitorRow[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<UptimeMonitorRow>(
      `SELECT ${MONITOR_COLUMNS} FROM uptime_monitors WHERE client_uid = $1 ORDER BY friendly_name ASC`,
      [clientUid],
    );
    return rows.map(rowToMonitor);
  } catch (e) {
    console.warn('[uptime-db] list client monitors failed', e);
    return null;
  }
}

export async function dbListIncidentsForClient(
  clientUid: string,
  limit = 20,
): Promise<(UptimeIncidentRow & { monitor_name: string; monitor_url: string | null })[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const capped = Math.max(1, Math.min(limit, 100));
    const { rows } = await pool.query<
      UptimeIncidentRow & { monitor_name: string; monitor_url: string | null }
    >(
      `SELECT i.${INCIDENT_COLUMNS.replace(/,\s*/g, ', i.')}, m.friendly_name AS monitor_name, m.url AS monitor_url
       FROM uptime_incidents i
       JOIN uptime_monitors m ON m.id = i.monitor_id
       WHERE m.client_uid = $1
       ORDER BY i.created_at DESC
       LIMIT $2`,
      [clientUid, capped],
    );
    return rows.map((row) => ({
      ...rowToIncident(row),
      monitor_name: row.monitor_name,
      monitor_url: row.monitor_url,
    }));
  } catch (e) {
    console.warn('[uptime-db] list client incidents failed', e);
    return null;
  }
}

export async function dbGetOpenIncident(monitorId: number): Promise<UptimeIncidentRow | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<UptimeIncidentRow>(
      `SELECT ${INCIDENT_COLUMNS}
       FROM uptime_incidents
       WHERE monitor_id = $1 AND resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [monitorId],
    );
    return rows[0] ? rowToIncident(rows[0]) : null;
  } catch (e) {
    console.warn('[uptime-db] get open incident failed', e);
    return null;
  }
}

export async function dbResolveOpenIncident(
  monitorId: number,
  resolvedAt: string,
  durationSeconds?: number | null,
): Promise<void> {
  try {
    const pool = await ensureSchema();
    if (!pool) return;
    await pool.query(
      `UPDATE uptime_incidents
       SET resolved_at = $2,
           duration_seconds = COALESCE($3, duration_seconds)
       WHERE monitor_id = $1 AND resolved_at IS NULL`,
      [monitorId, resolvedAt, durationSeconds ?? null],
    );
  } catch (e) {
    console.warn('[uptime-db] resolve incident failed', e);
  }
}

export type UptimeSummaryStats = {
  total: number;
  up: number;
  down: number;
  paused: number;
  avg_uptime_7d: number | null;
  open_incidents: number;
  recent_incidents: (UptimeIncidentRow & { monitor_name: string })[];
};

export async function dbUptimeSummary(): Promise<UptimeSummaryStats | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    const [monitorsRes, openRes, recentRes] = await Promise.all([
      pool.query<{ total: string; up: string; down: string; paused: string; avg7: string | null }>(
        `SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 2)::text AS up,
          COUNT(*) FILTER (WHERE status IN (8, 9))::text AS down,
          COUNT(*) FILTER (WHERE status = 0)::text AS paused,
          AVG(uptime_ratio_7d)::text AS avg7
         FROM uptime_monitors`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM uptime_incidents WHERE resolved_at IS NULL`,
      ),
      pool.query<UptimeIncidentRow & { monitor_name: string }>(
        `SELECT i.${INCIDENT_COLUMNS.replace(/,\s*/g, ', i.')}, m.friendly_name AS monitor_name
         FROM uptime_incidents i
         JOIN uptime_monitors m ON m.id = i.monitor_id
         ORDER BY i.created_at DESC
         LIMIT 10`,
      ),
    ]);

    const m = monitorsRes.rows[0];
    return {
      total: Number(m?.total ?? 0),
      up: Number(m?.up ?? 0),
      down: Number(m?.down ?? 0),
      paused: Number(m?.paused ?? 0),
      avg_uptime_7d: m?.avg7 != null ? Number(m.avg7) : null,
      open_incidents: Number(openRes.rows[0]?.count ?? 0),
      recent_incidents: recentRes.rows.map((row) => ({
        ...rowToIncident(row),
        monitor_name: row.monitor_name,
      })),
    };
  } catch (e) {
    console.warn('[uptime-db] summary failed', e);
    return null;
  }
}
