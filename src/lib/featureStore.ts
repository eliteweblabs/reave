/**
 * Persist enabled feature modules (admin plugin toggles).
 * Postgres when DATABASE_URL is set, otherwise src/knowledge/features.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { FEATURE_IDS, type FeatureId } from './features';
import { serverEnv } from './serverEnv';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS feature_config (
  id        INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO feature_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _cached: FeatureId[] | null | undefined = undefined;

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

function featuresFilePath(): string {
  const override = serverEnv('FEATURES_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'features.json');
}

function normalizeIds(raw: unknown): FeatureId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(FEATURE_IDS);
  const out: FeatureId[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (allowed.has(id)) out.push(id as FeatureId);
  }
  return out;
}

function readFileFeatures(): FeatureId[] | null {
  try {
    const path = featuresFilePath();
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeIds((parsed as { enabled?: unknown }).enabled);
  } catch {
    return null;
  }
}

/** Sync read for bootstrapping hasFeature() before async load completes. */
export function readStoredFeaturesSync(): FeatureId[] | null {
  return readFileFeatures();
}

function writeFileFeatures(enabled: FeatureId[]): boolean {
  try {
    const path = featuresFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ enabled, updatedAt: new Date().toISOString() }, null, 2) + '\n',
      'utf8',
    );
    return true;
  } catch (e) {
    console.error('[features] file write failed', e);
    return false;
  }
}

async function readPgFeatures(): Promise<FeatureId[] | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const res = await pool.query<{ enabled: unknown }>(
    'SELECT enabled FROM feature_config WHERE id = 1 LIMIT 1',
  );
  const row = res.rows[0];
  if (!row) return null;
  return normalizeIds(row.enabled);
}

async function writePgFeatures(enabled: FeatureId[]): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
    `UPDATE feature_config SET enabled = $1::jsonb, updated_at = now() WHERE id = 1`,
    [JSON.stringify(enabled)],
  );
  return true;
}

export function featureStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export async function getStoredFeatures(): Promise<FeatureId[] | null> {
  if (_cached !== undefined) return _cached;
  try {
    if (featureStorageBackend() === 'postgres') {
      _cached = await readPgFeatures();
    } else {
      _cached = readFileFeatures();
    }
  } catch (e) {
    console.error('[features] read failed', e);
    _cached = null;
  }
  return _cached;
}

export async function setStoredFeatures(enabled: FeatureId[]): Promise<boolean> {
  const normalized = normalizeIds(enabled);
  try {
    const ok =
      featureStorageBackend() === 'postgres'
        ? await writePgFeatures(normalized)
        : writeFileFeatures(normalized);
    if (ok) _cached = normalized;
    return ok;
  } catch (e) {
    console.error('[features] write failed', e);
    return false;
  }
}

export function clearStoredFeaturesCache(): void {
  _cached = undefined;
}
