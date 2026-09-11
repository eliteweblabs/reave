/**
 * POST /api/share/preview — render branded portal share email without sending.
 * Body: { recipient?, url?, message?, jobSlug?, tab? }
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { previewPortalShareEmail } from '../../../lib/shareDelivery';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const recipientRaw =
    body.recipient && typeof body.recipient === 'object'
      ? (body.recipient as Record<string, unknown>)
      : {};
  const recipient = {
    contactUid:
      typeof recipientRaw.contactUid === 'string' ? recipientRaw.contactUid.trim() : undefined,
    name: typeof recipientRaw.name === 'string' ? recipientRaw.name.trim() : undefined,
    email: typeof recipientRaw.email === 'string' ? recipientRaw.email.trim() : undefined,
    phone: typeof recipientRaw.phone === 'string' ? recipientRaw.phone.trim() : undefined,
  };

  const result = await previewPortalShareEmail({
    recipient,
    url: typeof body.url === 'string' ? body.url.trim() : undefined,
    message: typeof body.message === 'string' ? body.message.trim() : undefined,
    jobSlug: typeof body.jobSlug === 'string' ? body.jobSlug.trim() : undefined,
    tab: typeof body.tab === 'string' ? body.tab.trim() : undefined,
    request: context.request,
  });

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({
    ok: true,
    subject: result.subject,
    html: result.html,
    text: result.text,
  });
}
