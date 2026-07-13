/**
 * Editable deck industry / category list.
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/data/.
 *
 * Used by `/deck?type=salon` presets (and admin Profile editor).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type DeckIndustry = {
  id: number;
  slug: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  updatedAt: string | null;
};

/** Seeded when the store is empty. */
export const DEFAULT_DECK_INDUSTRIES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'salon', label: 'Salon' },
  { slug: 'content', label: 'Content' },
  { slug: 'engineer', label: 'Engineer' },
  { slug: 'principal', label: 'Principal' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'real-estate', label: 'Real estate' },
];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deck_industries (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(64) NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deck_industries_sort ON deck_industries (sort_order, id);
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;

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

function industriesFilePath(): string {
  const override = serverEnv('DECK_INDUSTRIES_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'data', 'deck-industries.json');
}

export function deckIndustriesStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

/** slugify labels for new rows / imports */
export function slugifyIndustry(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function rowToIndustry(row: {
  id: number;
  slug: string;
  label: string;
  sort_order: number;
  enabled: boolean;
  updated_at: Date | string | null;
}): DeckIndustry {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function defaultsAsIndustries(): DeckIndustry[] {
  const now = new Date().toISOString();
  return DEFAULT_DECK_INDUSTRIES.map((d, i) => ({
    id: i + 1,
    slug: d.slug,
    label: d.label,
    sortOrder: i,
    enabled: true,
    updatedAt: now,
  }));
}

function normalizeFileList(raw: unknown): DeckIndustry[] {
  if (!Array.isArray(raw)) return defaultsAsIndustries();
  const out: DeckIndustry[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    let slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : '';
    if (!slug && label) slug = slugifyIndustry(label);
    if (!slug || !label) return;
    out.push({
      id: typeof o.id === 'number' && Number.isFinite(o.id) ? o.id : i + 1,
      slug,
      label,
      sortOrder:
        typeof o.sortOrder === 'number' && Number.isFinite(o.sortOrder)
          ? o.sortOrder
          : i,
      enabled: o.enabled === false ? false : true,
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null,
    });
  });
  return out.length ? out.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) : defaultsAsIndustries();
}

function readFileIndustries(): DeckIndustry[] {
  try {
    const path = industriesFilePath();
    if (!existsSync(path)) {
      const seeded = defaultsAsIndustries();
      writeFileIndustries(seeded);
      return seeded;
    }
    return normalizeFileList(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    console.error('[deck-industries] file read failed', e);
    return defaultsAsIndustries();
  }
}

function writeFileIndustries(list: DeckIndustry[]): boolean {
  try {
    const path = industriesFilePath();
    mkdirSync(dirname(path), { recursive: true });
    const payload = list.map((item, i) => ({
      id: item.id,
      slug: item.slug,
      label: item.label,
      sortOrder: item.sortOrder ?? i,
      enabled: item.enabled !== false,
      updatedAt: new Date().toISOString(),
    }));
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[deck-industries] file write failed', e);
    return false;
  }
}

async function seedPgIfEmpty(pool: pg.Pool): Promise<void> {
  const count = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM deck_industries`,
  );
  if (Number(count.rows[0]?.n ?? 0) > 0) return;
  for (let i = 0; i < DEFAULT_DECK_INDUSTRIES.length; i++) {
    const d = DEFAULT_DECK_INDUSTRIES[i]!;
    await pool.query(
      `INSERT INTO deck_industries (slug, label, sort_order, enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (slug) DO NOTHING`,
      [d.slug, d.label, i],
    );
  }
}

async function readPgIndustries(): Promise<DeckIndustry[]> {
  const pool = await ensureSchema();
  if (!pool) return defaultsAsIndustries();
  await seedPgIfEmpty(pool);
  const res = await pool.query<{
    id: number;
    slug: string;
    label: string;
    sort_order: number;
    enabled: boolean;
    updated_at: Date | string | null;
  }>(
    `SELECT id, slug, label, sort_order, enabled, updated_at
     FROM deck_industries
     ORDER BY sort_order ASC, id ASC`,
  );
  return res.rows.map(rowToIndustry);
}

export type DeckIndustryInput = {
  id?: number;
  slug?: string;
  label: string;
  sortOrder?: number;
  enabled?: boolean;
};

function normalizeInputList(raw: DeckIndustryInput[]): DeckIndustryInput[] {
  const seen = new Set<string>();
  const out: DeckIndustryInput[] = [];
  raw.forEach((item, i) => {
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) return;
    let slug =
      typeof item.slug === 'string' && item.slug.trim()
        ? slugifyIndustry(item.slug)
        : slugifyIndustry(label);
    if (!slug) return;
    // Deduplicate slugs by appending -2, -3…
    let candidate = slug;
    let n = 2;
    while (seen.has(candidate)) {
      candidate = `${slug.slice(0, 60)}-${n}`;
      n += 1;
    }
    seen.add(candidate);
    out.push({
      id: typeof item.id === 'number' ? item.id : undefined,
      slug: candidate,
      label,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : i,
      enabled: item.enabled === false ? false : true,
    });
  });
  return out;
}

async function replacePgIndustries(inputs: DeckIndustryInput[]): Promise<DeckIndustry[]> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('Postgres not configured');
  const list = normalizeInputList(inputs);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM deck_industries`);
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!;
      await client.query(
        `INSERT INTO deck_industries (slug, label, sort_order, enabled, updated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [item.slug, item.label, item.sortOrder ?? i, item.enabled !== false],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return readPgIndustries();
}

/** List all industries (including disabled), ordered. Seeds defaults when empty. */
export async function listDeckIndustries(): Promise<DeckIndustry[]> {
  try {
    if (deckIndustriesStorageBackend() === 'postgres') {
      return await readPgIndustries();
    }
    return readFileIndustries();
  } catch (e) {
    console.error('[deck-industries] list failed', e);
    return defaultsAsIndustries();
  }
}

/** Enabled industries only — for public deck `?type=` resolution. */
export async function listEnabledDeckIndustries(): Promise<DeckIndustry[]> {
  const all = await listDeckIndustries();
  return all.filter((i) => i.enabled);
}

export async function getDeckIndustryBySlug(
  slug: string,
): Promise<DeckIndustry | null> {
  const needle = slugifyIndustry(slug);
  if (!needle) return null;
  const all = await listDeckIndustries();
  return all.find((i) => i.slug === needle) ?? null;
}

/** Replace the full list (admin editor save). */
export async function replaceDeckIndustries(
  inputs: DeckIndustryInput[],
): Promise<{ ok: true; industries: DeckIndustry[] } | { ok: false; error: string }> {
  const list = normalizeInputList(inputs);
  if (!list.length) {
    return { ok: false, error: 'At least one industry is required' };
  }
  try {
    if (deckIndustriesStorageBackend() === 'postgres') {
      const industries = await replacePgIndustries(list);
      return { ok: true, industries };
    }
    const industries: DeckIndustry[] = list.map((item, i) => ({
      id: i + 1,
      slug: item.slug!,
      label: item.label,
      sortOrder: item.sortOrder ?? i,
      enabled: item.enabled !== false,
      updatedAt: new Date().toISOString(),
    }));
    if (!writeFileIndustries(industries)) {
      return { ok: false, error: 'Failed to save industries file' };
    }
    return { ok: true, industries };
  } catch (e) {
    console.error('[deck-industries] replace failed', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to save industries',
    };
  }
}
