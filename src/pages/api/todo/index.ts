/**
 * GET /api/todo — list all todo markdown files and their parsed checkbox items.
 *
 * Files live in src/data/todos/*.md (one file = one accordion section).
 * Each file must have a # H1 heading (accordion title) and GFM checkboxes:
 *   - [ ] unchecked item
 *   - [x] checked item
 *
 * Override the directory with TODO_DIR env var.
 */
import type { APIRoute } from 'astro';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, existsSync } from 'fs';

export const prerender = false;

/** Walk up from this compiled file until we find a package.json — that's the project root. */
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

function todoDir(): string {
  return process.env.TODO_DIR?.trim() || join(projectRoot(), 'src', 'data', 'todos');
}

const ITEM_RE = /^- \[([ xX])\] (.+)$/;

interface TodoItem {
  lineIndex: number;
  text: string;
  checked: boolean;
}

interface TodoSection {
  slug: string;
  title: string;
  description: string;
  items: TodoItem[];
}

function parseFile(slug: string, content: string): TodoSection {
  const lines = content.split('\n');
  let title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const descLines: string[] = [];
  const items: TodoItem[] = [];

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

export const GET: APIRoute = async () => {
  const dir = todoDir();

  if (!existsSync(dir)) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort();

    const sections: TodoSection[] = files.map((filename) => {
      const slug = filename.replace(/\.md$/, '');
      const content = readFileSync(join(dir, filename), 'utf8');
      return parseFile(slug, content);
    });

    return new Response(JSON.stringify(sections), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[todo] GET error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
