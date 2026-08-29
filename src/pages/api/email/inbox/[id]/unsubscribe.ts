/**
 * POST /api/email/inbox/[id]/unsubscribe — RFC 8058 one-click unsubscribe for an inbound message.
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox } from '../../../../../lib/emailInboxStore';
import { parseEmailUnsubscribe, performEmailUnsubscribe, hasListUnsubscribeHeader } from '../../../../../lib/emailUnsubscribe';
import { fetchResendInboundEmailHeaders } from '../../../../../lib/resendInboundEmail';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let headers = event.headers;
  if (!hasListUnsubscribeHeader(headers) && event.resendEmailId) {
    const fresh = await fetchResendInboundEmailHeaders(event.resendEmailId);
    if (Object.keys(fresh).length) headers = { ...headers, ...fresh };
  }

  const unsubscribe = parseEmailUnsubscribe(headers);
  if (!unsubscribe.available) {
    return jsonResponse(
      { ok: false, error: 'This message does not include an unsubscribe link.' },
      400,
    );
  }

  const result = await performEmailUnsubscribe(headers);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || 'Unsubscribe failed.' }, 502);
  }

  return jsonResponse({ ok: true });
}
