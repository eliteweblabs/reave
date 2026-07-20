/**
 * Unified knowledge store: Postgres DB entries (live) + bundled markdown (fallback).
 *
 * Job/work files under src/knowledge/jobs/ are intentionally excluded — they are
 * loaded on demand via workStore (list_work / read_work), not this index.
 *
 * Priority rules:
 *   - If DATABASE_URL is set, DB entries take precedence over bundled docs with the same slug.
 *   - Bundled docs that aren't in the DB are still accessible (read-only).
 *   - If DATABASE_URL is not set, only bundled docs are available.
 *
 * Write operations always target Postgres (bot/admin-created entries).
 */

import {
  parseKnowledgeMarkdown,
  readKnowledgeMarkdown,
  summarizeKnowledgeIndex,
} from './localKnowledge';
import { isKnowledgeSlugAvailable } from './knowledgePlugins';
import {
  isKnowledgeDbConfigured,
  dbListKnowledge,
  dbReadKnowledge,
  dbSearchKnowledge,
  dbWriteKnowledge,
  dbDeleteKnowledge,
  dbSeedBundled,
  type KnowledgeEntry,
} from './pgKnowledge';

export { isKnowledgeDbConfigured, type KnowledgeEntry };

/**
 * "Default" knowledge = app-mechanics playbooks that ship with the product and
 * describe how the agent works with the app itself. They are NOT tied to the
 * business or owner of any one installation. Everything else (owner credentials,
 * business overview, admin/bot-authored notes) is treated as "custom".
 *
 * Keyed by slug so it stays correct whether a doc is bundled or has been seeded
 * into the DB (source: 'db').
 */
export const DEFAULT_KNOWLEDGE_SLUGS: ReadonlySet<string> = new Set([
  'carddav',
  'client-portal',
  'code-dev-tools',
  'contact-api-reference',
  'contact-import',
  'crater-billing',
  'email-rules',
  'github-dev-tools',
  'kinsta-wordpress',
  'newsletter',
  'railway-deploy-webhook',
  'siri-examples',
  'siri-quick-reference',
  'siri-shortcuts',
  'uptime-monitoring',
]);

/** Whether a slug is one of the built-in app-mechanics playbooks (vs. custom). */
export function isDefaultKnowledgeSlug(slug: string): boolean {
  return DEFAULT_KNOWLEDGE_SLUGS.has(slug);
}

export interface KnowledgePreview {
  slug: string;
  title: string;
  preview: string;
  source: 'db' | 'bundled';
  /** True for built-in app playbooks; false for business/owner-specific docs. */
  isDefault: boolean;
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
    return bundled
      .filter((b) => isKnowledgeSlugAvailable(b.slug))
      .map((b) => ({
      slug: b.slug,
      title: b.preview,
      preview: b.preview,
      source: 'bundled' as const,
      isDefault: isDefaultKnowledgeSlug(b.slug),
    }));
  }

  const dbSlugs = new Set(dbRows.map((r) => r.slug));
  const dbPreviews: KnowledgePreview[] = dbRows
    .filter((r) => isKnowledgeSlugAvailable(r.slug))
    .map((r) => ({
    slug: r.slug,
    title: r.title,
    preview: r.preview,
    source: 'db' as const,
    isDefault: isDefaultKnowledgeSlug(r.slug),
    tags: r.tags,
    updated_at: r.updated_at,
  }));

  const bundledOnly = bundled
    .filter((b) => !dbSlugs.has(b.slug) && isKnowledgeSlugAvailable(b.slug))
    .map((b) => ({
      slug: b.slug,
      title: b.preview,
      preview: b.preview,
      source: 'bundled' as const,
      isDefault: isDefaultKnowledgeSlug(b.slug),
    }));

  return [...dbPreviews, ...bundledOnly];
}

/** Read one knowledge entry: DB first, then bundled fallback. */
export async function storeReadKnowledge(slug: string): Promise<KnowledgeDoc | null> {
  if (!isKnowledgeSlugAvailable(slug)) return null;
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
    const parsed = parseKnowledgeMarkdown(bundled.content);
    const title =
      parsed.title ||
      parsed.body.split('\n').find((l) => l.trim().length > 0)?.replace(/^#\s*/, '').slice(0, 120) ||
      slug;
    return {
      slug: bundled.slug,
      title,
      content: parsed.body,
      source: 'bundled',
      tags: parsed.tags.length ? parsed.tags : undefined,
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
    .filter((b) => isKnowledgeSlugAvailable(b.slug))
    .filter((b) => b.slug.includes(q) || b.preview.toLowerCase().includes(q))
    .map((b) => ({ slug: b.slug, title: b.preview, preview: b.preview, source: 'bundled' as const }));

  if (dbResults === null) {
    return bundledMatches;
  }

  const dbSlugs = new Set(dbResults.map((r) => r.slug));
  const dbMapped = dbResults
    .filter((r) => isKnowledgeSlugAvailable(r.slug))
    .map((r) => ({ ...r, source: 'db' as const }));

  return [...dbMapped, ...bundledMatches.filter((b) => !dbSlugs.has(b.slug))];
}

/**
 * Write a knowledge entry to the DB.
 * Source is accepted for API compatibility but is not persisted in Postgres.
 */
export async function storeWriteKnowledge(
  entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ ok: boolean; error?: string }> {
  if (!isKnowledgeDbConfigured()) {
    return { ok: false, error: 'Knowledge DB not configured — cannot save.' };
  }
  return dbWriteKnowledge({
    slug: entry.slug,
    title: entry.title,
    content: entry.content,
    tags: entry.tags ?? [],
  });
}

/** Delete a DB entry. Bundled docs cannot be deleted via this function. */
export async function storeDeleteKnowledge(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isKnowledgeDbConfigured()) {
    return { ok: false, error: 'Knowledge DB not configured — cannot save.' };
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
  if (!isKnowledgeDbConfigured()) {
    return {
      seeded: [],
      skipped: [],
      errors: [{ slug: '*', error: 'Knowledge DB not configured' }],
    };
  }
  return dbSeedBundled();
}
