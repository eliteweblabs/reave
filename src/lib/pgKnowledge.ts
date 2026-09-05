/**
 * Postgres-backed knowledge store (Railway DATABASE_URL).
 *
 * - `client_knowledge` — architecture rewire loader (list/read/search bundled docs)
 * - `knowledge` — live editable owner docs (admin CRUD)
 *
 * Module playbooks under plugins/{id}/knowledge/ stay file-backed; everything else
 * prefers client_knowledge rows, then legacy knowledge, then bundled markdown.
 */

import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import {
  listKnowledgeSlugs as localListKnowledgeSlugs,
  parseKnowledgeMarkdown as localParseKnowledgeMarkdown,
  pluginIdForKnowledgeSlug as localPluginIdForKnowledgeSlug,
  readKnowledgeMarkdown as localReadKnowledgeMarkdown,
  summarizeKnowledgeIndex as localSummarizeKnowledgeIndex,
  knowledgeSlugsForPlugin as localKnowledgeSlugsForPlugin,
  industryKnowledgeEntries as localIndustryKnowledgeEntries,
} from './localKnowledge';
import { isPluginOwnedKnowledgeSlug } from './pluginRegistry';
import { createLogger } from './logger';

const log = createLogger('knowledge:pg');

/** Sentinel UUID for install-universal knowledge rows (migrated bundled docs). */
export const UNIVERSAL_KNOWLEDGE_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

export interface KnowledgeEntry {
  id?: number;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  source?: string;
  updated_at?: string;
  created_at?: string;
}

export interface KnowledgeSummary {
  slug: string;
  title: string;
  preview: string;
  tags: string[];
  updated_at: string;
}

const LEGACY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS knowledge (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_slug ON knowledge(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_search ON knowledge USING GIN(
  to_tsvector('english', title || ' ' || content)
);
`;

let _schemaReady: Promise<void> | null = null;
let _seedReady: Promise<void> | null = null;

function isAddonPlaybookSlug(slug: string): boolean {
  return Boolean(localPluginIdForKnowledgeSlug(slug)) || isPluginOwnedKnowledgeSlug(slug);
}

/** Re-export pure/path helpers — module playbooks stay file-backed. */
export const parseKnowledgeMarkdown = localParseKnowledgeMarkdown;
export const pluginIdForKnowledgeSlug = localPluginIdForKnowledgeSlug;
export const knowledgeSlugsForPlugin = localKnowledgeSlugsForPlugin;

export function industryKnowledgeEntries(industry?: string | null): { slug: string; content: string }[] {
  return localIndustryKnowledgeEntries(industry);
}

async function readClientKnowledgeRow(
  slug: string,
): Promise<{ slug: string; content: string; title: string } | null> {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query<{ slug: string; content: string; title: string }>(
      `SELECT slug, content, title
       FROM client_knowledge
       WHERE client_id = $1::uuid AND slug = $2
       LIMIT 1`,
      [UNIVERSAL_KNOWLEDGE_CLIENT_ID, slug],
    );
    return rows[0] ?? null;
  } catch (e) {
    log.error('readClientKnowledgeRow error', e);
    return null;
  }
}

async function listClientKnowledgeSlugs(): Promise<string[]> {
  const pool = getPgPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query<{ slug: string }>(
      `SELECT slug FROM client_knowledge WHERE client_id = $1::uuid ORDER BY slug`,
      [UNIVERSAL_KNOWLEDGE_CLIENT_ID],
    );
    return rows.map((r) => r.slug);
  } catch (e) {
    log.error('listClientKnowledgeSlugs error', e);
    return [];
  }
}

/** All knowledge slugs: DB client_knowledge + file-backed plugin/industry docs. */
export async function listKnowledgeSlugs(): Promise<string[]> {
  const dbSlugs = await listClientKnowledgeSlugs();
  const localSlugs = localListKnowledgeSlugs();
  if (dbSlugs.length === 0) return localSlugs;
  return [...new Set([...dbSlugs, ...localSlugs])].sort((a, b) => a.localeCompare(b));
}

/** Read markdown: plugin playbooks from disk; other slugs from client_knowledge, then disk. */
export async function readKnowledgeMarkdown(
  slug: string,
): Promise<{ slug: string; content: string } | null> {
  if (isAddonPlaybookSlug(slug)) {
    return localReadKnowledgeMarkdown(slug);
  }

  const row = await readClientKnowledgeRow(slug);
  if (row) return { slug: row.slug, content: row.content };

  return localReadKnowledgeMarkdown(slug);
}

export async function summarizeKnowledgeIndex(): Promise<{ slug: string; preview: string }[]> {
  const slugs = await listKnowledgeSlugs();
  const out: { slug: string; preview: string }[] = [];
  for (const slug of slugs) {
    const row = await readKnowledgeMarkdown(slug);
    const parsed = parseKnowledgeMarkdown(row?.content ?? '');
    const first =
      parsed.title ||
      parsed.body.split('\n').find((l) => l.trim().length > 0)?.replace(/^#\s*/, '') ||
      '';
    out.push({ slug, preview: first.slice(0, 120) });
  }
  return out;
}

async function seedBundledIfEmpty(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM knowledge');
  if ((rows[0]?.n ?? 0) > 0) return;

  for (const slug of localListKnowledgeSlugs()) {
    if (isAddonPlaybookSlug(slug)) continue;
    const raw = localReadKnowledgeMarkdown(slug);
    if (!raw) continue;
    const parsed = parseKnowledgeMarkdown(raw.content);
    const title = parsed.title || slug;
    await pool.query(
      `INSERT INTO knowledge (slug, title, content, tags)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, title, parsed.body, parsed.tags],
    );
  }
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(LEGACY_SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;

  if (!_seedReady) {
    _seedReady = seedBundledIfEmpty(pool).catch((e) => {
      _seedReady = null;
      log.error('seed error', e);
    });
  }
  await _seedReady;

  return pool;
}

export function isKnowledgeDbConfigured(): boolean {
  return !!databaseUrl();
}

export async function dbListKnowledge(): Promise<KnowledgeSummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<KnowledgeSummary>(
      `SELECT slug, title, LEFT(content, 150) AS preview, tags, updated_at
       FROM knowledge
       ORDER BY updated_at DESC`,
    );
    return rows;
  } catch (e) {
    log.error('list error', e);
    return null;
  }
}

export async function dbReadKnowledge(slug: string): Promise<KnowledgeEntry | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<KnowledgeEntry>(
      `SELECT id, slug, title, content, tags, created_at, updated_at
       FROM knowledge WHERE slug = $1`,
      [slug],
    );
    return rows[0] ?? null;
  } catch (e) {
    log.error('read error', e);
    return null;
  }
}

export async function dbSearchKnowledge(
  query: string,
): Promise<{ slug: string; title: string; preview: string }[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{ slug: string; title: string; preview: string }>(
      `SELECT slug, title, LEFT(content, 150) AS preview
       FROM knowledge
       WHERE to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
       ORDER BY updated_at DESC
       LIMIT 20`,
      [query],
    );
    return rows;
  } catch (e) {
    log.error('search error', e);
    return null;
  }
}

export async function dbWriteKnowledge(
  entry: Pick<KnowledgeEntry, 'slug' | 'title' | 'content' | 'tags'>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Knowledge DB not configured — cannot save.' };

    await pool.query(
      `INSERT INTO knowledge (slug, title, content, tags)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         tags = EXCLUDED.tags,
         updated_at = NOW()`,
      [entry.slug, entry.title, entry.content, entry.tags],
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function dbDeleteKnowledge(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Knowledge DB not configured — cannot save.' };

    const { rowCount } = await pool.query(`DELETE FROM knowledge WHERE slug = $1`, [slug]);
    if ((rowCount ?? 0) === 0) return { ok: false, error: 'Not found' };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Delete add-on playbooks from the live DB so a turned-off module leaves no rows. */
export async function dbPurgeKnowledgeSlugs(slugs: string[]): Promise<string[]> {
  const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
  if (!unique.length) return [];
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const { rows } = await pool.query<{ slug: string }>(
      `DELETE FROM knowledge WHERE slug = ANY($1::text[]) RETURNING slug`,
      [unique],
    );
    return rows.map((r) => r.slug);
  } catch (e) {
    log.error('purge error', e);
    return [];
  }
}

/** Import bundled docs into DB (skips slugs that already exist). */
export async function dbSeedBundled(): Promise<{
  seeded: string[];
  skipped: string[];
  errors: { slug: string; error: string }[];
}> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  const errors: { slug: string; error: string }[] = [];

  const pool = await ensureSchema();
  if (!pool) {
    return {
      seeded: [],
      skipped: [],
      errors: [{ slug: '*', error: 'Knowledge DB not configured' }],
    };
  }

  for (const slug of localListKnowledgeSlugs()) {
    if (isAddonPlaybookSlug(slug)) {
      skipped.push(slug);
      continue;
    }
    const existing = await dbReadKnowledge(slug);
    if (existing) {
      skipped.push(slug);
      continue;
    }
    const raw = localReadKnowledgeMarkdown(slug);
    if (!raw) {
      errors.push({ slug, error: 'bundled file missing' });
      continue;
    }
    const parsed = parseKnowledgeMarkdown(raw.content);
    const title = parsed.title || slug;
    const result = await dbWriteKnowledge({
      slug,
      title,
      content: parsed.body,
      tags: parsed.tags,
    });
    if (result.ok) seeded.push(slug);
    else errors.push({ slug, error: result.error ?? 'unknown error' });
  }

  return { seeded, skipped, errors };
}

/** Copy legacy knowledge rows into client_knowledge (idempotent). */
export async function dbSeedClientKnowledgeFromLegacy(): Promise<{ copied: number }> {
  const pool = getPgPool();
  if (!pool) return { copied: 0 };
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO client_knowledge (client_id, slug, title, content, tags)
       SELECT $1::uuid, slug, title, content, COALESCE(tags, ARRAY[]::text[])
       FROM knowledge
       ON CONFLICT (client_id, slug) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         tags = EXCLUDED.tags,
         updated_at = NOW()`,
      [UNIVERSAL_KNOWLEDGE_CLIENT_ID],
    );
    return { copied: rowCount ?? 0 };
  } catch (e) {
    log.error('dbSeedClientKnowledgeFromLegacy error', e);
    return { copied: 0 };
  }
}
