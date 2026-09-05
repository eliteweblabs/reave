/**
 * Unified knowledge store: Postgres DB entries (live) + bundled markdown (fallback).
 *
 * Job/work files under src/knowledge/jobs/ are intentionally excluded — they are
 * loaded on demand via workStore (list_work / read_work), not this index.
 *
 * Bundled plugin playbooks live under plugins/{id}/knowledge/ and are read
 * from those files — they are never copied into the knowledge DB.
 */

import {
  isDefaultKnowledgeSlug,
  isKnowledgeSlugAvailable,
  isOpsOnlyKnowledgeSlug,
  isPluginKnowledgeActive,
  isPluginOwnedKnowledgeSlug,
  OPS_ONLY_KNOWLEDGE_SLUGS,
  pluginKnowledgeSlugs,
  pluginsForFeature,
  REAVE_PLUGINS,
  DEFAULT_KNOWLEDGE_SLUGS,
} from './pluginRegistry';
import { isCanonicalReaveInstall } from './installConfig';
import {
  isKnowledgeDbConfigured,
  dbListKnowledge,
  dbReadKnowledge,
  dbSearchKnowledge,
  dbWriteKnowledge,
  dbDeleteKnowledge,
  dbSeedBundled,
  dbPurgeKnowledgeSlugs,
  dbSeedClientKnowledgeFromLegacy,
  knowledgeSlugsForPlugin,
  parseKnowledgeMarkdown,
  pluginIdForKnowledgeSlug,
  readKnowledgeMarkdown,
  summarizeKnowledgeIndex,
  type KnowledgeEntry,
} from './pgKnowledge';

export { isKnowledgeDbConfigured, type KnowledgeEntry, DEFAULT_KNOWLEDGE_SLUGS, isDefaultKnowledgeSlug };

function isModulePlaybookSlug(slug: string): boolean {
  return Boolean(pluginIdForKnowledgeSlug(slug)) || isPluginOwnedKnowledgeSlug(slug);
}

function knowledgeSlugVisible(slug: string): boolean {
  if (isOpsOnlyKnowledgeSlug(slug) && !isCanonicalReaveInstall()) return false;
  const pluginId = pluginIdForKnowledgeSlug(slug);
  if (pluginId) return isPluginKnowledgeActive(pluginId);
  return isKnowledgeSlugAvailable(slug);
}

function allModuleKnowledgeSlugs(): string[] {
  const slugs = new Set<string>();
  for (const plugin of REAVE_PLUGINS) {
    for (const slug of pluginKnowledgeSlugs(plugin.id)) slugs.add(slug);
    for (const slug of knowledgeSlugsForPlugin(plugin.id)) slugs.add(slug);
  }
  return [...slugs];
}

/** Module playbooks are the plugin markdown files — never keep a Postgres copy. */
export async function purgeInactivePluginKnowledge(): Promise<string[]> {
  if (!isKnowledgeDbConfigured()) return [];
  const slugs = allModuleKnowledgeSlugs();
  if (!isCanonicalReaveInstall()) slugs.push(...OPS_ONLY_KNOWLEDGE_SLUGS);
  return dbPurgeKnowledgeSlugs(slugs);
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
  /** False for module markdown — those files are not saved to the knowledge DB. */
  editable: boolean;
  tags?: string[];
  updated_at?: string;
}

export interface KnowledgeDoc {
  slug: string;
  title: string;
  content: string;
  source: 'db' | 'bundled';
  editable: boolean;
  tags?: string[];
  updated_at?: string;
}

/** List all knowledge entries: DB entries first, then bundled slugs not already in DB. */
export async function storeListKnowledge(): Promise<KnowledgePreview[]> {
  await purgeInactivePluginKnowledge();
  await dbSeedClientKnowledgeFromLegacy();
  const dbRows = await dbListKnowledge();
  const bundled = await summarizeKnowledgeIndex();

  if (!dbRows) {
    return bundled
      .filter((b) => knowledgeSlugVisible(b.slug))
      .map((b) => ({
      slug: b.slug,
      title: b.preview,
      preview: b.preview,
      source: 'bundled' as const,
      isDefault: isDefaultKnowledgeSlug(b.slug),
      editable: !isModulePlaybookSlug(b.slug),
    }));
  }

  const dbSlugs = new Set(dbRows.map((r) => r.slug));
  const dbPreviews: KnowledgePreview[] = dbRows
    .filter((r) => knowledgeSlugVisible(r.slug) && !isModulePlaybookSlug(r.slug))
    .map((r) => ({
    slug: r.slug,
    title: r.title,
    preview: r.preview,
    source: 'db' as const,
    isDefault: isDefaultKnowledgeSlug(r.slug),
    editable: true,
    tags: r.tags,
    updated_at: r.updated_at,
  }));

  const bundledOnly = bundled
    .filter((b) => knowledgeSlugVisible(b.slug) && (isModulePlaybookSlug(b.slug) || !dbSlugs.has(b.slug)))
    .map((b) => ({
      slug: b.slug,
      title: b.preview,
      preview: b.preview,
      source: 'bundled' as const,
      isDefault: isDefaultKnowledgeSlug(b.slug),
      editable: !isModulePlaybookSlug(b.slug),
    }));

  return [...dbPreviews, ...bundledOnly];
}

/** Read one knowledge entry. Module playbooks always come from plugin markdown. */
export async function storeReadKnowledge(slug: string): Promise<KnowledgeDoc | null> {
  await purgeInactivePluginKnowledge();
  await dbSeedClientKnowledgeFromLegacy();
  if (!knowledgeSlugVisible(slug)) return null;
  const fileBacked = isModulePlaybookSlug(slug);
  const dbEntry = fileBacked ? null : await dbReadKnowledge(slug);
  if (dbEntry) {
    return {
      slug: dbEntry.slug,
      title: dbEntry.title,
      content: dbEntry.content,
      source: 'db',
      editable: true,
      tags: dbEntry.tags,
      updated_at: dbEntry.updated_at,
    };
  }

  const bundled = await readKnowledgeMarkdown(slug);
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
      editable: !fileBacked,
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
  await dbSeedClientKnowledgeFromLegacy();
  const dbResults = await dbSearchKnowledge(query);
  const bundled = await summarizeKnowledgeIndex();
  const bundledMatches = bundled
    .filter((b) => knowledgeSlugVisible(b.slug))
    .filter((b) => b.slug.includes(q) || b.preview.toLowerCase().includes(q))
    .map((b) => ({ slug: b.slug, title: b.preview, preview: b.preview, source: 'bundled' as const }));

  if (dbResults === null) {
    return bundledMatches;
  }

  const dbMapped = dbResults
    .filter((r) => knowledgeSlugVisible(r.slug) && !isModulePlaybookSlug(r.slug))
    .map((r) => ({ ...r, source: 'db' as const }));
  const dbSlugs = new Set(dbMapped.map((r) => r.slug));

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
  if (isModulePlaybookSlug(entry.slug)) {
    return { ok: false, error: 'Module playbooks are read from the plugin markdown — they are not saved to the knowledge DB.' };
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
  if (isModulePlaybookSlug(slug)) {
    return { ok: false, error: 'Module playbooks live in the plugin directory and cannot be deleted from the knowledge DB.' };
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
