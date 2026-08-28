/**
 * GET /api/email/sent/:id/attachments/:attachmentId
 * Proxies a Resend sent-email attachment download (auth required).
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../../../lib/dashboardAuth';
import { downloadResendSentAttachment } from '../../../../../../lib/resendSentEmail';
import { getOutboundEmail } from '../../../../../../lib/projectOutboundEmail';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function safeContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'attachment';
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const emailId = context.params.id?.trim();
  const attachmentId = context.params.attachmentId?.trim();
  if (!emailId || !attachmentId) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await getOutboundEmail(emailId);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);

  const resendId = event.resendId?.trim();
  if (!resendId) return json({ ok: false, error: 'No Resend email id for this message' }, 404);

  const downloaded = await downloadResendSentAttachment(resendId, attachmentId);
  if (!downloaded) return json({ ok: false, error: 'Attachment not available' }, 404);

  return new Response(new Uint8Array(downloaded.bytes), {
    status: 200,
    headers: {
      'Content-Type': downloaded.contentType,
      'Content-Disposition': safeContentDisposition(downloaded.filename),
      'Content-Length': String(downloaded.bytes.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
