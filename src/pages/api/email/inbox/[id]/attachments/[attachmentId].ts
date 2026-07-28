/**
 * GET /api/email/inbox/[id]/attachments/[attachmentId]
 * Proxies a Resend inbound attachment download (auth required).
 */

import type { APIContext } from 'astro';
import { Resend } from 'resend';
import { storeGetEmailInbox } from '../../../../../../lib/emailInboxStore';
import { serverEnv } from '../../../../../../lib/serverEnv';
import { requireDashboardUser } from '../../../../../../lib/dashboardAuth';

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
  const { userId } = auth;

  const emailId = context.params.id?.trim();
  const attachmentId = context.params.attachmentId?.trim();
  if (!emailId || !attachmentId) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(emailId);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);

  const meta = (event.attachments ?? []).find((a) => a.id === attachmentId);
  const resendEmailId = event.resendEmailId?.trim();
  if (!resendEmailId) {
    return json({ ok: false, error: 'No Resend email id for this message' }, 404);
  }

  const apiKey = serverEnv('RESEND_API_KEY')?.trim();
  if (!apiKey) return json({ ok: false, error: 'RESEND_API_KEY not configured' }, 503);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.receiving.attachments.get({
    emailId: resendEmailId,
    id: attachmentId,
  });
  if (error || !data) {
    console.warn('[email] attachment get failed', { emailId, attachmentId, error });
    return json({ ok: false, error: 'Attachment not available' }, 404);
  }

  const downloadUrl = String(
    (data as { download_url?: string; downloadUrl?: string }).download_url ??
      (data as { downloadUrl?: string }).downloadUrl ??
      '',
  ).trim();
  if (!downloadUrl) return json({ ok: false, error: 'No download URL' }, 404);

  let upstream: Response;
  try {
    upstream = await fetch(downloadUrl);
  } catch (e) {
    console.warn('[email] attachment fetch failed', e);
    return json({ ok: false, error: 'Download failed' }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    return json({ ok: false, error: `Download failed (${upstream.status})` }, 502);
  }

  const filename =
    meta?.filename ||
    String((data as { filename?: string }).filename ?? '').trim() ||
    `attachment-${attachmentId}`;
  const contentType =
    meta?.contentType ||
    String(
      (data as { content_type?: string; contentType?: string }).content_type ??
        (data as { contentType?: string }).contentType ??
        '',
    ).trim() ||
    upstream.headers.get('content-type') ||
    'application/octet-stream';

  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': safeContentDisposition(filename),
    'Cache-Control': 'private, no-store',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);

  return new Response(upstream.body, { status: 200, headers });
}
