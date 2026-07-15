/**
 * GET  /api/documents — list all HTML document templates.
 * POST /api/documents — create a new template { slug, html }.
 *
 * Templates live in src/documents/*.html.
 * On Railway, writes persist until the next deploy.
 */
import type { APIRoute } from 'astro';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

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

function docsDir(): string {
  return join(projectRoot(), 'src', 'content', 'documents');
}

const SAFE_SLUG_RE = /^[a-z0-9_-]+$/i;

function titleFromHtml(html: string, slug: string): string {
  const m = html.match(/<!--\s*title:\s*(.+?)\s*-->/i);
  if (m) return m[1].trim();
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const GET: APIRoute = async () => {
  const dir = docsDir();
  if (!existsSync(dir)) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
    const templates = files.map((f) => {
      const slug = f.replace(/\.html$/, '');
      const html = readFileSync(join(dir, f), 'utf8');
      return { slug, title: titleFromHtml(html, slug) };
    });
    return new Response(JSON.stringify(templates), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[documents] GET error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: { slug?: unknown; html?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const { slug, html } = body;
  if (typeof slug !== 'string' || typeof html !== 'string' || !SAFE_SLUG_RE.test(slug)) {
    return new Response('Bad Request', { status: 400 });
  }
  const dir = docsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${slug}.html`);
  if (existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'Template already exists' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    writeFileSync(filePath, html, 'utf8');
    console.info('[documents] created', slug);
    return new Response(JSON.stringify({ ok: true, slug }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[documents] POST error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
