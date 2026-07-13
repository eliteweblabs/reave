/**
 * Unified knowledge store — three tiers, no cross-tier overrides:
 *
 * 1. **Repo** — bundled markdown in `src/knowledge/*.md` (read-only playbooks).
 * 2. **Plugin** — markdown in `plugins/<feature_id>/` and plugin repo roots when enabled.
 * 3. **Client** — Postgres only (agent/admin notes about clients; no file fallback).
 *
 * Job/work files are separate (workStore). Personal todos are separate (todoStore).
 */

import {
  parseKnowledgeMarkdown,
  readKnowledgeMarkdown,
  summarizeKnowledgeIndex,
  listKnowledgeSlugs,
} from './localKnowledge';
import {
  isKnowledgeDbConfigured,
  dbListKnowledge,
  dbReadKnowledge,
  dbSearchKnowledge,
  dbWriteKnowledge,
  dbDeleteKnowledge,
  type KnowledgeEntry,
} from './pgKnowledge';
import {
  listPluginKnowledge,
  readPluginKnowledge,
  listLocalPluginKnowledgeSlugs,
  isPluginKnowledgeSlug,
} from './pluginKnowledge';

export { isKnowledgeDbConfigured, type KnowledgeEntry };

export type KnowledgeSource = 'repo' | 'plugin' | 'client';

export interface KnowledgePreview {
  slug: string;
  title: string;
  preview: string;
  source: KnowledgeSource;
  readonly: boolean;
  tags?: string[];
  updated_at?: string;
  featureId?: string;
}

export interface KnowledgeDoc {
  slug: string;
  title: string;
  content: string;
  source: KnowledgeSource;
  readonly: boolean;
  tags?: string[];
  updated_at?: string;
  featureId?: string;
}

const RESERVED_REPO_SLUGS = new Set(listKnowledgeSlugs());

function isReservedSlug(slug: string): boolean {
  if (RESERVED_REPO_SLUGS.has(slug)) return true;
  if (isPluginKnowledgeSlug(slug)) return true;
  if (listLocalPluginKnowledgeSlugs().includes(slug)) return true;
  return false;
}

function repoPreviews(): KnowledgePreview[] {
  return summarizeKnowledgeIndex().map((b) => ({
    slug: b.slug,
    title: b.preview,
    preview: b.preview,
    source: 'repo' as const,
    readonly: true,
  }));
}

function pluginPreviews(docs: Awaited<ReturnType<typeof listPluginKnowledge>>): KnowledgePreview[] {
  return docs.map((d) => ({
    slug: d.slug,
    title: d.title,
    preview: d.preview,
    source: 'plugin' as const,
    readonly: true,
    featureId: d.featureId,
  }));
}

/** List all knowledge: repo playbooks, enabled plugin docs, then client DB entries. */
export async function storeListKnowledge(): Promise<KnowledgePreview[]> {
  const repo = repoPreviews();
  const plugins = pluginPreviews(await listPluginKnowledge());
  const reserved = new Set([...repo, ...plugins].map((e) => e.slug));

  const dbRows = await dbListKnowledge();
  const client: KnowledgePreview[] = (dbRows ?? [])
    .filter((r) => !reserved.has(r.slug))
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      preview: r.preview,
      source: 'client' as const,
      readonly: false,
      tags: r.tags,
      updated_at: r.updated_at,
    }));

  return [...repo, ...plugins, ...client];
}

/** Read one entry: repo → plugin → client (separate namespaces; no slug override). */
export async function storeReadKnowledge(slug: string): Promise<KnowledgeDoc | null> {
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
      source: 'repo',
      readonly: true,
      tags: parsed.tags.length ? parsed.tags : undefined,
    };
  }

  const plugin = await readPluginKnowledge(slug);
  if (plugin) {
    return {
      slug: plugin.slug,
      title: plugin.title,
      content: plugin.content,
      source: 'plugin',
      readonly: true,
      featureId: plugin.featureId,
    };
  }

  const dbEntry = await dbReadKnowledge(slug);
  if (dbEntry) {
    return {
      slug: dbEntry.slug,
      title: dbEntry.title,
      content: dbEntry.content,
      source: 'client',
      readonly: false,
      tags: dbEntry.tags,
      updated_at: dbEntry.updated_at,
    };
  }

  return null;
}

export async function storeSearchKnowledge(
  query: string,
): Promise<{ slug: string; title: string; preview: string; source: KnowledgeSource }[]> {
  const q = query.toLowerCase().trim();
  const seen = new Set<string>();
  const out: { slug: string; title: string; preview: string; source: KnowledgeSource }[] = [];

  for (const r of repoPreviews()) {
    if (r.slug.includes(q) || r.preview.toLowerCase().includes(q)) {
      seen.add(r.slug);
      out.push({ slug: r.slug, title: r.title, preview: r.preview, source: 'repo' });
    }
  }

  for (const p of await listPluginKnowledge()) {
    if (seen.has(p.slug)) continue;
    if (p.slug.includes(q) || p.title.toLowerCase().includes(q) || p.preview.toLowerCase().includes(q)) {
      seen.add(p.slug);
      out.push({ slug: p.slug, title: p.title, preview: p.preview, source: 'plugin' });
    }
  }

  const dbResults = await dbSearchKnowledge(query);
  for (const r of dbResults ?? []) {
    if (seen.has(r.slug) || isReservedSlug(r.slug)) continue;
    seen.add(r.slug);
    out.push({ ...r, source: 'client' });
  }

  return out;
}

/** Write client knowledge to Postgres. Rejects slugs reserved by repo or plugin tiers. */
export async function storeWriteKnowledge(
  entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ ok: boolean; error?: string }> {
  if (!isKnowledgeDbConfigured()) {
    return { ok: false, error: 'Knowledge DB not configured — client knowledge requires DATABASE_URL.' };
  }
  if (isReservedSlug(entry.slug)) {
    return {
      ok: false,
      error: `Slug "${entry.slug}" is reserved by repo or plugin knowledge — choose a different slug for client notes.`,
    };
  }
  return dbWriteKnowledge({
    slug: entry.slug,
    title: entry.title,
    content: entry.content,
    tags: entry.tags ?? [],
  });
}

/** Delete client knowledge from Postgres. Repo and plugin docs cannot be deleted here. */
export async function storeDeleteKnowledge(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isKnowledgeDbConfigured()) {
    return { ok: false, error: 'Knowledge DB not configured — client knowledge requires DATABASE_URL.' };
  }
  if (readKnowledgeMarkdown(slug) || isPluginKnowledgeSlug(slug)) {
    return { ok: false, error: 'Repo and plugin knowledge are read-only — edit the markdown in git.' };
  }
  return dbDeleteKnowledge(slug);
}

export async function storeListSlugs(): Promise<string[]> {
  const all = await storeListKnowledge();
  return all.map((e) => e.slug);
}
