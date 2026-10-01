/**
 * Persisted /card demo portfolio (Railway preview URLs) — survives deploys and cold starts.
 * Postgres (DATABASE_URL) when set; otherwise JSON under src/knowledge/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import type { CardDemoSite } from './cardDemoSites';
import { getPgPool } from './pgPool';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS card_demo_sites_cache (
  id       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sites    JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO card_demo_sites_cache (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'card-demo-sites-cache.json');

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

function normalizeSites(raw: unknown): CardDemoSite[] | null {
  if (!Array.isArray(raw)) return null;
  const sites: CardDemoSite[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!name || !url) continue;
    sites.push({
      name,
      url,
      category: typeof o.category === 'string' ? o.category : 'Preview · Railway',
      emoji: typeof o.emoji === 'string' ? o.emoji : '🌐',
    });
  }
  return sites.length ? sites : null;
}

export type PersistedCardDemoSitesSnapshot = {
  sites: CardDemoSite[];
  savedAtMs: number;
};

function parseSavedAtMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}

function readFileSnapshot(): PersistedCardDemoSitesSnapshot | null {
  try {
    if (!existsSync(FILE_PATH)) return null;
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8')) as {
      sites?: unknown;
      savedAt?: unknown;
    };
    const sites = normalizeSites(parsed?.sites);
    if (!sites) return null;
    return { sites, savedAtMs: parseSavedAtMs(parsed?.savedAt) };
  } catch (e) {
    console.warn('[card-demo-sites-store] file read failed', e);
    return null;
  }
}

function writeFileSnapshot(sites: CardDemoSite[]): boolean {
  try {
    mkdirSync(dirname(FILE_PATH), { recursive: true });
    writeFileSync(
      FILE_PATH,
      `${JSON.stringify({ savedAt: new Date().toISOString(), sites }, null, 2)}\n`,
      'utf8',
    );
    return true;
  } catch (e) {
    console.error('[card-demo-sites-store] file write failed', e);
    return false;
  }
}

async function readPgSnapshot(): Promise<PersistedCardDemoSitesSnapshot | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query(
      `SELECT sites, EXTRACT(EPOCH FROM saved_at) * 1000 AS saved_at_ms FROM card_demo_sites_cache WHERE id = 1`,
    );
    const row = rows[0] as { sites?: unknown; saved_at_ms?: unknown } | undefined;
    const sites = normalizeSites(row?.sites);
    if (!sites) return null;
    const savedAtMs =
      typeof row?.saved_at_ms === 'number' && Number.isFinite(row.saved_at_ms)
        ? row.saved_at_ms
        : parseSavedAtMs(row?.saved_at_ms);
    return { sites, savedAtMs };
  } catch (e) {
    console.error('[card-demo-sites-store] pg read failed', e);
    return null;
  }
}

async function writePgSnapshot(sites: CardDemoSite[]): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO card_demo_sites_cache (id, sites, saved_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         sites = EXCLUDED.sites,
         saved_at = now()`,
      [JSON.stringify(sites)],
    );
    return true;
  } catch (e) {
    console.error('[card-demo-sites-store] pg write failed', e);
    return false;
  }
}

export async function loadPersistedCardDemoSites(): Promise<PersistedCardDemoSitesSnapshot | null> {
  const fromPg = getPgPool() ? await readPgSnapshot() : null;
  return fromPg ?? readFileSnapshot();
}

export async function savePersistedCardDemoSites(sites: CardDemoSite[]): Promise<void> {
  const normalized = normalizeSites(sites);
  if (!normalized?.length) return;
  const ok = getPgPool() ? await writePgSnapshot(normalized) : writeFileSnapshot(normalized);
  if (!ok) console.warn('[card-demo-sites-store] persist failed');
}
