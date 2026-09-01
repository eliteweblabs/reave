/**
 * Parse one-time todo seed files from seeds/todos/*.md (reave.app product backlog).
 * Seeded into Postgres once via pgTodos; not live company to-do data.
 */

import { join } from 'path';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { projectRoot } from './projectRoot';

const ITEM_RE = /^- \[([ xX])\] (.+)$/;

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

function todoSeedDir(): string {
  return process.env.TODO_SEED_DIR?.trim() || join(projectRoot(), 'seeds', 'todos');
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
  const dir = todoSeedDir();
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
