/**
 * Persisted hosted analytics fleet (Railway + Kinsta apex list) — survives deploys.
 * Metrics may be empty; the site list is what dashboard tiles need on first paint.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import type { AnalyticsFleetPreview } from './analyticsSiteMerge';
import { getPgPool } from './pgPool';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hosted_fleet_preview (
  id       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  preview  JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO hosted_fleet_preview (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'hosted-fleet-preview.json');

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

function normalizePreview(raw: unknown): AnalyticsFleetPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const sitesRaw = o.sites;
  if (!Array.isArray(sitesRaw)) return null;
  const rangeDays = o.rangeDays === 7 || o.rangeDays === 90 ? o.rangeDays : 30;
  const siteCount =
    typeof o.siteCount === 'number' && Number.isFinite(o.siteCount)
      ? o.siteCount
      : sitesRaw.length;
  return {
    configured: typeof o.configured === 'boolean' ? o.configured : true,
    rangeDays,
    siteCount,
    registeredCount:
      typeof o.registeredCount === 'number' && Number.isFinite(o.registeredCount)
        ? o.registeredCount
        : 0,
    unregisteredCount:
      typeof o.unregisteredCount === 'number' && Number.isFinite(o.unregisteredCount)
        ? o.unregisteredCount
        : siteCount,
    visitors: typeof o.visitors === 'number' && Number.isFinite(o.visitors) ? o.visitors : 0,
    pageviews: typeof o.pageviews === 'number' && Number.isFinite(o.pageviews) ? o.pageviews : 0,
    realtimeVisitors:
      typeof o.realtimeVisitors === 'number' && Number.isFinite(o.realtimeVisitors)
        ? o.realtimeVisitors
        : 0,
    sites: sitesRaw as AnalyticsFleetPreview['sites'],
  };
}

function readFilePreview(): AnalyticsFleetPreview | null {
  try {
    if (!existsSync(FILE_PATH)) return null;
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8')) as { preview?: unknown };
    return normalizePreview(parsed?.preview);
  } catch (e) {
    console.warn('[hosted-fleet-store] file read failed', e);
    return null;
  }
}

function writeFilePreview(preview: AnalyticsFleetPreview): boolean {
  try {
    mkdirSync(dirname(FILE_PATH), { recursive: true });
    writeFileSync(
      FILE_PATH,
      `${JSON.stringify({ savedAt: new Date().toISOString(), preview }, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch (e) {
    console.error('[hosted-fleet-store] file write failed', e);
    return false;
  }
}

async function readPgPreview(): Promise<AnalyticsFleetPreview | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query(`SELECT preview FROM hosted_fleet_preview WHERE id = 1`);
    const row = rows[0] as { preview?: unknown } | undefined;
    if (!row?.preview) return null;
    return normalizePreview(row.preview);
  } catch (e) {
    console.error('[hosted-fleet-store] pg read failed', e);
    return null;
  }
}

async function writePgPreview(preview: AnalyticsFleetPreview): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO hosted_fleet_preview (id, preview, saved_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         preview = EXCLUDED.preview,
         saved_at = now()`,
      [JSON.stringify(preview)],
    );
    return true;
  } catch (e) {
    console.error('[hosted-fleet-store] pg write failed', e);
    return false;
  }
}

export async function loadPersistedHostedFleetPreview(): Promise<AnalyticsFleetPreview | null> {
  const fromPg = getPgPool() ? await readPgPreview() : null;
  return fromPg ?? readFilePreview();
}

export async function savePersistedHostedFleetPreview(preview: AnalyticsFleetPreview): Promise<void> {
  const normalized = normalizePreview(preview);
  if (!normalized || normalized.sites.length === 0) return;
  const ok = getPgPool()
    ? await writePgPreview(normalized)
    : writeFilePreview(normalized);
  if (!ok) {
    console.warn('[hosted-fleet-store] persist failed');
  }
}
