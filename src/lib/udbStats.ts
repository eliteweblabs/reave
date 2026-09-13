/**
 * Upside Down Bottle public counters (impressions, sign-ups, day tally).
 * Postgres (DATABASE_URL) when set; otherwise JSON under src/knowledge/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { clerkGetUserCount } from './clerkClient';
import { getPgPool } from './pgPool';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'udb-counters.json');

type FileCounters = {
  impressions: number;
  launchAt: string;
};

let _schemaReady: Promise<void> | null = null;

async function ensureSchema() {
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

function launchDate(): Date {
  const raw = serverEnv('UDB_LAUNCH_DATE')?.trim();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date('2026-09-12T00:00:00-04:00');
}

function defaultFileCounters(): FileCounters {
  return { impressions: 0, launchAt: launchDate().toISOString() };
}

function readFileCounters(): FileCounters {
  try {
    if (!existsSync(FILE_PATH)) return defaultFileCounters();
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8')) as Partial<FileCounters>;
    return {
      impressions: Math.max(0, Number(parsed.impressions) || 0),
      launchAt:
        typeof parsed.launchAt === 'string' && !Number.isNaN(Date.parse(parsed.launchAt))
          ? parsed.launchAt
          : launchDate().toISOString(),
    };
  } catch {
    return defaultFileCounters();
  }
}

function writeFileCounters(data: FileCounters): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function daysSinceLaunch(from = launchDate(), now = new Date()): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

function incrementFileImpression(): number {
  const data = readFileCounters();
  data.impressions += 1;
  writeFileCounters(data);
  return Math.max(1, data.impressions);
}

export async function recordUdbImpression(): Promise<number> {
  try {
    const pool = await ensureSchema();
    if (pool) {
      const r = await pool.query<{ impressions: string }>(
        `UPDATE udb_counters SET impressions = impressions + 1 WHERE id = 1 RETURNING impressions`,
      );
      return Math.max(1, Number(r.rows[0]?.impressions) || 1);
    }
  } catch (e) {
    console.error('[udbStats] recordUdbImpression postgres failed', e);
  }

  return incrementFileImpression();
}

export async function getUdbStats(): Promise<{
  impressions: number;
  people: number;
  day: number;
}> {
  let impressions = 0;
  let launchAt = launchDate();
  let usedPostgres = false;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const r = await pool.query<{ impressions: string; launch_at: Date }>(
        `SELECT impressions, launch_at FROM udb_counters WHERE id = 1`,
      );
      if (r.rows[0]) {
        impressions = Number(r.rows[0].impressions) || 0;
        launchAt = r.rows[0].launch_at ?? launchAt;
        usedPostgres = true;
      }
    }
  } catch (e) {
    console.error('[udbStats] getUdbStats postgres failed', e);
  }

  if (!usedPostgres) {
    const file = readFileCounters();
    impressions = file.impressions;
    launchAt = new Date(file.launchAt);
  }

  const peopleResult = await clerkGetUserCount();
  const people = peopleResult.ok ? peopleResult.count : 0;

  return {
    impressions: Math.max(impressions, 1),
    people: Math.max(people, 1),
    day: daysSinceLaunch(launchAt),
  };
}
