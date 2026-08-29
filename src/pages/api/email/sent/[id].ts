/**
 * GET /api/email/sent/:id — full outbound message (stored body, or Resend fallback).
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { normalizeEmailBody, normalizeSentEmailHtml, plainTextForDisplay, resolveSentEmailHtmlForDisplay } from '../../../../lib/emailBody';
import { htmlHasCidImages } from '../../../../lib/emailComposeImages';
import {
  getOutboundEmail,
  updateOutboundEmailBodies,
} from '../../../../lib/projectOutboundEmail';
import { fetchResendSentEmail, hydrateSentHtmlCidImages } from '../../../../lib/resendSentEmail';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const event = await getOutboundEmail(id);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let bodyText = event.bodyText ?? '';
  let bodyHtml = event.bodyHtml ?? '';

  if (!bodyText.trim() && !bodyHtml.trim() && event.resendId) {
    const fetched = await fetchResendSentEmail(event.resendId);
    if (fetched) {
      bodyText = normalizeEmailBody(fetched.text, fetched.html);
      bodyHtml = normalizeSentEmailHtml(fetched.text, fetched.html);
    }
  }

  if (htmlHasCidImages(bodyHtml) && event.resendId) {
    const hydrated = await hydrateSentHtmlCidImages(bodyHtml, event.resendId);
    if (hydrated.hydrated) {
      bodyHtml = normalizeSentEmailHtml(bodyText, hydrated.html);
    }
  }

  if (
    (bodyText && bodyText !== (event.bodyText ?? '')) ||
    (bodyHtml && bodyHtml !== (event.bodyHtml ?? ''))
  ) {
    void updateOutboundEmailBodies(event.id, { bodyText, bodyHtml });
  }

  return jsonResponse({
    ok: true,
    event: {
      ...event,
      bodyHtml: resolveSentEmailHtmlForDisplay(bodyHtml, bodyText),
      bodyText: plainTextForDisplay(bodyText),
    },
  });
}
