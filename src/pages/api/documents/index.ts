/**
 * GET  /api/documents — list all markdown document templates.
 * POST /api/documents — create a new template { slug, content }.
 *
 * Templates live in src/documents/*.md.
 * On Railway, writes persist until the next deploy.
 */
import type { APIRoute } from 'astro';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { titleFromDocumentMarkdown } from '../../../lib/documentTemplates';

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
  return join(projectRoot(), 'src', 'documents');
}

const SAFE_SLUG_RE = /^[a-z0-9_-]+$/i;

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const dir = docsDir();
  if (!existsSync(dir)) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    const templates = files.map((f) => {
      const slug = f.replace(/\.md$/, '');
      const content = readFileSync(join(dir, f), 'utf8');
      return { slug, title: titleFromDocumentMarkdown(content, slug) };
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

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: { slug?: unknown; content?: unknown; html?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const { slug } = body;
  const content = typeof body.content === 'string' ? body.content : body.html;
  if (typeof slug !== 'string' || typeof content !== 'string' || !SAFE_SLUG_RE.test(slug)) {
    return new Response('Bad Request', { status: 400 });
  }
  const dir = docsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${slug}.md`);
  if (existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'Template already exists' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    writeFileSync(filePath, content, 'utf8');
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
