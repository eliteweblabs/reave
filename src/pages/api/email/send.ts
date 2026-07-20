/**
 * POST /api/email/send — send outbound mail from the admin compose UI (Resend).
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../lib/emailInboxStore';
import { buildReplyEmailHeaders } from '../../../lib/emailReply';
import { brandedPlainTextEmail } from '../../../lib/inboundEmailReply';
import { logOutboundEmailForProject } from '../../../lib/logOutboundEmailForProject';
import { isEmailSendConfigured, sendEmail } from '../../../lib/outbound';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!isEmailSendConfigured()) {
    return json({ ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const normalizeList = (raw: unknown): string[] => {
    if (Array.isArray(raw)) {
      return raw.map((v) => String(v).trim()).filter(Boolean);
    }
    return String(raw ?? '')
      .split(/[,;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const to = normalizeList(body.to);
  const subject = String(body.subject ?? '').trim();
  const html = String(body.html ?? '').trim() || undefined;
  const text = String(body.text ?? body.body ?? '').trim();
  const from = String(body.from ?? '').trim() || undefined;
  const cc = body.cc;
  const bcc = body.bcc;
  const inReplyToEmailId = String(body.inReplyToEmailId ?? body.in_reply_to_email_id ?? '').trim() || null;

  if (!to.length) return json({ ok: false, success: false, error: 'Recipient (to) is required' }, 400);
  if (!subject) return json({ ok: false, success: false, error: 'Subject is required' }, 400);
  if (!text && !html) return json({ ok: false, success: false, error: 'Message body is required' }, 400);

  let jobSlug = String(body.jobSlug ?? body.job_slug ?? '').trim() || null;
  let contactUid = String(body.contactUid ?? body.contact_uid ?? '').trim() || null;
  let replyHeaders: Record<string, string> | undefined;
  let inbound: Awaited<ReturnType<typeof storeGetEmailInbox>> = null;

  if (inReplyToEmailId) {
    inbound = await storeGetEmailInbox(inReplyToEmailId);
    if (!inbound) {
      return json({ ok: false, success: false, error: 'Original message not found' }, 404);
    }
    replyHeaders = buildReplyEmailHeaders(inbound);
    jobSlug = jobSlug || inbound.jobSlug || null;
    contactUid = contactUid || inbound.contactUid || null;
  }

  let sendText = text || html || '';
  let sendHtml = html;

  if (!sendHtml && sendText && !/<[a-z][\s\S]*>/i.test(sendText)) {
    const primaryTo = to[0] || '';
    let firstName =
      inbound?.contactName?.trim().split(/\s+/)[0] ||
      primaryTo.split('@')[0] ||
      'there';
    const wrapped = await brandedPlainTextEmail({ firstName, body: sendText });
    sendText = wrapped.text;
    sendHtml = wrapped.html;
  }

  const result = await sendEmail({
    to,
    subject,
    text: sendText,
    html: sendHtml,
    cc: typeof cc === 'string' || Array.isArray(cc) ? cc : undefined,
    bcc: typeof bcc === 'string' || Array.isArray(bcc) ? bcc : undefined,
    from,
    headers: replyHeaders,
  });
  if (!result.ok) return json({ ok: false, success: false, error: result.error }, 502);

  for (const toEmail of to) {
    void logOutboundEmailForProject({
      toEmail,
      subject,
      resendId: result.id,
      sentBy: userId,
      source: inReplyToEmailId ? 'admin_reply' : 'admin_compose',
      jobSlug,
      contactUid,
    });
  }

  let routed = false;
  if (inReplyToEmailId) {
    const existing = await storeGetEmailInbox(inReplyToEmailId);
    if (existing) {
      const updated = await storeUpdateEmailInbox(inReplyToEmailId, {
        action: 'filed',
        status: 'FILED',
        ...(existing.category === 'review' ? { category: 'internal' } : {}),
      });
      routed = Boolean(updated);
    }
  }

  return json({ ok: true, success: true, id: result.id, routed, inReplyToEmailId });
}
