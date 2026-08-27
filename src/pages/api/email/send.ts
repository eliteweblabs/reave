/**
 * POST /api/email/send — send outbound mail from the admin compose UI (Resend).
 */

import type { APIContext } from 'astro';
import { buildAdminComposeEmail } from '../../../lib/adminComposeEmail';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../lib/emailInboxStore';
import { logOutboundEmailForProject } from '../../../lib/logOutboundEmailForProject';
import { isEmailSendConfigured, sendEmail } from '../../../lib/outbound';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!isEmailSendConfigured()) {
    return json({ ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const built = await buildAdminComposeEmail(body, { userId, context });
  if (!built.ok) return json({ ok: false, success: false, error: built.error }, built.status);
  const mail = built.mail;

  const result = await sendEmail({
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    cc: mail.cc,
    bcc: mail.bcc,
    from: mail.from,
    headers: mail.headers,
    attachments: mail.attachments,
  });
  if (!result.ok) return json({ ok: false, success: false, error: result.error }, 502);

  for (const toEmail of mail.to) {
    void logOutboundEmailForProject({
      toEmail,
      subject: mail.subject,
      resendId: result.id,
      sentBy: userId,
      source: mail.inReplyToEmailId ? 'admin_reply' : 'admin_compose',
      jobSlug: mail.jobSlug,
      contactUid: mail.contactUid,
      bodyText: mail.text,
      bodyHtml: mail.html ?? null,
    });
  }

  let routed = false;
  if (mail.inReplyToEmailId) {
    const existing = await storeGetEmailInbox(mail.inReplyToEmailId);
    if (existing) {
      const updated = await storeUpdateEmailInbox(mail.inReplyToEmailId, {
        action: 'filed',
        status: 'FILED',
        ...(existing.category === 'review' ? { category: 'internal' } : {}),
      });
      routed = Boolean(updated);
    }
  }

  return json({
    ok: true,
    success: true,
    id: result.id,
    routed,
    inReplyToEmailId: mail.inReplyToEmailId,
  });
}
