/**
 * Plugin knowledge: markdown in `plugins/<feature_id>/` and/or the plugin repo root.
 * Only indexed when the matching feature module is enabled.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { enabledFeatures, PLUGIN_KNOWLEDGE_REPOS, type FeatureId } from './features';
import { parseKnowledgeMarkdown } from './localKnowledge';
import { githubListRepoRootMarkdown } from './githubClient';
import { serverEnv } from './serverEnv';

export interface PluginKnowledgeDoc {
  slug: string;
  featureId: FeatureId;
  title: string;
  content: string;
  preview: string;
  repo?: string;
}

const PLUGIN_SLUG_RE = /^[a-z0-9_]+(?:\/[a-z0-9._-]+)?$/i;

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

export function pluginsDir(): string {
  return serverEnv('PLUGINS_DIR')?.trim() || join(projectRoot(), 'plugins');
}

export function pluginKnowledgeSlug(featureId: FeatureId, basename: string): string {
  const name = basename.replace(/\.md$/i, '');
  return `${featureId}/${name}`;
}

export function isPluginKnowledgeSlug(slug: string): boolean {
  return PLUGIN_SLUG_RE.test(slug) && slug.includes('/');
}

function titleAndPreview(content: string, slug: string): { title: string; preview: string } {
  const parsed = parseKnowledgeMarkdown(content);
  const title =
    parsed.title ||
    parsed.body.split('\n').find((l) => l.trim().length > 0)?.replace(/^#\s*/, '').trim() ||
    slug.split('/').pop() ||
    slug;
  return { title, preview: title.slice(0, 120) };
}

function readLocalPluginDocs(featureId: FeatureId): PluginKnowledgeDoc[] {
  const dir = join(pluginsDir(), featureId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const content = readFileSync(join(dir, f), 'utf8');
      const slug = pluginKnowledgeSlug(featureId, f);
      const { title, preview } = titleAndPreview(content, slug);
      const parsed = parseKnowledgeMarkdown(content);
      return {
        slug,
        featureId,
        title,
        content: parsed.body,
        preview,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

const externalCache = new Map<string, { at: number; docs: PluginKnowledgeDoc[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function readExternalPluginDocs(featureId: FeatureId, repo: string): Promise<PluginKnowledgeDoc[]> {
  const cacheKey = `${featureId}:${repo}`;
  const hit = externalCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.docs;

  const res = await githubListRepoRootMarkdown(repo);
  if (!res.ok) {
    console.warn(`[plugin-knowledge] ${featureId} (${repo}): ${res.error}`);
    return [];
  }

  const docs: PluginKnowledgeDoc[] = res.data.map((file) => {
    const slug = pluginKnowledgeSlug(featureId, file.name);
    const { title, preview } = titleAndPreview(file.content, slug);
    const parsed = parseKnowledgeMarkdown(file.content);
    return {
      slug,
      featureId,
      title,
      content: parsed.body,
      preview,
      repo,
    };
  });

  externalCache.set(cacheKey, { at: Date.now(), docs });
  return docs;
}

/** All plugin knowledge for currently enabled features (local + external repo root). */
export async function listPluginKnowledge(): Promise<PluginKnowledgeDoc[]> {
  const out: PluginKnowledgeDoc[] = [];
  const seen = new Set<string>();

  for (const featureId of enabledFeatures()) {
    for (const doc of readLocalPluginDocs(featureId)) {
      if (seen.has(doc.slug)) continue;
      seen.add(doc.slug);
      out.push(doc);
    }

    const repo = PLUGIN_KNOWLEDGE_REPOS[featureId];
    if (!repo) continue;

    for (const doc of await readExternalPluginDocs(featureId, repo)) {
      if (seen.has(doc.slug)) continue;
      seen.add(doc.slug);
      out.push(doc);
    }
  }

  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readPluginKnowledge(slug: string): Promise<PluginKnowledgeDoc | null> {
  if (!isPluginKnowledgeSlug(slug)) return null;
  const featureId = slug.split('/')[0] as FeatureId;
  if (!enabledFeatures().has(featureId)) return null;

  const all = await listPluginKnowledge();
  return all.find((d) => d.slug === slug) ?? null;
}

/** Sync slug list for collision checks (local plugin dirs only). */
export function listLocalPluginKnowledgeSlugs(): string[] {
  const slugs: string[] = [];
  for (const featureId of enabledFeatures()) {
    for (const doc of readLocalPluginDocs(featureId)) slugs.push(doc.slug);
  }
  return slugs;
}
