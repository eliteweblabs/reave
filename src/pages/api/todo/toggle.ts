/**
 * POST /api/todo/toggle — toggle a GFM checkbox in a todo markdown file.
 *
 * Body: { slug: string, lineIndex: number, checked: boolean }
 * Response: { ok: true } or error
 *
 * Note: writes happen in-place on the filesystem. On Railway, changes persist
 * until the next deploy (which ships the committed state of the file).
 * Commit the file after checking off important items to make it permanent.
 */
import type { APIRoute } from 'astro';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export const prerender = false;

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
  return process.env.TODO_DIR?.trim() || join(projectRoot(), 'src', 'knowledge', 'todo');
}

const ITEM_RE = /^- \[([ xX])\] /;
const SAFE_SLUG_RE = /^[a-z0-9_-]+$/i;

export const POST: APIRoute = async ({ request }) => {
  let body: { slug?: unknown; lineIndex?: unknown; checked?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { slug, lineIndex, checked } = body;

  if (
    typeof slug !== 'string' ||
    typeof lineIndex !== 'number' ||
    typeof checked !== 'boolean' ||
    !SAFE_SLUG_RE.test(slug)
  ) {
    return new Response('Bad Request', { status: 400 });
  }

  const dir = todoDir();
  const filePath = join(dir, `${slug}.md`);

  if (!existsSync(filePath)) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    if (lineIndex < 0 || lineIndex >= lines.length) {
      return new Response('Line out of range', { status: 400 });
    }

    const line = lines[lineIndex];
    if (!ITEM_RE.test(line)) {
      return new Response('Line is not a checkbox item', { status: 400 });
    }

    lines[lineIndex] = checked
      ? line.replace('[ ]', '[x]')
      : line.replace(/\[x\]/i, '[ ]');

    writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.info('[todo] toggled', { slug, lineIndex, checked });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[todo] toggle error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
