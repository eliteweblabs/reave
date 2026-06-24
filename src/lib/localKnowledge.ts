/**
 * Markdown knowledge files shipped with the server bundle (Vite eager ?raw).
 * Slug = filename without `.md` under `src/knowledge/` (top-level only).
 * Job files in `src/knowledge/jobs/` are excluded — loaded on demand via workStore.
 */

const rawByPath = import.meta.glob<string>('../knowledge/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function pathToSlug(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

export function listKnowledgeSlugs(): string[] {
  return Object.keys(rawByPath)
    .map(pathToSlug)
    .sort((a, b) => a.localeCompare(b));
}

export function readKnowledgeMarkdown(slug: string): { slug: string; content: string } | null {
  const key = Object.keys(rawByPath).find((p) => pathToSlug(p) === slug) ?? null;
  if (!key) return null;
  return { slug, content: rawByPath[key] ?? '' };
}

export function summarizeKnowledgeIndex(): { slug: string; preview: string }[] {
  return listKnowledgeSlugs().map((slug) => {
    const row = readKnowledgeMarkdown(slug);
    const first = (row?.content ?? '').split('\n').find((l) => l.trim().length > 0) ?? '';
    const preview = first.replace(/^#\s*/, '').slice(0, 120);
    return { slug, preview };
  });
}
