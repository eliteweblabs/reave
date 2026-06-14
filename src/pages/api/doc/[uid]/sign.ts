import type { APIRoute } from 'astro';
import { getContact, extractPortal, setContactPortal, type PortalDocument } from '../../../../lib/contactApi';
import { getTemplate, fillTemplate } from '../../../../lib/documentTemplates';
import { siteBaseUrl } from '../../../../lib/contactApi';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const uid = (params.uid ?? '').trim();
  if (!uid) return err(400, 'Missing uid');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, 'Invalid JSON');
  }

  const raw = body as Record<string, unknown>;
  const templateSlug = typeof raw.template === 'string' ? raw.template.trim() : '';
  const signerName = typeof raw.signerName === 'string' ? raw.signerName.trim() : '';

  if (!templateSlug) return err(400, 'Missing template');
  if (signerName.length < 2) return err(400, 'signerName must be at least 2 characters');

  const tmpl = getTemplate(templateSlug);
  if (!tmpl) return err(400, `Unknown template "${templateSlug}"`);

  const contactRes = await getContact(uid);
  if (!contactRes.ok) return err(404, 'Contact not found');
  if (contactRes.data.archived) return err(404, 'Contact not found');

  const portal = extractPortal(contactRes.data) ?? {};
  if (portal.enabled === false) return err(404, 'Contact not found');

  const filledHtml = fillTemplate(tmpl.html, contactRes.data);

  const docId = crypto.randomUUID();
  const signedAt = new Date().toISOString();

  const doc: PortalDocument = {
    id: docId,
    template: templateSlug,
    title: tmpl.title,
    signedAt,
    signerName,
    content: filledHtml,
  };

  const merged = {
    ...portal,
    documents: [...(portal.documents ?? []), doc],
  };

  const saveRes = await setContactPortal(uid, merged);
  if (!saveRes.ok) return err(502, saveRes.error);

  const viewUrl = `${siteBaseUrl()}/doc/${encodeURIComponent(uid)}/view/${docId}`;

  return new Response(
    JSON.stringify({ ok: true, docId, viewUrl }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

function err(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
