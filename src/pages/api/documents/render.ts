/**
 * POST /api/documents/render — render markdown to HTML for admin preview.
 */
import type { APIRoute } from 'astro';
import type { ContactRecord } from '../../../lib/contactApi';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { fillTemplate, renderFilledDocumentHtml } from '../../../lib/documentTemplates';
import { parseDocumentLayout, wrapPrintPreviewDocument } from '../../../lib/documentPrintLayout';

export const prerender = false;

/** Sample contact so one-pager View mode shows filled shortcodes. */
const PREVIEW_CONTACT: ContactRecord = {
  uid: 'preview',
  name: 'Jordan Hale',
  firstName: 'Jordan',
  lastName: 'Hale',
  email: 'jordan@example.com',
  phone: '(555) 010-0148',
  company: 'Hale & Co.',
};

export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: { content?: unknown };
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
    const layout = parseDocumentLayout(content);
    const source =
      layout.layout === 'onepager' ? fillTemplate(content, PREVIEW_CONTACT, company) : content;
    const html = await renderFilledDocumentHtml(source, company);
    const previewHtml =
      layout.layout === 'onepager' ? wrapPrintPreviewDocument(html, layout.orientation) : html;
    return new Response(JSON.stringify({ html: previewHtml }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
