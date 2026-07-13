/**
 * Repository knowledge: markdown playbooks shipped with the server bundle (Vite eager ?raw).
 * Slug = filename without `.md` under `src/knowledge/` (top-level only).
 * Plugin docs live under `plugins/<feature_id>/`; client notes live in Postgres.
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
