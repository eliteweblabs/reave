/**
 * POST /api/documents/render — render markdown to HTML for admin preview.
 */
import type { APIRoute } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { buildDocumentPreviewHtml, resolvePreviewContact } from '../../../lib/documentTemplates';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: { content?: unknown; contact_uid?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content : '';
  if (!content.trim()) {
    return new Response(JSON.stringify({ error: 'content is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const company = await getCompanyConfig(context.request);
    const contactUid = typeof body.contact_uid === 'string' ? body.contact_uid : undefined;
    const contact = await resolvePreviewContact(contactUid);
    const preview = await buildDocumentPreviewHtml({ markdown: content, company, contact });
    return new Response(JSON.stringify({ html: preview.html }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
