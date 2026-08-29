import type { APIContext } from 'astro';
import { getContact, siteBaseUrl } from '../../../../../lib/contactApi';
import { getTemplate } from '../../../../../lib/documentTemplates';
import { deliverShare } from '../../../../../lib/shareDelivery';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;


/**
 * POST /api/admin/doc/:uid/send  — admin-only.
 * Body: { template: string, channel: 'email' | 'sms' }
 * Sends the client their filled-document link for the given template.
 * Digital Signature installs get sign-page copy; documents-only gets review copy.
 */
export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const uid = context.params.uid ?? '';
  if (!uid) return jsonResponse({ ok: false, error: 'Missing contact id' }, 400);

  let body: { template?: string; channel?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const template = (body.template ?? '').trim();
  const channel = body.channel === 'sms' ? 'sms' : body.channel === 'email' ? 'email' : null;
  if (!template) return jsonResponse({ ok: false, error: 'Missing template' }, 400);
  if (!channel) return jsonResponse({ ok: false, error: 'channel must be "email" or "sms"' }, 400);

  const tmpl = getTemplate(template);
  if (!tmpl) return jsonResponse({ ok: false, error: 'Unknown document template' }, 404);

  const contactRes = await getContact(uid);
  if (!contactRes.ok) return jsonResponse({ ok: false, error: contactRes.error }, 404);

  const docUrl = `${siteBaseUrl(context.request)}/doc/${encodeURIComponent(uid)}/${encodeURIComponent(template)}`;
  const result = await deliverShare({
    kind: 'document',
    channel,
    recipient: { contactUid: uid },
    url: docUrl,
    template,
    docTitle: tmpl.title,
    sentBy: userId,
    request: context.request,
    source: 'admin_doc_send',
  });

  if (!result.ok) return jsonResponse(result, 400);
  return jsonResponse({ ok: true, channel: result.channel, dest: result.dest });
}
