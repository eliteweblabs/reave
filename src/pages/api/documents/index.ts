/**
 * GET  /api/documents — list all markdown document templates.
 * POST /api/documents — create a new template { slug, content }.
 *
 * Templates live in src/documents/ (including industry packs).
 * On Railway, writes persist until the next deploy.
 */
import type { APIRoute } from 'astro';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  documentMatchesInstall,
  documentsDir,
  findDocumentFile,
  installFromGate,
  listDocumentFiles,
  parseDocumentPackMeta,
} from '../../../lib/documentPacks';
import { titleFromDocumentMarkdown } from '../../../lib/documentTemplates';
import { getPracticeGate } from '../../../lib/practiceGate';

export const prerender = false;

const SAFE_SLUG_RE = /^[a-z0-9_-]+$/i;

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const install = installFromGate(await getPracticeGate());
    const templates = [];
    for (const file of listDocumentFiles()) {
      if (!documentMatchesInstall(parseDocumentPackMeta(file.markdown), install)) continue;
      templates.push({ slug: file.slug, title: titleFromDocumentMarkdown(file.markdown, file.slug) });
    }
    templates.sort((a, b) => a.title.localeCompare(b.title));
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
  if (findDocumentFile(slug)) {
    return new Response(JSON.stringify({ error: 'Template already exists' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const dir = documentsDir();
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
