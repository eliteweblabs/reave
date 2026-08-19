/**
 * GET    /api/documents/:slug — read a template's full markdown.
 * PUT    /api/documents/:slug — overwrite a template { content }.
 * DELETE /api/documents/:slug — delete a template.
 */
import type { APIRoute } from 'astro';
import { writeFileSync, unlinkSync } from 'fs';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { documentVisibleOnThisInstall, findDocumentFile } from '../../../lib/documentPacks';

export const prerender = false;

const SAFE_SLUG_RE = /^[a-z0-9_-]+$/i;

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const { slug } = context.params;
  if (!slug || !SAFE_SLUG_RE.test(slug)) return new Response('Bad Request', { status: 400 });
  const file = findDocumentFile(slug);
  if (!file || !(await documentVisibleOnThisInstall(file.markdown))) {
    return new Response('Not Found', { status: 404 });
  }
  try {
    return new Response(JSON.stringify({ slug, content: file.markdown }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const { slug } = context.params;
  if (!slug || !SAFE_SLUG_RE.test(slug)) return new Response('Bad Request', { status: 400 });
  let body: { content?: unknown; html?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const content = typeof body.content === 'string' ? body.content : body.html;
  if (typeof content !== 'string') return new Response('Bad Request', { status: 400 });
  const file = findDocumentFile(slug);
  if (!file || !(await documentVisibleOnThisInstall(file.markdown))) {
    return new Response('Not Found', { status: 404 });
  }
  try {
    writeFileSync(file.abs, content, 'utf8');
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

export const DELETE: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const { slug } = context.params;
  if (!slug || !SAFE_SLUG_RE.test(slug)) return new Response('Bad Request', { status: 400 });
  const file = findDocumentFile(slug);
  if (!file || !(await documentVisibleOnThisInstall(file.markdown))) {
    return new Response('Not Found', { status: 404 });
  }
  try {
    unlinkSync(file.abs);
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
