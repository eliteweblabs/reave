/**
 * Unified knowledge store: Postgres DB entries (live) + bundled markdown (fallback).
 *
 * Job/work files under src/knowledge/jobs/ are intentionally excluded — they are
 * loaded on demand via workStore (list_work / read_work), not this index.
 *
 * Bundled plugin playbooks live under plugins/{id}/knowledge/ — not src/knowledge/.
 */

import {
  knowledgeSlugsForPlugin,
  parseKnowledgeMarkdown,
  pluginIdForKnowledgeSlug,
  readKnowledgeMarkdown,
  summarizeKnowledgeIndex,
} from './localKnowledge';
import {
  isDefaultKnowledgeSlug,
  isKnowledgeSlugAvailable,
  isPluginKnowledgeActive,
  pluginKnowledgeSlugs,
  pluginsForFeature,
  REAVE_PLUGINS,
  DEFAULT_KNOWLEDGE_SLUGS,
} from './pluginRegistry';
import {
  isKnowledgeDbConfigured,
  dbListKnowledge,
  dbReadKnowledge,
  dbSearchKnowledge,
  dbWriteKnowledge,
  dbDeleteKnowledge,
  dbSeedBundled,
  dbPurgeKnowledgeSlugs,
  type KnowledgeEntry,
} from './pgKnowledge';

export { isKnowledgeDbConfigured, type KnowledgeEntry, DEFAULT_KNOWLEDGE_SLUGS, isDefaultKnowledgeSlug };

function knowledgeSlugVisible(slug: string): boolean {
  const pluginId = pluginIdForKnowledgeSlug(slug);
  if (pluginId) return isPluginKnowledgeActive(pluginId);
  return isKnowledgeSlugAvailable(slug);
}

function inactiveAddonKnowledgeSlugs(): string[] {
  const slugs = new Set<string>();
  for (const plugin of REAVE_PLUGINS) {
    if (isPluginKnowledgeActive(plugin.id)) continue;
    for (const slug of pluginKnowledgeSlugs(plugin.id)) slugs.add(slug);
    for (const slug of knowledgeSlugsForPlugin(plugin.id)) slugs.add(slug);
  }
  return [...slugs];
}

/** Drop add-on playbooks from the live DB while the module is off. */
export async function purgeInactivePluginKnowledge(): Promise<string[]> {
  if (!isKnowledgeDbConfigured()) return [];
  return dbPurgeKnowledgeSlugs(inactiveAddonKnowledgeSlugs());
}

/** Drop one add-on's playbooks immediately when the owner turns it off. */
export async function purgePluginKnowledgeForFeature(feature: string): Promise<string[]> {
  if (!isKnowledgeDbConfigured()) return [];
  const slugs = new Set<string>();
  for (const plugin of pluginsForFeature(feature)) {
    for (const slug of pluginKnowledgeSlugs(plugin.id)) slugs.add(slug);
    for (const slug of knowledgeSlugsForPlugin(plugin.id)) slugs.add(slug);
  }
  return dbPurgeKnowledgeSlugs([...slugs]);
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
  await purgeInactivePluginKnowledge();
  const dbRows = await dbListKnowledge();
  const bundled = summarizeKnowledgeIndex();

  if (!dbRows) {
    return bundled
      .filter((b) => knowledgeSlugVisible(b.slug))
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
    .filter((r) => knowledgeSlugVisible(r.slug))
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
    .filter((b) => !dbSlugs.has(b.slug) && knowledgeSlugVisible(b.slug))
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
  await purgeInactivePluginKnowledge();
  if (!knowledgeSlugVisible(slug)) return null;
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

  await purgeInactivePluginKnowledge();
  const dbResults = await dbSearchKnowledge(query);
  const bundled = summarizeKnowledgeIndex();
  const bundledMatches = bundled
    .filter((b) => knowledgeSlugVisible(b.slug))
    .filter((b) => b.slug.includes(q) || b.preview.toLowerCase().includes(q))
    .map((b) => ({ slug: b.slug, title: b.preview, preview: b.preview, source: 'bundled' as const }));

  if (dbResults === null) {
    return bundledMatches;
  }

  const dbSlugs = new Set(dbResults.map((r) => r.slug));
  const dbMapped = dbResults
    .filter((r) => knowledgeSlugVisible(r.slug))
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
  if (!knowledgeSlugVisible(entry.slug)) {
    return { ok: false, error: 'That playbook belongs to an add-on that is not active.' };
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
  await purgeInactivePluginKnowledge();
  return dbSeedBundled();
}
