/**
 * GET /api/email/sent/:id — full outbound message (stored body, or Resend fallback).
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { normalizeEmailBody, normalizeSentEmailHtml, plainTextForDisplay, resolveSentEmailHtmlForDisplay } from '../../../../lib/emailBody';
import { htmlHasCidImages } from '../../../../lib/emailComposeImages';
import { parseSenderEmail } from '../../../../lib/emailAddress';
import { resendSendBelongsToInstall } from '../../../../lib/installOutboundEmail';
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

  let event = await getOutboundEmail(id);
  let bodyText = event?.bodyText ?? '';
  let bodyHtml = event?.bodyHtml ?? '';

  const resendKey = (event?.resendId || id).trim();
  if (!event && resendKey) {
    const fetched = await fetchResendSentEmail(resendKey);
    if (fetched && (await resendSendBelongsToInstall(fetched.from))) {
      const toEmail = fetched.to ? parseSenderEmail(fetched.to) : '';
      event = {
        id: resendKey,
        jobSlug: '',
        jobTitle: '',
        contactUid: null,
        toEmail: toEmail.includes('@') ? toEmail : '',
        subject: fetched.subject?.trim() || '',
        resendId: resendKey,
        sentAt: fetched.createdAt || new Date().toISOString(),
        sentBy: null,
        source: 'resend_sync',
        bodyText: null,
        bodyHtml: null,
      };
      bodyText = normalizeEmailBody(fetched.text, fetched.html);
      bodyHtml = normalizeSentEmailHtml(fetched.text, fetched.html);
    }
  }

  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);

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
