/**
 * External Plugin Registry
 *
 * Discovers and caches plugins registered via the REAVE_PLUGINS env var.
 * REAVE_PLUGINS is a comma-separated list of base URLs:
 *   REAVE_PLUGINS=https://ugc.reave.app,https://analytics.reave.app
 *
 * Each URL must serve a `reave-plugin.json` manifest at its root.
 * Manifests are fetched, validated, and persisted to Postgres so they
 * survive restarts without re-fetching on every request.
 *
 * The client fetches /api/admin/external-plugins at runtime to get the
 * active hook list for sidebar injection, nav footer, and profile fields.
 */

import pg from 'pg';
import { getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';

// ─── Manifest Types ──────────────────────────────────────────────────────────

export interface ExternalPluginSidebarHook {
  label: string;
  /** Lucide icon name, e.g. "share-2", "bar-chart", "image" */
  icon: string;
  /** Panel key used in admin-ui.js nav switching, e.g. "ugc" */
  panel: string;
  /** Full URL to the plugin's iframe/embed src */
  href: string;
  /** Plugin API endpoint returning { count: number, color?: string } */
  badgeEndpoint?: string;
}

export interface ExternalPluginNavFooterHook {
  label: string;
  panel: string;
  href: string;
  icon: string;
}

export interface ExternalPluginProfileField {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'url' | 'select';
  options?: string[]; // for type: select
  placeholder?: string;
}

export interface ExternalPluginProfileSection {
  section: string;
  title: string;
  fields: ExternalPluginProfileField[];
}

export interface ExternalPluginDashboardWidget {
  title: string;
  /** Plugin API endpoint returning widget HTML or JSON */
  endpoint: string;
  width: 'full' | 'half' | 'third';
}

export interface ExternalPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  baseUrl: string;
  hooks: {
    sidebar?: ExternalPluginSidebarHook[];
    nav_footer?: ExternalPluginNavFooterHook[];
    user_profile?: ExternalPluginProfileSection[];
    dashboard_widget?: ExternalPluginDashboardWidget;
  };
}

// ─── DB Schema ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS external_plugins (
  id          SERIAL PRIMARY KEY,
  plugin_id   VARCHAR(128) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  version     VARCHAR(64)  NOT NULL,
  description TEXT,
  base_url    VARCHAR(512) NOT NULL,
  manifest    JSONB        NOT NULL,
  enabled     BOOLEAN      DEFAULT true,
  last_seen   TIMESTAMPTZ  DEFAULT NOW(),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_external_plugins_plugin_id ON external_plugins(plugin_id);
CREATE INDEX IF NOT EXISTS idx_external_plugins_enabled   ON external_plugins(enabled);
`;

// ─── Pool ─────────────────────────────────────────────────────────────────────

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool.query(SCHEMA_SQL).then(() => undefined).catch((e) => {
      _schemaReady = null;
      throw e;
    });
  }
  await _schemaReady;
  return pool;
}

// ─── Env Parsing ─────────────────────────────────────────────────────────────

export function getExternalPluginUrls(): string[] {
  const raw = serverEnv('REAVE_PLUGINS')?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http'));
}

// ─── Manifest Fetch ───────────────────────────────────────────────────────────

async function fetchManifest(baseUrl: string): Promise<ExternalPluginManifest | null> {
  const url = baseUrl.replace(/\/$/, '') + '/reave-plugin.json';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[external-plugins] ${url} → ${res.status}`);
      return null;
    }
    const json = (await res.json()) as Partial<ExternalPluginManifest>;
    // Basic validation
    if (!json.id || !json.name || !json.hooks) {
      console.warn(`[external-plugins] ${url} manifest missing id/name/hooks`);
      return null;
    }
    return { ...json, baseUrl } as ExternalPluginManifest;
  } catch (e) {
    console.warn(`[external-plugins] fetch failed for ${url}:`, e);
    return null;
  }
}

// ─── DB CRUD ─────────────────────────────────────────────────────────────────

async function upsertPlugin(
  pool: pg.Pool,
  manifest: ExternalPluginManifest,
): Promise<void> {
  await pool.query(
    `INSERT INTO external_plugins (plugin_id, name, version, description, base_url, manifest, last_seen)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (plugin_id) DO UPDATE SET
       name        = EXCLUDED.name,
       version     = EXCLUDED.version,
       description = EXCLUDED.description,
       base_url    = EXCLUDED.base_url,
       manifest    = EXCLUDED.manifest,
       last_seen   = NOW()`,
    [
      manifest.id,
      manifest.name,
      manifest.version,
      manifest.description ?? null,
      manifest.baseUrl,
      JSON.stringify(manifest),
    ],
  );
}

export async function dbListExternalPlugins(): Promise<ExternalPluginManifest[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const { rows } = await pool.query<{ manifest: ExternalPluginManifest }>(
      `SELECT manifest FROM external_plugins WHERE enabled = true ORDER BY created_at ASC`,
    );
    return rows.map((r) => r.manifest);
  } catch (e) {
    console.error('[external-plugins] list error:', e);
    return [];
  }
}

// ─── Main Sync ────────────────────────────────────────────────────────────────

/** Fetch all REAVE_PLUGINS manifests and upsert into Postgres. */
export async function syncExternalPlugins(): Promise<{
  synced: string[];
  failed: string[];
}> {
  const urls = getExternalPluginUrls();
  const synced: string[] = [];
  const failed: string[] = [];

  if (urls.length === 0) return { synced, failed };

  const pool = await ensureSchema();
  if (!pool) {
    console.warn('[external-plugins] No DATABASE_URL — cannot persist manifests');
    return { synced, failed };
  }

  await Promise.all(
    urls.map(async (url) => {
      const manifest = await fetchManifest(url);
      if (!manifest) { failed.push(url); return; }
      try {
        await upsertPlugin(pool, manifest);
        synced.push(manifest.id);
      } catch (e) {
        console.error('[external-plugins] upsert failed:', e);
        failed.push(url);
      }
    }),
  );

  return { synced, failed };
}

// ─── In-memory cache (short TTL) ─────────────────────────────────────────────

let _cachedPlugins: ExternalPluginManifest[] | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function getActiveExternalPlugins(): Promise<ExternalPluginManifest[]> {
  const now = Date.now();
  if (_cachedPlugins && now < _cacheExpiry) return _cachedPlugins;

  // Try DB first
  const fromDb = await dbListExternalPlugins();
  if (fromDb.length > 0) {
    _cachedPlugins = fromDb;
    _cacheExpiry = now + CACHE_TTL_MS;
    return fromDb;
  }

  // No DB or empty — fetch live and cache in memory only
  const urls = getExternalPluginUrls();
  if (urls.length === 0) return [];

  const manifests = (
    await Promise.all(urls.map(fetchManifest))
  ).filter((m): m is ExternalPluginManifest => m !== null);

  _cachedPlugins = manifests;
  _cacheExpiry = now + CACHE_TTL_MS;
  return manifests;
}

export function invalidateExternalPluginCache(): void {
  _cachedPlugins = null;
  _cacheExpiry = 0;
}
