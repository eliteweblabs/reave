/**
 * Markdown knowledge files for the bot (src/knowledge/*.md, top-level only).
 * Same persistence model as todo / documents: writes survive until redeploy.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

export interface KnowledgeFileSummary {
  slug: string;
  title: string;
}

export interface KnowledgeFileDoc extends KnowledgeFileSummary {
  content: string;
}

const SAFE_SLUG_RE = /^[a-z0-9._-]+$/i;

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

export function knowledgeDir(): string {
  return process.env.KNOWLEDGE_DIR?.trim() || join(projectRoot(), 'src', 'knowledge');
}

export function isSafeKnowledgeSlug(slug: string): boolean {
  return SAFE_SLUG_RE.test(slug);
}

export function titleFromMarkdown(content: string, slug: string): string {
  const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const fromHeading = first.replace(/^#\s*/, '').trim();
  if (fromHeading) return fromHeading.slice(0, 200);
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fileListKnowledge(): KnowledgeFileSummary[] {
  const dir = knowledgeDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/i, '');
      const content = readFileSync(join(dir, f), 'utf8');
      return { slug, title: titleFromMarkdown(content, slug) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function fileReadKnowledge(slug: string): KnowledgeFileDoc | null {
  if (!isSafeKnowledgeSlug(slug)) return null;
  const path = join(knowledgeDir(), `${slug}.md`);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  return { slug, title: titleFromMarkdown(content, slug), content };
}

export function fileWriteKnowledge(slug: string, content: string): KnowledgeFileDoc | null {
  if (!isSafeKnowledgeSlug(slug) || !content.trim()) return null;
  const path = join(knowledgeDir(), `${slug}.md`);
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  return fileReadKnowledge(slug);
}

export function fileDeleteKnowledge(slug: string): boolean {
  if (!isSafeKnowledgeSlug(slug)) return false;
  const path = join(knowledgeDir(), `${slug}.md`);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
