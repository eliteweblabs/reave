/**
 * Parse markdown todo files from src/knowledge/todo/*.md
 */

import { join, dirname } from 'path';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const ITEM_RE = /^- \[([ xX])\] (.+)$/;

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

export interface MarkdownTodoItem {
  lineIndex: number;
  text: string;
  checked: boolean;
}

export interface MarkdownTodoSection {
  slug: string;
  title: string;
  description: string;
  items: MarkdownTodoItem[];
}

function todoDir(): string {
  return process.env.TODO_DIR?.trim() || join(projectRoot(), 'src', 'knowledge', 'todo');
}

function parseFile(slug: string, content: string): MarkdownTodoSection {
  const lines = content.split('\n');
  let title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const descLines: string[] = [];
  const items: MarkdownTodoItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const itemMatch = line.match(ITEM_RE);

    if (itemMatch) {
      items.push({
        lineIndex: i,
        text: itemMatch[2].trim(),
        checked: itemMatch[1].toLowerCase() === 'x',
      });
    } else if (line.startsWith('# ')) {
      title = line.slice(2).trim();
    } else if (!line.startsWith('#') && items.length === 0) {
      const t = line.trim();
      if (t) descLines.push(t);
    }
  }

  return { slug, title, description: descLines.join(' '), items };
}

export function readMarkdownTodoSections(): MarkdownTodoSection[] {
  const dir = todoDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  return files.map((filename) => {
    const slug = filename.replace(/\.md$/, '');
    const content = readFileSync(join(dir, filename), 'utf8');
    return parseFile(slug, content);
  });
}
