/**
 * Persisted Sites fleet health grades — survives deploys and page reloads.
 * Postgres (DATABASE_URL) when set; otherwise JSON under src/knowledge/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getPgPool } from './pgPool';
import type { SiteHealthFleet } from './siteHealthScore';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS site_health_fleet (
  id       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fleet    JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO site_health_fleet (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'site-health-fleet.json');

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

function normalizeFleet(raw: unknown): SiteHealthFleet | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const checkedAt = typeof o.checkedAt === 'number' ? o.checkedAt : Number(o.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) return null;
  const sitesRaw = o.sites;
  if (!sitesRaw || typeof sitesRaw !== 'object' || Array.isArray(sitesRaw)) return null;
  const sites = sitesRaw as SiteHealthFleet['sites'];
  const siteCount =
    typeof o.siteCount === 'number' && Number.isFinite(o.siteCount)
      ? o.siteCount
      : Object.keys(sites).length;
  const criticalSites =
    typeof o.criticalSites === 'number' && Number.isFinite(o.criticalSites)
      ? o.criticalSites
      : Object.values(sites).filter((row) => row && row.criticalCount > 0).length;
  const googleConnected =
    typeof o.googleConnected === 'boolean' ? o.googleConnected : null;
  return {
    checkedAt,
    googleConnected,
    siteCount,
    criticalSites,
    sites,
  };
}

function readFileFleet(): SiteHealthFleet | null {
  try {
    if (!existsSync(FILE_PATH)) return null;
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8')) as { fleet?: unknown };
    return normalizeFleet(parsed?.fleet);
  } catch (e) {
    console.warn('[site-health-store] file read failed', e);
    return null;
  }
}

function writeFileFleet(fleet: SiteHealthFleet): boolean {
  try {
    mkdirSync(dirname(FILE_PATH), { recursive: true });
    writeFileSync(
      FILE_PATH,
      `${JSON.stringify({ savedAt: new Date().toISOString(), fleet }, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch (e) {
    console.error('[site-health-store] file write failed', e);
    return false;
  }
}

async function readPgFleet(): Promise<SiteHealthFleet | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query(`SELECT fleet FROM site_health_fleet WHERE id = 1`);
    const row = rows[0] as { fleet?: unknown } | undefined;
    if (!row?.fleet) return null;
    return normalizeFleet(row.fleet);
  } catch (e) {
    console.error('[site-health-store] pg read failed', e);
    return null;
  }
}

async function writePgFleet(fleet: SiteHealthFleet): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO site_health_fleet (id, fleet, saved_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         fleet = EXCLUDED.fleet,
         saved_at = now()`,
      [JSON.stringify(fleet)],
    );
    return true;
  } catch (e) {
    console.error('[site-health-store] pg write failed', e);
    return false;
  }
}

export async function loadPersistedSiteHealthFleet(): Promise<SiteHealthFleet | null> {
  const fromPg = getPgPool() ? await readPgFleet() : null;
  return fromPg ?? readFileFleet();
}

export async function savePersistedSiteHealthFleet(fleet: SiteHealthFleet): Promise<void> {
  const normalized = normalizeFleet(fleet);
  if (!normalized) return;
  const ok = getPgPool() ? await writePgFleet(normalized) : writeFileFleet(normalized);
  if (!ok) {
    console.warn('[site-health-store] persist failed');
  }
}

export async function clearPersistedSiteHealthFleet(): Promise<void> {
  try {
    const pool = getPgPool() ? await ensureSchema() : null;
    if (pool) {
      await pool.query(`UPDATE site_health_fleet SET fleet = '{}'::jsonb, saved_at = now() WHERE id = 1`);
    }
  } catch (e) {
    console.warn('[site-health-store] pg clear failed', e);
  }
  try {
    if (existsSync(FILE_PATH)) writeFileSync(FILE_PATH, '{}\n', 'utf8');
  } catch {
    /* optional file backend */
  }
}
