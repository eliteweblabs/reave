import pg from 'pg';
import { clerkGetUserCount } from './clerkClient';
import { serverEnv } from './serverEnv';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS udb_counters (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  impressions BIGINT NOT NULL DEFAULT 0,
  launch_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO udb_counters (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
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

function launchDate(): Date {
  const raw = serverEnv('UDB_LAUNCH_DATE')?.trim();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date('2026-09-12T00:00:00-04:00');
}

export function daysSinceLaunch(from = launchDate(), now = new Date()): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

export async function recordUdbImpression(): Promise<number> {
  const pool = await ensureSchema();
  if (!pool) return 1;
  const r = await pool.query<{ impressions: string }>(
    `UPDATE udb_counters SET impressions = impressions + 1 WHERE id = 1 RETURNING impressions`,
  );
  return Number(r.rows[0]?.impressions ?? 1);
}

export async function getUdbStats(): Promise<{
  impressions: number;
  people: number;
  day: number;
}> {
  const pool = await ensureSchema();
  let impressions = 1;
  let launchAt = launchDate();

  if (pool) {
    const r = await pool.query<{ impressions: string; launch_at: Date }>(
      `SELECT impressions, launch_at FROM udb_counters WHERE id = 1`,
    );
    if (r.rows[0]) {
      impressions = Number(r.rows[0].impressions) || 1;
      launchAt = r.rows[0].launch_at ?? launchAt;
    }
  }

  const peopleResult = await clerkGetUserCount();
  const people = peopleResult.ok ? peopleResult.count : 1;

  return {
    impressions,
    people: Math.max(people, 1),
    day: daysSinceLaunch(launchAt),
  };
}
