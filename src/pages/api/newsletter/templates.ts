/**
 * GET /api/newsletter/templates — list available templates (metadata only).
 */
import type { APIContext } from 'astro';
import { listNewsletterTemplates, newsletterTemplateMeta } from '../../../lib/newsletterTemplates';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const templates = listNewsletterTemplates().map(newsletterTemplateMeta);
  return json({ ok: true, templates });
}
