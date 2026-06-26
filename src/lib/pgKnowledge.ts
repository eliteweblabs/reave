/**
 * Postgres-backed knowledge store (Railway DATABASE_URL).
 * Schema is ensured on first use; bundled markdown is seeded when the table is empty.
 */

import pg from 'pg';
import {
  listKnowledgeSlugs,
  parseKnowledgeMarkdown,
  readKnowledgeMarkdown,
} from './localKnowledge';
import { serverEnv } from './serverEnv';

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

const SCHEMA_SQL = `
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

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _seedReady: Promise<void> | null = null;

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

async function seedBundledIfEmpty(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM knowledge');
  if ((rows[0]?.n ?? 0) > 0) return;

  for (const slug of listKnowledgeSlugs()) {
    const raw = readKnowledgeMarkdown(slug);
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

  if (!_seedReady) {
    _seedReady = seedBundledIfEmpty(pool).catch((e) => {
      _seedReady = null;
      console.error('[knowledge:pg] seed error:', e);
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
    console.error('[knowledge:pg] list error:', e);
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
    console.error('[knowledge:pg] read error:', e);
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
    console.error('[knowledge:pg] search error:', e);
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

  for (const slug of listKnowledgeSlugs()) {
    const existing = await dbReadKnowledge(slug);
    if (existing) {
      skipped.push(slug);
      continue;
    }
    const raw = readKnowledgeMarkdown(slug);
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
