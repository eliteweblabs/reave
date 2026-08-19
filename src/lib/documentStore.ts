/**
 * Markdown document templates on disk (src/documents/*.md).
 * Same persistence model as knowledge files: writes survive until redeploy.
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { titleFromDocumentMarkdown } from './documentTemplates';

export const DOCUMENT_SLUG_RE = /^[a-z0-9_-]+$/i;

export type DocumentFileSummary = {
  slug: string;
  title: string;
};

export type DocumentFileDoc = DocumentFileSummary & {
  content: string;
};

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

export function documentsDir(): string {
  return join(projectRoot(), 'src', 'documents');
}

export function isSafeDocumentSlug(slug: string): boolean {
  return DOCUMENT_SLUG_RE.test(slug);
}

export function fileListDocuments(): DocumentFileSummary[] {
  const dir = documentsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/i, '');
      const content = readFileSync(join(dir, f), 'utf8');
      return { slug, title: titleFromDocumentMarkdown(content, slug) };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function fileReadDocument(slug: string): DocumentFileDoc | null {
  if (!isSafeDocumentSlug(slug)) return null;
  const filePath = join(documentsDir(), `${slug}.md`);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  return { slug, title: titleFromDocumentMarkdown(content, slug), content };
}
