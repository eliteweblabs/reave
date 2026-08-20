/**
 * Runtime feature overrides — deployment owner toggles from Add-ons (Postgres).
 * Merged over install config `features[]` in enabledFeatures().
 */
import { getPgPool } from './pgPool';
import type { FeatureId } from './featureCatalog';
import { FEATURE_ID_SET } from './featureCatalog';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS feature_overrides (
  feature   TEXT PRIMARY KEY,
  enabled   BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let _schemaReady: Promise<void> | null = null;
let _cache: Map<FeatureId, boolean> | null = null;
let _loadPromise: Promise<Map<FeatureId, boolean>> | null = null;

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

export function featureOverrideCache(): ReadonlyMap<FeatureId, boolean> {
  return _cache ?? new Map();
}

export async function loadFeatureOverrides(): Promise<Map<FeatureId, boolean>> {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const pool = await ensureSchema();
    const map = new Map<FeatureId, boolean>();
    if (pool) {
      const { rows } = await pool.query<{ feature: string; enabled: boolean }>(
        'SELECT feature, enabled FROM feature_overrides',
      );
      for (const row of rows) {
        if (FEATURE_ID_SET.has(row.feature)) {
          map.set(row.feature as FeatureId, row.enabled);
        }
      }
    }
    _cache = map;
    return map;
  })();

  try {
    return await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

export async function setFeatureOverride(
  feature: FeatureId,
  enabled: boolean,
): Promise<Map<FeatureId, boolean>> {
  const pool = await ensureSchema();
  if (pool) {
    await pool.query(
      `INSERT INTO feature_overrides (feature, enabled, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (feature) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [feature, enabled],
    );
  }
  if (!_cache) _cache = new Map();
  _cache.set(feature, enabled);
  return _cache;
}

export async function clearFeatureOverride(feature: FeatureId): Promise<void> {
  const pool = await ensureSchema();
  if (pool) {
    await pool.query('DELETE FROM feature_overrides WHERE feature = $1', [feature]);
  }
  _cache?.delete(feature);
}

export function resetFeatureOverrideCache(): void {
  _cache = null;
  _loadPromise = null;
}
