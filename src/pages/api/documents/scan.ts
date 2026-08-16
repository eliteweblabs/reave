/**
 * POST /api/documents/scan — replace literal dates, emails, phones, and
 * known fill values in a template with shortcodes.
 */
import type { APIRoute } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { getCompanyConfig } from '../../../lib/companyConfig';
import {
  PREVIEW_CONTACT,
  scanMarkdownForShortcodes,
  shortcodeExamples,
} from '../../../lib/documentTemplates';

export const prerender = false;

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
    const examples = shortcodeExamples(PREVIEW_CONTACT, company);
    const result = scanMarkdownForShortcodes(content, examples);
    return new Response(JSON.stringify({ content: result.markdown, hits: result.hits }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
