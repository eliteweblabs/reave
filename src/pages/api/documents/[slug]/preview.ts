/**
 * GET /api/documents/:slug/preview — render a stored template for chat/admin review.
 */
import type { APIRoute } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { fileReadDocument, isSafeDocumentSlug } from '../../../../lib/documentStore';
import { buildDocumentPreviewHtml, resolvePreviewContact } from '../../../../lib/documentTemplates';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const { slug } = context.params;
  if (!slug || !isSafeDocumentSlug(slug)) return new Response('Bad Request', { status: 400 });

  const doc = fileReadDocument(slug);
  if (!doc) return new Response(JSON.stringify({ error: 'Document template not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const company = await getCompanyConfig(context.request);
    const contactUid = new URL(context.request.url).searchParams.get('contact_uid') ?? undefined;
    const contact = await resolvePreviewContact(contactUid);
    const preview = await buildDocumentPreviewHtml({
      markdown: doc.content,
      slug: doc.slug,
      company,
      contact,
    });
    return new Response(
      JSON.stringify({
        slug: doc.slug,
        title: preview.title || doc.title,
        layout: preview.layout,
        orientation: preview.orientation,
        contact: { uid: contact.uid, name: contact.name },
        html: preview.html,
      }),
      {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
