import type { APIContext } from 'astro';
import { getContact, siteBaseUrl } from '../../../../../lib/contactApi';
import { getTemplate } from '../../../../../lib/documentTemplates';
import { deliverShare } from '../../../../../lib/shareDelivery';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/admin/doc/:uid/send  — admin-only.
 * Body: { template: string, channel: 'email' | 'sms' }
 * Sends the client their signing link for the given template over the channel.
 */
export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const uid = context.params.uid ?? '';
  if (!uid) return json({ ok: false, error: 'Missing contact id' }, 400);

  let body: { template?: string; channel?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const template = (body.template ?? '').trim();
  const channel = body.channel === 'sms' ? 'sms' : body.channel === 'email' ? 'email' : null;
  if (!template) return json({ ok: false, error: 'Missing template' }, 400);
  if (!channel) return json({ ok: false, error: 'channel must be "email" or "sms"' }, 400);

  const tmpl = getTemplate(template);
  if (!tmpl) return json({ ok: false, error: 'Unknown document template' }, 404);

  const contactRes = await getContact(uid);
  if (!contactRes.ok) return json({ ok: false, error: contactRes.error }, 404);

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

  if (!result.ok) return json(result, 400);
  return json({ ok: true, channel: result.channel, dest: result.dest });
}
