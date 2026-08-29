import { projectRoot } from './projectRoot';
/**
 * Editable deck industry / category list.
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 *
 * Used by `/deck?type=salon` presets, the demo loader, and deploy playbooks.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';
import {
  backfillCanonicalDeployIndustries,
  defaultFixturePlaybook,
  normalizeIndustryPlaybook,
  type DeckIndustryPlaybook,
} from './industryPlaybook';

export type { DeckIndustryPlaybook } from './industryPlaybook';

export type DeckIndustry = {
  id: number;
  slug: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  playbook: DeckIndustryPlaybook;
  updatedAt: string | null;
};

/** Seeded when the store is empty. */
export const DEFAULT_DECK_INDUSTRIES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'content', label: 'Content' },
  { slug: 'engineer', label: 'Engineer' },
  { slug: 'general', label: 'General contractor' },
  { slug: 'law', label: 'Law firm' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'plumbing', label: 'Plumbing' },
  { slug: 'principal', label: 'Principal' },
  { slug: 'real-estate', label: 'Real estate' },
  { slug: 'salon', label: 'Salon' },
];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS deck_industries (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(64) NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  playbook    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deck_industries_sort ON deck_industries (sort_order, id);
ALTER TABLE deck_industries ADD COLUMN IF NOT EXISTS playbook JSONB NOT NULL DEFAULT '{}'::jsonb;
`;

let _schemaReady: Promise<void> | null = null;
let _persistingBackfill = false;

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


function industriesFilePath(): string {
  const override = serverEnv('DECK_INDUSTRIES_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'deck-industries.json');
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
  playbook?: unknown;
  updated_at: Date | string | null;
}): DeckIndustry {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    playbook: normalizeIndustryPlaybook(row.playbook ?? defaultFixturePlaybook(row.slug)),
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
    playbook: defaultFixturePlaybook(d.slug),
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
      playbook: normalizeIndustryPlaybook(o.playbook ?? defaultFixturePlaybook(slug)),
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null,
    });
  });
  return out.length ? out.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id) : defaultsAsIndustries();
}

function persistBackfill(list: DeckIndustry[]): DeckIndustry[] {
  const filled = backfillCanonicalDeployIndustries(list);
  if (!filled.changed) return filled.list;
  if (deckIndustriesStorageBackend() === 'files') {
    writeFileIndustries(filled.list);
  }
  return filled.list;
}

function readFileIndustries(): DeckIndustry[] {
  try {
    const path = industriesFilePath();
    if (!existsSync(path)) {
      const seeded = persistBackfill(defaultsAsIndustries());
      writeFileIndustries(seeded);
      return seeded;
    }
    return persistBackfill(normalizeFileList(JSON.parse(readFileSync(path, 'utf8'))));
  } catch (e) {
    console.error('[deck-industries] file read failed', e);
    return persistBackfill(defaultsAsIndustries());
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
      playbook: normalizeIndustryPlaybook(item.playbook),
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
      `INSERT INTO deck_industries (slug, label, sort_order, enabled, playbook)
       VALUES ($1, $2, $3, true, $4::jsonb)
       ON CONFLICT (slug) DO NOTHING`,
      [d.slug, d.label, i, JSON.stringify(defaultFixturePlaybook(d.slug))],
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
    playbook: unknown;
    updated_at: Date | string | null;
  }>(
    `SELECT id, slug, label, sort_order, enabled, playbook, updated_at
     FROM deck_industries
     ORDER BY sort_order ASC, id ASC`,
  );
  const filled = backfillCanonicalDeployIndustries(res.rows.map(rowToIndustry));
  if (filled.changed && !_persistingBackfill) {
    _persistingBackfill = true;
    try {
      await replacePgIndustries(filled.list);
      return filled.list;
    } catch (e) {
      console.error('[deck-industries] canonical backfill persist failed', e);
    } finally {
      _persistingBackfill = false;
    }
  }
  return filled.list;
}

export type DeckIndustryInput = {
  id?: number;
  slug?: string;
  label: string;
  sortOrder?: number;
  enabled?: boolean;
  playbook?: unknown;
};

function normalizeInputList(raw: DeckIndustryInput[]): DeckIndustryInput[] {
  const seen = new Set<string>();
  const out: DeckIndustryInput[] = [];
  raw.forEach((item) => {
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
      enabled: item.enabled === false ? false : true,
      playbook: normalizeIndustryPlaybook(item.playbook ?? defaultFixturePlaybook(candidate)),
    });
  });
  // Alphabetical by label on every save; sortOrder is derived from that order.
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return out.map((item, i) => ({ ...item, sortOrder: i }));
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
        `INSERT INTO deck_industries (slug, label, sort_order, enabled, playbook, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
        [
          item.slug,
          item.label,
          item.sortOrder ?? i,
          item.enabled !== false,
          JSON.stringify(normalizeIndustryPlaybook(item.playbook)),
        ],
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

/** Write catalog industry checkboxes onto each playbook's moduleIds. */
export async function applyCatalogIndustriesToPlaybooks(
  moduleIdsByIndustry: Record<string, string[]>,
): Promise<void> {
  const current = await listDeckIndustries();
  if (!current.length) return;
  const inputs: DeckIndustryInput[] = current.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    enabled: row.enabled,
    playbook: {
      ...row.playbook,
      moduleIds: moduleIdsByIndustry[row.slug] ?? [],
    },
  }));
  const result = await replaceDeckIndustries(inputs);
  if (!result.ok) {
    console.error('[deck-industries] catalog playbook sync failed', result.error);
  }
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
      playbook: normalizeIndustryPlaybook(item.playbook),
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
