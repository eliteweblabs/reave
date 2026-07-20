/**
 * Markdown knowledge — core app docs + self-contained plugin docs.
 *
 * - Core: `src/knowledge/*.md` (generic product mechanics)
 * - Core install-scoped: `src/knowledge/installs/{slug}/*.md`
 * - Plugin: `plugins/{id}/knowledge/*.md` (only when plugin feature is enabled)
 * - Plugin install-scoped: `plugins/{id}/knowledge/installs/{slug}/*.md`
 *
 * Job files in `src/knowledge/jobs/` are excluded — loaded via workStore.
 */

import { installConfigSlug } from './installConfig';
import { isPluginKnowledgeActive } from './pluginRegistry';

const coreRawByPath = import.meta.glob<string>('../knowledge/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const coreInstallRawByPath = import.meta.glob<string>('../knowledge/installs/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const pluginRawByPath = import.meta.glob<string>('../../plugins/*/knowledge/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const pluginInstallRawByPath = import.meta.glob<string>(
  '../../plugins/*/knowledge/installs/*/*.md',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

function pathToSlug(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

function installSlugFromCorePath(path: string): string | null {
  const match = path.match(/knowledge\/installs\/([^/]+)\//);
  return match?.[1] ?? null;
}

function pluginIdFromPath(path: string): string | null {
  const match = path.match(/plugins\/([^/]+)\/knowledge\//);
  return match?.[1] ?? null;
}

function installSlugFromPluginPath(path: string): string | null {
  const match = path.match(/plugins\/[^/]+\/knowledge\/installs\/([^/]+)\//);
  return match?.[1] ?? null;
}

function coreInstallScopedEntries(): { slug: string; content: string }[] {
  const slug = installConfigSlug();
  const out: { slug: string; content: string }[] = [];
  for (const [path, content] of Object.entries(coreInstallRawByPath)) {
    if (installSlugFromCorePath(path) !== slug) continue;
    out.push({ slug: pathToSlug(path), content: content ?? '' });
  }
  return out;
}

function pluginGlobalEntries(): { slug: string; content: string }[] {
  const out: { slug: string; content: string }[] = [];
  for (const [path, content] of Object.entries(pluginRawByPath)) {
    const pluginId = pluginIdFromPath(path);
    if (!pluginId || !isPluginKnowledgeActive(pluginId)) continue;
    out.push({ slug: pathToSlug(path), content: content ?? '' });
  }
  return out;
}

function pluginInstallScopedEntries(): { slug: string; content: string }[] {
  const install = installConfigSlug();
  const out: { slug: string; content: string }[] = [];
  for (const [path, content] of Object.entries(pluginInstallRawByPath)) {
    const pluginId = pluginIdFromPath(path);
    if (!pluginId || !isPluginKnowledgeActive(pluginId)) continue;
    if (installSlugFromPluginPath(path) !== install) continue;
    out.push({ slug: pathToSlug(path), content: content ?? '' });
  }
  return out;
}

export function listKnowledgeSlugs(): string[] {
  const global = Object.keys(coreRawByPath).map(pathToSlug);
  const install = coreInstallScopedEntries().map((e) => e.slug);
  const pluginGlobal = pluginGlobalEntries().map((e) => e.slug);
  const pluginInstall = pluginInstallScopedEntries().map((e) => e.slug);
  return [...new Set([...global, ...install, ...pluginGlobal, ...pluginInstall])].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function readKnowledgeMarkdown(slug: string): { slug: string; content: string } | null {
  const coreKey = Object.keys(coreRawByPath).find((p) => pathToSlug(p) === slug) ?? null;
  if (coreKey) return { slug, content: coreRawByPath[coreKey] ?? '' };

  const coreScoped = coreInstallScopedEntries().find((e) => e.slug === slug);
  if (coreScoped) return { slug: coreScoped.slug, content: coreScoped.content };

  for (const [path, content] of Object.entries(pluginRawByPath)) {
    if (pathToSlug(path) !== slug) continue;
    const pluginId = pluginIdFromPath(path);
    if (!pluginId || !isPluginKnowledgeActive(pluginId)) return null;
    return { slug, content: content ?? '' };
  }

  for (const [path, content] of Object.entries(pluginInstallRawByPath)) {
    if (pathToSlug(path) !== slug) continue;
    const pluginId = pluginIdFromPath(path);
    if (!pluginId || !isPluginKnowledgeActive(pluginId)) return null;
    if (installSlugFromPluginPath(path) !== installConfigSlug()) return null;
    return { slug, content: content ?? '' };
  }

  return null;
}

export function summarizeKnowledgeIndex(): { slug: string; preview: string }[] {
  return listKnowledgeSlugs().map((slug) => {
    const row = readKnowledgeMarkdown(slug);
    const parsed = parseKnowledgeMarkdown(row?.content ?? '');
    const first =
      parsed.title ||
      parsed.body.split('\n').find((l) => l.trim().length > 0)?.replace(/^#\s*/, '') ||
      '';
    const preview = first.slice(0, 120);
    return { slug, preview };
  });
}

/** Parse optional YAML frontmatter (title, tags) from bundled markdown. */
export function parseKnowledgeMarkdown(raw: string): {
  title?: string;
  tags: string[];
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    const first = raw.split('\n').find((l) => l.trim().length > 0) ?? '';
    const title = first.startsWith('#') ? first.replace(/^#\s*/, '').trim() : undefined;
    return { title, tags: [], body: raw };
  }

  const fm = match[1];
  const body = match[2];
  let title: string | undefined;
  let tags: string[] = [];

  for (const line of fm.split('\n')) {
    const titleMatch = line.match(/^title:\s*(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    const tagsMatch = line.match(/^tags:\s*(.+)$/i);
    if (!tagsMatch) continue;
    const val = tagsMatch[1].trim();
    if (val.startsWith('[')) {
      tags = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      tags = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!title) {
    const first = body.split('\n').find((l) => l.trim().length > 0) ?? '';
    if (first.startsWith('#')) title = first.replace(/^#\s*/, '').trim();
  }

  return { title, tags, body };
}
