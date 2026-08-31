/**
 * Module audience map from Reave management → satellite installs.
 *
 * On reave.app the catalog overlay is the source of truth.
 * Clients pull GET /api/hub/module-audience with the punchlist hub key
 * and cache it locally (Postgres / JSON).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  audienceAllowsStaff,
  defaultModuleAudience,
  normalizeModuleAudience,
  type ModuleAudience,
} from './moduleAudience';
import { ensureModuleCatalogLoaded, getModuleCatalogSync, peekCatalogRow } from './moduleCatalogStore';
import {
  isCanonicalReaveInstall,
} from './installConfig';
import {
  DEFAULT_REAVE_HUB_URL,
  punchlistHubOutboundKey,
  punchlistHubUrl,
} from './punchlistHub';
import { databaseUrl, getPgPool } from './pgPool';
import { projectRoot } from './projectRoot';
import { serverEnv } from './serverEnv';

export type ModuleAudienceMap = Record<string, ModuleAudience>;

type AudiencePayload = {
  audience: ModuleAudienceMap;
  updatedAt: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS module_audience_cache (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let _schemaReady: Promise<void> | null = null;
let _cache: AudiencePayload | null = null;
let _load: Promise<AudiencePayload> | null = null;
let _hubPullAt = 0;
const HUB_PULL_TTL_MS = 5 * 60 * 1000;

function audienceFilePath(): string {
  const override = serverEnv('MODULE_AUDIENCE_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'module-audience.json');
}

function normalizeAudienceMap(raw: unknown): ModuleAudienceMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: ModuleAudienceMap = {};
  for (const [feature, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = String(feature || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    if (!slug) continue;
    out[slug] = normalizeModuleAudience(value, 'both');
  }
  return out;
}

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

function readFilePayload(): AudiencePayload {
  try {
    const path = audienceFilePath();
    if (!existsSync(path)) return { audience: {}, updatedAt: null };
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      audience?: unknown;
      updatedAt?: string | null;
    };
    return {
      audience: normalizeAudienceMap(parsed.audience),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch (e) {
    console.error('[module-audience] file read failed', e);
    return { audience: {}, updatedAt: null };
  }
}

function writeFilePayload(payload: AudiencePayload): void {
  const path = audienceFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

async function loadLocalPayload(): Promise<AudiencePayload> {
  if (_cache) return _cache;
  if (_load) return _load;
  _load = (async () => {
    const pool = await ensureSchema();
    if (pool) {
      const res = await pool.query(`SELECT payload, updated_at FROM module_audience_cache WHERE id = 1`);
      const row = res.rows[0] as { payload?: unknown; updated_at?: Date } | undefined;
      if (row?.payload && typeof row.payload === 'object') {
        const p = row.payload as { audience?: unknown; updatedAt?: string | null };
        _cache = {
          audience: normalizeAudienceMap(p.audience ?? row.payload),
          updatedAt:
            typeof p.updatedAt === 'string'
              ? p.updatedAt
              : row.updated_at instanceof Date
                ? row.updated_at.toISOString()
                : null,
        };
        return _cache;
      }
    }
    _cache = readFilePayload();
    return _cache;
  })().finally(() => {
    _load = null;
  });
  return _load;
}

async function saveLocalPayload(payload: AudiencePayload): Promise<void> {
  _cache = payload;
  const pool = await ensureSchema();
  if (pool) {
    await pool.query(
      `INSERT INTO module_audience_cache (id, payload, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify(payload)],
    );
    return;
  }
  if (databaseUrl()) return;
  writeFilePayload(payload);
}

/** Build audience map from the local (Reave) module catalog. */
export async function audienceMapFromCatalog(): Promise<AudiencePayload> {
  await ensureModuleCatalogLoaded();
  const audience: ModuleAudienceMap = {};
  for (const row of getModuleCatalogSync()) {
    audience[row.feature] = normalizeModuleAudience(
      row.audience,
      defaultModuleAudience({
        feature: row.feature,
        visibility: row.visibility,
        kind: row.kind,
        group: row.group,
      }),
    );
  }
  return { audience, updatedAt: new Date().toISOString() };
}

async function pullHubAudience(): Promise<AudiencePayload | null> {
  if (isCanonicalReaveInstall()) return null;
  const key = punchlistHubOutboundKey();
  if (!key) return null;
  const now = Date.now();
  if (_hubPullAt && now - _hubPullAt < HUB_PULL_TTL_MS && _cache) return _cache;
  const base = punchlistHubUrl() || DEFAULT_REAVE_HUB_URL;
  const slug =
    (serverEnv('INSTALL_SLUG') || serverEnv('COMPANY_DOMAIN') || 'install').trim() || 'install';
  try {
    const res = await fetch(`${base}/api/hub/module-audience`, {
      headers: {
        'X-Install-Slug': slug,
        'X-Install-Key': key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      audience?: unknown;
      updatedAt?: string | null;
    };
    if (!json.ok) return null;
    const payload: AudiencePayload = {
      audience: normalizeAudienceMap(json.audience),
      updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : null,
    };
    await saveLocalPayload(payload);
    _hubPullAt = now;
    return payload;
  } catch (e) {
    console.error('[module-audience] hub pull failed', e);
    return null;
  }
}

export async function ensureModuleAudienceLoaded(): Promise<void> {
  if (isCanonicalReaveInstall()) {
    _cache = await audienceMapFromCatalog();
    return;
  }
  await loadLocalPayload();
  void pullHubAudience();
}

export function peekModuleAudience(feature: string): ModuleAudience {
  const slug = String(feature || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const fromCache = _cache?.audience?.[slug];
  if (fromCache) return fromCache;
  const row = peekCatalogRow(slug);
  if (row?.audience) return row.audience;
  return defaultModuleAudience({
    feature: slug,
    visibility: row?.visibility,
    kind: row?.kind,
    group: row?.group,
  });
}

export function staffMayUseFeature(feature: string): boolean {
  return audienceAllowsStaff(peekModuleAudience(feature));
}

export async function getModuleAudienceMap(): Promise<ModuleAudienceMap> {
  await ensureModuleAudienceLoaded();
  if (isCanonicalReaveInstall()) {
    return (await audienceMapFromCatalog()).audience;
  }
  const local = await loadLocalPayload();
  if (Object.keys(local.audience).length) return local.audience;
  const pulled = await pullHubAudience();
  return pulled?.audience ?? {};
}

export function clearModuleAudienceCache(): void {
  _cache = null;
  _hubPullAt = 0;
}
