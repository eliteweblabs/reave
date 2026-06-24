/**
 * Unified knowledge store: Supabase DB entries (live) + bundled markdown (fallback).
 *
 * Job/work files under src/knowledge/jobs/ are intentionally excluded — they are
 * loaded on demand via workStore (list_work / read_work), not this index.
 *
 * Priority rules:
 *   - If Supabase is configured, DB entries take precedence over bundled docs with the same slug.
 *   - Bundled docs that aren't in the DB are still accessible (read-only).
 *   - If Supabase is not configured, only bundled docs are available.
 *
 * Write operations always target Supabase (bot/admin-created entries).
 */

import {
  listKnowledgeSlugs,
  readKnowledgeMarkdown,
  summarizeKnowledgeIndex,
} from './localKnowledge';
import {
  isSupabaseKnowledgeConfigured,
  dbListKnowledge,
  dbReadKnowledge,
  dbSearchKnowledge,
  dbWriteKnowledge,
  dbDeleteKnowledge,
  type KnowledgeEntry,
} from './supabaseKnowledge';

// Re-export for consumers that only need the config check or types
export { isSupabaseKnowledgeConfigured, type KnowledgeEntry };

export interface KnowledgePreview {
  slug: string;
  title: string;
  preview: string;
  source: 'db' | 'bundled';
  tags?: string[];
  updated_at?: string;
}

export interface KnowledgeDoc {
  slug: string;
  title: string;
  content: string;
  source: 'db' | 'bundled';
  tags?: string[];
  updated_at?: string;
}

/** List all knowledge entries: DB entries first, then bundled slugs not already in DB. */
export async function storeListKnowledge(): Promise<KnowledgePreview[]> {
  const dbRows = await dbListKnowledge();
  const bundled = summarizeKnowledgeIndex();

  if (!dbRows) {
    return bundled.map((b) => ({
      slug: b.slug,
      title: b.preview,
      preview: b.preview,
      source: 'bundled' as const,
    }));
  }

  const dbSlugs = new Set(dbRows.map((r) => r.slug));
  const dbPreviews: KnowledgePreview[] = dbRows.map((r) => ({
    slug: r.slug,
    title: r.title,
    preview: r.title,
    source: 'db' as const,
    tags: r.tags,
    updated_at: r.updated_at,
  }));

  const bundledOnly = bundled
    .filter((b) => !dbSlugs.has(b.slug))
    .map((b) => ({
      slug: b.slug,
      title: b.preview,
      preview: b.preview,
      source: 'bundled' as const,
    }));

  return [...dbPreviews, ...bundledOnly].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Read one knowledge entry: DB first, then bundled fallback. */
export async function storeReadKnowledge(slug: string): Promise<KnowledgeDoc | null> {
  const dbEntry = await dbReadKnowledge(slug);
  if (dbEntry) {
    return {
      slug: dbEntry.slug,
      title: dbEntry.title,
      content: dbEntry.content,
      source: 'db',
      tags: dbEntry.tags,
      updated_at: dbEntry.updated_at,
    };
  }

  const bundled = readKnowledgeMarkdown(slug);
  if (bundled) {
    const firstLine = bundled.content.split('\n').find((l) => l.trim().length > 0) ?? '';
    return {
      slug: bundled.slug,
      title: firstLine.replace(/^#\s*/, '').slice(0, 120),
      content: bundled.content,
      source: 'bundled',
    };
  }

  return null;
}

/**
 * Search knowledge by keyword/topic.
 * DB: full-text search (weighted: title > content).
 * Bundled: substring match on slug + one-line preview.
 * DB results appear first; bundled results are appended if their slug wasn't already returned.
 */
export async function storeSearchKnowledge(
  query: string,
): Promise<{ slug: string; title: string; preview: string; source: 'db' | 'bundled' }[]> {
  const q = query.toLowerCase().trim();

  const dbResults = await dbSearchKnowledge(query);
  const bundled = summarizeKnowledgeIndex();
  const bundledMatches = bundled
    .filter((b) => b.slug.includes(q) || b.preview.toLowerCase().includes(q))
    .map((b) => ({ slug: b.slug, title: b.preview, preview: b.preview, source: 'bundled' as const }));

  if (dbResults === null) {
    return bundledMatches;
  }

  const dbSlugs = new Set(dbResults.map((r) => r.slug));
  const dbMapped = dbResults.map((r) => ({ ...r, source: 'db' as const }));

  return [...dbMapped, ...bundledMatches.filter((b) => !dbSlugs.has(b.slug))];
}

/**
 * Write a knowledge entry to the DB.
 * Source is set to 'bot' when called from the assistant, 'manual' from admin UI.
 */
export async function storeWriteKnowledge(
  entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseKnowledgeConfigured()) {
    return {
      ok: false,
      error: 'Knowledge DB not configured (add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to Railway vars)',
    };
  }
  return dbWriteKnowledge({ ...entry, source: entry.source ?? 'manual' });
}

/** Delete a DB entry. Bundled docs cannot be deleted via this function. */
export async function storeDeleteKnowledge(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseKnowledgeConfigured()) {
    return { ok: false, error: 'Knowledge DB not configured' };
  }
  return dbDeleteKnowledge(slug);
}

/** Convenience: all slugs from both DB and bundled (for autocomplete / validation). */
export async function storeListSlugs(): Promise<string[]> {
  const all = await storeListKnowledge();
  return all.map((e) => e.slug);
}

/** Seed bundled docs into the DB so they become live-editable. */
export async function storeSeedBundled(): Promise<{
  seeded: string[];
  skipped: string[];
  errors: { slug: string; error: string }[];
}> {
  const slugs = listKnowledgeSlugs();
  const seeded: string[] = [];
  const skipped: string[] = [];
  const errors: { slug: string; error: string }[] = [];

  for (const slug of slugs) {
    const existing = await dbReadKnowledge(slug);
    if (existing) {
      skipped.push(slug);
      continue;
    }
    const bundled = readKnowledgeMarkdown(slug);
    if (!bundled) {
      errors.push({ slug, error: 'bundled file missing' });
      continue;
    }
    const firstLine = bundled.content.split('\n').find((l) => l.trim().length > 0) ?? '';
    const title = firstLine.replace(/^#\s*/, '').slice(0, 200) || slug;
    const result = await storeWriteKnowledge({
      slug,
      title,
      content: bundled.content,
      tags: [],
      source: 'bundled',
    });
    if (result.ok) {
      seeded.push(slug);
    } else {
      errors.push({ slug, error: result.error ?? 'unknown error' });
    }
  }

  return { seeded, skipped, errors };
}
