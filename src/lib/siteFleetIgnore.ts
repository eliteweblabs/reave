/**
 * Sites fleet ignore — legal hold / do-not-touch flags for dashboard tiles.
 * Persisted in Postgres (or JSON fallback); merged with optional install seeds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getInstallConfigSync } from './installConfig';
import { getPgPool } from './pgPool';
import { hostnameFromWebsite } from './plausibleClient';
import { normalizeMonitorHost } from './publicUrl';
import type { SiteHealthFleet } from './siteHealthScore';

export type SiteFleetIgnoreEntry = {
  siteId: string;
  reason: string;
  ignoredAt: number;
};

export type SiteFleetIgnoreState = {
  updatedAt: number;
  sites: Record<string, SiteFleetIgnoreEntry>;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS site_fleet_ignore (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sites      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO site_fleet_ignore (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'site-fleet-ignore.json');

let _schemaReady: Promise<void> | null = null;
let _cache: { at: number; state: SiteFleetIgnoreState } | null = null;
const CACHE_MS = 5000;

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

export function normalizeSiteFleetIgnoreSiteId(raw: string): string {
  return (
    hostnameFromWebsite(raw) ||
    normalizeMonitorHost(raw) ||
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '')
  );
}

function normalizeEntry(raw: unknown, siteId: string): SiteFleetIgnoreEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ignoredAt =
    typeof o.ignoredAt === 'number' && Number.isFinite(o.ignoredAt)
      ? o.ignoredAt
      : Date.now();
  const reason = typeof o.reason === 'string' ? o.reason.trim().slice(0, 240) : '';
  return { siteId, reason, ignoredAt };
}

function normalizeState(raw: unknown): SiteFleetIgnoreState {
  const sites: Record<string, SiteFleetIgnoreEntry> = {};
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const sitesRaw = o.sites;
    if (sitesRaw && typeof sitesRaw === 'object' && !Array.isArray(sitesRaw)) {
      for (const [key, value] of Object.entries(sitesRaw as Record<string, unknown>)) {
        const siteId = normalizeSiteFleetIgnoreSiteId(key);
        if (!siteId) continue;
        const entry = normalizeEntry(value, siteId);
        if (entry) sites[siteId] = entry;
      }
    }
  }
  const updatedAt =
    raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).updatedAt === 'number'
      ? Number((raw as Record<string, unknown>).updatedAt)
      : Date.now();
  return { updatedAt, sites };
}

function installSeeds(): SiteFleetIgnoreEntry[] {
  const config = getInstallConfigSync() as InstallConfigWithSeeds;
  const seeds = config.siteFleetIgnoreSeeds;
  if (!Array.isArray(seeds)) return [];
  const out: SiteFleetIgnoreEntry[] = [];
  for (const row of seeds) {
    if (!row || typeof row !== 'object') continue;
    const siteId = normalizeSiteFleetIgnoreSiteId(String((row as { siteId?: string }).siteId || ''));
    if (!siteId) continue;
    const reason =
      typeof (row as { reason?: string }).reason === 'string'
        ? (row as { reason: string }).reason.trim().slice(0, 240)
        : '';
    out.push({ siteId, reason, ignoredAt: Date.now() });
  }
  return out;
}

type InstallConfigWithSeeds = {
  siteFleetIgnoreSeeds?: Array<{ siteId: string; reason?: string }>;
};

function mergeInstallSeeds(state: SiteFleetIgnoreState): SiteFleetIgnoreState {
  const seeds = installSeeds();
  if (!seeds.length) return state;
  const sites = { ...state.sites };
  let changed = false;
  for (const seed of seeds) {
    if (sites[seed.siteId]) continue;
    sites[seed.siteId] = seed;
    changed = true;
  }
  if (!changed) return state;
  return { ...state, sites, updatedAt: Date.now() };
}

function readFileState(): SiteFleetIgnoreState {
  try {
    if (!existsSync(FILE_PATH)) return normalizeState(null);
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8')) as { sites?: unknown; updatedAt?: number };
    return normalizeState(parsed);
  } catch (e) {
    console.warn('[site-fleet-ignore] file read failed', e);
    return normalizeState(null);
  }
}

function writeFileState(state: SiteFleetIgnoreState): boolean {
  try {
    mkdirSync(dirname(FILE_PATH), { recursive: true });
    writeFileSync(
      FILE_PATH,
      `${JSON.stringify({ updatedAt: state.updatedAt, sites: state.sites }, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch (e) {
    console.error('[site-fleet-ignore] file write failed', e);
    return false;
  }
}

async function readPgState(): Promise<SiteFleetIgnoreState | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query(`SELECT sites, updated_at FROM site_fleet_ignore WHERE id = 1`);
    const row = rows[0] as { sites?: unknown; updated_at?: Date | string } | undefined;
    if (!row) return null;
    const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
    return normalizeState({ sites: row.sites, updatedAt });
  } catch (e) {
    console.error('[site-fleet-ignore] pg read failed', e);
    return null;
  }
}

async function writePgState(state: SiteFleetIgnoreState): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO site_fleet_ignore (id, sites, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         sites = EXCLUDED.sites,
         updated_at = now()`,
      [JSON.stringify(state.sites)],
    );
    return true;
  } catch (e) {
    console.error('[site-fleet-ignore] pg write failed', e);
    return false;
  }
}

export function invalidateSiteFleetIgnoreCache(): void {
  _cache = null;
}

export async function loadSiteFleetIgnoreState(): Promise<SiteFleetIgnoreState> {
  const now = Date.now();
  if (_cache && now - _cache.at < CACHE_MS) return _cache.state;

  const fromPg = getPgPool() ? await readPgState() : null;
  let state = mergeInstallSeeds(fromPg ?? readFileState());

  if (fromPg && installSeeds().some((seed) => !fromPg.sites[seed.siteId])) {
    const ok = getPgPool() ? await writePgState(state) : writeFileState(state);
    if (ok) invalidateSiteFleetIgnoreCache();
  }

  _cache = { at: now, state };
  return state;
}

export function isSiteFleetIgnored(
  state: SiteFleetIgnoreState | null | undefined,
  siteId: string,
): boolean {
  const id = normalizeSiteFleetIgnoreSiteId(siteId);
  return Boolean(id && state?.sites?.[id]);
}

export function effectiveSiteHealthCriticalCount(
  fleet: SiteHealthFleet | null | undefined,
  ignore: SiteFleetIgnoreState | null | undefined,
): number {
  if (!fleet?.sites) return 0;
  return Object.entries(fleet.sites).filter(
    ([siteId, row]) => row && row.criticalCount > 0 && !isSiteFleetIgnored(ignore, siteId),
  ).length;
}

export function annotateSiteHealthFleet(
  fleet: SiteHealthFleet | null | undefined,
  ignore: SiteFleetIgnoreState | null | undefined,
): SiteHealthFleet | null {
  if (!fleet) return null;
  const sites = Object.fromEntries(
    Object.entries(fleet.sites).map(([siteId, row]) => {
      const ignored = isSiteFleetIgnored(ignore, siteId);
      return [
        siteId,
        {
          ...row,
          ignored,
          ignoreReason: ignored ? ignore?.sites?.[siteId]?.reason || '' : undefined,
        },
      ];
    }),
  );
  return {
    ...fleet,
    sites,
    criticalSites: effectiveSiteHealthCriticalCount(fleet, ignore),
    ignoredSites: Object.keys(ignore?.sites || {}).length,
  };
}

export async function setSiteFleetIgnored(input: {
  siteId: string;
  ignored: boolean;
  reason?: string;
}): Promise<SiteFleetIgnoreState | null> {
  const siteId = normalizeSiteFleetIgnoreSiteId(input.siteId);
  if (!siteId) return null;

  const cur = await loadSiteFleetIgnoreState();
  const sites = { ...cur.sites };
  if (input.ignored) {
    sites[siteId] = {
      siteId,
      reason: typeof input.reason === 'string' ? input.reason.trim().slice(0, 240) : sites[siteId]?.reason || '',
      ignoredAt: Date.now(),
    };
  } else {
    delete sites[siteId];
  }

  const next: SiteFleetIgnoreState = { sites, updatedAt: Date.now() };
  const ok = getPgPool() ? await writePgState(next) : writeFileState(next);
  if (!ok) return null;
  invalidateSiteFleetIgnoreCache();
  return next;
}
