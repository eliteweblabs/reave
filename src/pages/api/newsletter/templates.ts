/**
 * GET /api/newsletter/templates — list available templates (metadata only).
 */
import type { APIContext } from 'astro';
import { listNewsletterTemplates, newsletterTemplateMeta } from '../../../lib/newsletterTemplates';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const templates = listNewsletterTemplates().map(newsletterTemplateMeta);
  return jsonResponse({ ok: true, templates });
}
