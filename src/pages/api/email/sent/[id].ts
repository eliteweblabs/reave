/**
 * GET /api/email/sent/:id — full outbound message (stored body, or Resend fallback).
 * Rewrites leftover cid: compose images so the Sent iframe can show them.
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { normalizeEmailBody, normalizeSentEmailHtml, plainTextForDisplay, resolveSentEmailHtmlForDisplay } from '../../../../lib/emailBody';
import {
  getOutboundEmail,
  updateOutboundEmailBodies,
} from '../../../../lib/projectOutboundEmail';
import { fetchResendSentEmail, rewriteSentEmailCidImages } from '../../../../lib/resendSentEmail';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await getOutboundEmail(id);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);

  let bodyText = event.bodyText ?? '';
  let bodyHtml = event.bodyHtml ?? '';

  if (!bodyText.trim() && !bodyHtml.trim() && event.resendId) {
    const fetched = await fetchResendSentEmail(event.resendId);
    if (fetched) {
      bodyText = normalizeEmailBody(fetched.text, fetched.html);
      bodyHtml = normalizeSentEmailHtml(fetched.text, fetched.html);
      if (bodyText || bodyHtml) {
        void updateOutboundEmailBodies(event.id, { bodyText, bodyHtml });
      }
    }
  }

  const displayHtml = resolveSentEmailHtmlForDisplay(bodyHtml, bodyText);
  const rewritten = await rewriteSentEmailCidImages(displayHtml, event.resendId);

  return json({
    ok: true,
    event: {
      ...event,
      bodyHtml: rewritten.html,
      bodyText: plainTextForDisplay(bodyText),
      attachments: rewritten.attachments,
    },
  });
}
