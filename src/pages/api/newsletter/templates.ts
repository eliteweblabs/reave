/**
 * GET /api/newsletter/templates — list available templates (metadata only).
 */
import type { APIContext } from 'astro';
import { listNewsletterTemplates, newsletterTemplateMeta } from '../../../lib/newsletterTemplates';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const templates = listNewsletterTemplates().map(newsletterTemplateMeta);
  return json({ ok: true, templates });
}
