/**
 * Editable module catalog overlay.
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 *
 * TypeScript defaults stay in moduleCatalog.ts. Saved rows overlay labels,
 * blurbs, prices, sale-sheet flags, and groups. Custom rows are catalog-only
 * until they match a FeatureId.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import pg from 'pg';
import {
  aggregatedGoogleWorkspaceBlurb,
  FEATURE_ID_SET,
  FEATURE_MARKETING,
  featureRequirements,
  formatCatalogBlurb,
  formatCatalogTitle,
  isGoogleWorkspaceCapability,
  isHostingFeature,
  type FeatureId,
} from './featureCatalog';
import {
  CATALOG_GROUPS,
  canonicalRowId,
  defaultIndustriesForFeature,
  defaultModuleCatalog,
  isCatalogGroupId,
  slugifyCatalogFeature,
  type CatalogGroupId,
  type CatalogRow,
  type CatalogRowKind,
} from './moduleCatalog';
import { defaultModuleAudience, normalizeModuleAudience } from './moduleAudience';
import { databaseUrl, getPgPool } from './pgPool';
import { projectRoot } from './projectRoot';
import { serverEnv } from './serverEnv';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS module_catalog (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let _schemaReady: Promise<void> | null = null;
let _cache: CatalogRow[] | null = null;
let _load: Promise<CatalogRow[]> | null = null;

export type ModuleCatalogPayload = {
  rows: CatalogRow[];
  updatedAt: string | null;
};

function catalogFilePath(): string {
  const override = serverEnv('MODULE_CATALOG_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'module-catalog.json');
}

export function moduleCatalogStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

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

function parsePriceAmount(raw: unknown, priceLabel: string): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  const fromLabel = priceLabel.replace(/[^0-9.]/g, '');
  if (fromLabel && /included|internal/i.test(priceLabel) === false) {
    const n = Number(fromLabel);
    if (Number.isFinite(n)) return n;
  }
  if (/included|internal/i.test(priceLabel)) return null;
  return null;
}

function normalizeKind(raw: unknown): CatalogRowKind {
  if (raw === 'core' || raw === 'module' || raw === 'custom') return raw;
  return 'custom';
}

function parseIndustries(raw: unknown, feature: string): string[] {
  if (raw === undefined) return defaultIndustriesForFeature(feature);
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const slug = item
      .trim()
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function parseRequires(raw: unknown, feature: string): string[] {
  if (raw === undefined) {
    return FEATURE_ID_SET.has(feature) ? featureRequirements(feature as FeatureId) : [];
  }
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const slug = slugifyCatalogFeature(item);
    if (!slug || slug === feature || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function normalizeCatalogRows(raw: unknown): CatalogRow[] {
  if (!Array.isArray(raw)) return defaultModuleCatalog();
  const seen = new Set<string>();
  const out: CatalogRow[] = [];
  let droppedWorkspaceCaps = false;
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    if (!label) return;
    const feature =
      typeof o.feature === 'string' && o.feature.trim()
        ? slugifyCatalogFeature(o.feature)
        : slugifyCatalogFeature(label);
    if (!feature) return;
    // MX / SPF / DKIM / DMARC / domains live on google_workspace — not their own rows.
    if (isGoogleWorkspaceCapability(feature)) {
      droppedWorkspaceCaps = true;
      return;
    }
    const rawGroup = String(o.group || '')
      .trim()
      .replace(/^e-commerce$/, 'e_commerce')
      .replace(/^web-development$/, 'web_development');
    let group: CatalogGroupId = isCatalogGroupId(rawGroup) ? rawGroup : 'other';
    if (feature === 'google_workspace') group = 'google_workspace';
    if (isHostingFeature(feature)) group = 'hosting';
    if (feature === 'dscr_calculator') group = 'real_estate';
    const kind = normalizeKind(o.kind);
    let key = typeof o.key === 'string' && o.key.trim() ? o.key.trim().slice(0, 80) : `${kind}:${feature}`;
    if (kind === 'core') key = `core:${feature}`;
    if (kind === 'module') key = `module:${feature}`;
    if (seen.has(key)) key = `${key}:${i}`;
    seen.add(key);
    const priceLabel =
      typeof o.priceLabel === 'string' && o.priceLabel.trim()
        ? o.priceLabel.trim().slice(0, 32)
        : kind === 'core'
          ? 'Included'
          : group === 'internal'
            ? 'Internal'
            : 'Included';
    const priceAmount = parsePriceAmount(o.priceAmount, priceLabel);
    const visibility =
      feature === 'google_workspace' ||
      group === 'google_workspace' ||
      isHostingFeature(feature) ||
      group === 'hosting' ||
      o.visibility === 'service'
        ? ('service' as const)
        : o.visibility === 'private'
          ? ('private' as const)
          : ('public' as const);
    out.push({
      key,
      kind,
      group,
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 16) : '',
      feature,
      label: formatCatalogTitle(label).slice(0, 120),
      blurb: typeof o.blurb === 'string' ? formatCatalogBlurb(o.blurb.trim()).slice(0, 800) : '',
      priceAmount,
      priceLabel,
      saleSheet: o.saleSheet === true,
      grandOpening: o.grandOpening === true,
      visibility,
      audience: normalizeModuleAudience(
        o.audience,
        defaultModuleAudience({ feature, visibility, kind, group }),
      ),
      requires: parseRequires(o.requires, feature),
      industries: parseIndustries(o.industries, feature),
    });
  });
  const seenFeatures = new Set(out.map((row) => row.feature));
  const taken: string[] = out.map((row) => row.id).filter((id) => /^\d{3}$/.test(id));
  const workspace = out.find((row) => row.feature === 'google_workspace');
  const oldWorkspaceBlurb =
    'Gmail MX, SPF, DKIM, DMARC, and Workspace domain admin — point a client domain at Google mail without asking them to paste records.';
  if (workspace) {
    const caps = FEATURE_MARKETING.google_workspace ?? [];
    const hasAll = caps.every(
      (c) =>
        workspace.blurb.includes(c.label) &&
        (!c.blurb || workspace.blurb.includes(c.blurb.replace(/\.$/, '').slice(0, 24))),
    );
    if (
      !workspace.blurb.trim() ||
      workspace.blurb === oldWorkspaceBlurb ||
      workspace.blurb === formatCatalogBlurb(oldWorkspaceBlurb) ||
      (droppedWorkspaceCaps && !hasAll)
    ) {
      workspace.blurb = aggregatedGoogleWorkspaceBlurb();
    }
  }
  for (const row of defaultModuleCatalog()) {
    if (seen.has(row.key) || seenFeatures.has(row.feature)) continue;
    seen.add(row.key);
    seenFeatures.add(row.feature);
    const id = canonicalRowId(row, taken);
    taken.push(id);
    out.push({ ...row, id });
  }
  const assigned: string[] = [];
  for (const row of out) {
    row.id = canonicalRowId(row, assigned);
    assigned.push(row.id);
  }
  const groupRank = new Map(CATALOG_GROUPS.map((id, i) => [id, i]));
  return out.sort((a, b) => {
    const gr = (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99);
    if (gr) return gr;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
}

function readFileCatalog(): CatalogRow[] {
  try {
    const path = catalogFilePath();
    if (!existsSync(path)) return defaultModuleCatalog();
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { rows?: unknown };
    return normalizeCatalogRows(parsed.rows ?? parsed);
  } catch (e) {
    console.error('[module-catalog] file read failed', e);
    return defaultModuleCatalog();
  }
}

function writeFileCatalog(rows: CatalogRow[]): boolean {
  try {
    const path = catalogFilePath();
    mkdirSync(dirname(path), { recursive: true });
    const payload: ModuleCatalogPayload = {
      rows,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[module-catalog] file write failed', e);
    return false;
  }
}

async function readPgCatalog(): Promise<CatalogRow[]> {
  const pool = await ensureSchema();
  if (!pool) return defaultModuleCatalog();
  const res = await pool.query<{ payload: unknown }>(
    `SELECT payload FROM module_catalog WHERE id = 1`,
  );
  const payload = res.rows[0]?.payload;
  if (!payload || typeof payload !== 'object') return defaultModuleCatalog();
  const rows = (payload as { rows?: unknown }).rows;
  return normalizeCatalogRows(rows ?? payload);
}

async function writePgCatalog(rows: CatalogRow[]): Promise<CatalogRow[]> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('Postgres not configured');
  const payload = { rows, updatedAt: new Date().toISOString() };
  await pool.query(
    `INSERT INTO module_catalog (id, payload, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [JSON.stringify(payload)],
  );
  return rows;
}

async function loadCatalog(): Promise<CatalogRow[]> {
  try {
    if (moduleCatalogStorageBackend() === 'postgres') {
      return await readPgCatalog();
    }
    return readFileCatalog();
  } catch (e) {
    console.error('[module-catalog] load failed', e);
    return defaultModuleCatalog();
  }
}

/** Cached catalog, or TypeScript defaults before the first load. */
export function getModuleCatalogSync(): CatalogRow[] {
  return _cache ?? defaultModuleCatalog();
}

export function peekCatalogRow(feature: string): CatalogRow | undefined {
  const needle = feature.trim();
  if (!needle) return undefined;
  return getModuleCatalogSync().find((row) => row.feature === needle);
}

export async function ensureModuleCatalogLoaded(): Promise<CatalogRow[]> {
  if (_cache) return _cache;
  if (!_load) {
    _load = loadCatalog()
      .then((rows) => {
        _cache = rows;
        return rows;
      })
      .finally(() => {
        _load = null;
      });
  }
  return _load;
}

export async function listModuleCatalog(): Promise<CatalogRow[]> {
  const rows = await loadCatalog();
  _cache = rows;
  return rows;
}

export async function replaceModuleCatalog(
  raw: unknown,
): Promise<{ ok: true; rows: CatalogRow[] } | { ok: false; error: string }> {
  const rows = normalizeCatalogRows(raw);
  if (!rows.length) {
    return { ok: false, error: 'At least one catalog row is required' };
  }
  try {
    if (moduleCatalogStorageBackend() === 'postgres') {
      const saved = await writePgCatalog(rows);
      _cache = saved;
      return { ok: true, rows: saved };
    }
    if (!writeFileCatalog(rows)) {
      return { ok: false, error: 'Failed to save module catalog file' };
    }
    _cache = rows;
    return { ok: true, rows };
  } catch (e) {
    console.error('[module-catalog] replace failed', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to save module catalog',
    };
  }
}

export async function resetModuleCatalog(): Promise<{ ok: true; rows: CatalogRow[] } | { ok: false; error: string }> {
  return replaceModuleCatalog(defaultModuleCatalog());
}

export function clearModuleCatalogCache(): void {
  _cache = null;
}
