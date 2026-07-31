/**
 * POST /api/documents/render — render markdown to HTML for admin preview.
 */
import type { APIRoute } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { renderDocumentMarkdown } from '../../../lib/renderDocumentMarkdown';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = requireDashboardUser(context);
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
    const html = await renderDocumentMarkdown(content);
    return new Response(JSON.stringify({ html }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
