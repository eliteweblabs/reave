/**
 * GET    /api/documents/:slug — read a template's full HTML.
 * PUT    /api/documents/:slug — overwrite a template { html }.
 * DELETE /api/documents/:slug — delete a template.
 */
import type { APIRoute } from 'astro';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';

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

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug || !SAFE_SLUG_RE.test(slug)) return new Response('Bad Request', { status: 400 });
  const filePath = join(docsDir(), `${slug}.html`);
  if (!existsSync(filePath)) return new Response('Not Found', { status: 404 });
  try {
    const html = readFileSync(filePath, 'utf8');
    return new Response(JSON.stringify({ slug, html }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  const { slug } = params;
  if (!slug || !SAFE_SLUG_RE.test(slug)) return new Response('Bad Request', { status: 400 });
  let body: { html?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const { html } = body;
  if (typeof html !== 'string') return new Response('Bad Request', { status: 400 });
  const filePath = join(docsDir(), `${slug}.html`);
  if (!existsSync(filePath)) return new Response('Not Found', { status: 404 });
  try {
    writeFileSync(filePath, html, 'utf8');
    console.info('[documents] updated', slug);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug || !SAFE_SLUG_RE.test(slug)) return new Response('Bad Request', { status: 400 });
  const filePath = join(docsDir(), `${slug}.html`);
  if (!existsSync(filePath)) return new Response('Not Found', { status: 404 });
  try {
    unlinkSync(filePath);
    console.info('[documents] deleted', slug);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
