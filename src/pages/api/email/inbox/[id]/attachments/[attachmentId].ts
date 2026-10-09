/**
 * GET /api/email/inbox/[id]/attachments/[attachmentId]
 * Proxies a Resend inbound attachment download (auth required).
 */

import type { APIContext } from 'astro';
import { Resend } from 'resend';
import { storeGetEmailInbox } from '../../../../../../lib/emailInboxStore';
import { serverEnv } from '../../../../../../lib/serverEnv';
import { requireDashboardUser } from '../../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../../lib/apiResponse';
import {
  loadResendInboundAttachmentBytes,
  resendInboundAttachmentContentType,
  resendInboundAttachmentFilename,
  unwrapResendInboundAttachmentRecord,
} from '../../../../../../lib/emailAttachments';
import { projectFileResponseHeaders } from '../../../../../../lib/projectFiles';
import { sanitizeContentDispositionFilename } from '../../../../../../lib/sanitizeFilename';

export const prerender = false;

function forcedDownloadDisposition(filename: string): string {
  const ascii =
    filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'attachment';
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const emailId = context.params.id?.trim();
  const attachmentId = context.params.attachmentId?.trim();
  if (!emailId || !attachmentId) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(emailId);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const meta = (event.attachments ?? []).find((a) => a.id === attachmentId);
  const resendEmailId = event.resendEmailId?.trim();
  if (!resendEmailId) {
    return jsonResponse({ ok: false, error: 'No Resend email id for this message' }, 404);
  }

  const apiKey = serverEnv('RESEND_API_KEY')?.trim();
  if (!apiKey) return jsonResponse({ ok: false, error: 'RESEND_API_KEY not configured' }, 503);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.receiving.attachments.get({
    emailId: resendEmailId,
    id: attachmentId,
  });
  if (error || !data) {
    console.warn('[email] attachment get failed', { emailId, attachmentId, error });
    return jsonResponse({ ok: false, error: 'Attachment not available' }, 404);
  }

  const record = unwrapResendInboundAttachmentRecord(data);
  if (!record) {
    return jsonResponse({ ok: false, error: 'Attachment not available' }, 404);
  }

  const buffer = await loadResendInboundAttachmentBytes(record);
  if (!buffer) {
    return jsonResponse({ ok: false, error: 'Attachment content unavailable' }, 502);
  }

  const filename =
    meta?.filename ||
    resendInboundAttachmentFilename(record, attachmentId);
  const contentType =
    meta?.contentType ||
    resendInboundAttachmentContentType(record) ||
    'application/octet-stream';

  const forceDownload = context.url.searchParams.get('download') === '1';
  const headers = projectFileResponseHeaders(contentType, filename, buffer.length);
  if (forceDownload) {
    headers['Content-Disposition'] = forcedDownloadDisposition(
      sanitizeContentDispositionFilename(filename),
    );
  }

  return new Response(buffer, { status: 200, headers });
}
