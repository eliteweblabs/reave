/**
 * Deliver a built admin compose/reply message and log it as outbound.
 */

import { storeGetEmailInbox, storeUpdateEmailInbox } from './emailInboxStore';
import { logOutboundEmailForProject } from './logOutboundEmailForProject';
import type { AdminComposeMail } from './adminComposeEmail';
import { sendEmail } from './outbound';

export type DeliverAdminComposeResult =
  | { ok: true; id?: string; routed: boolean; inReplyToEmailId: string | null }
  | { ok: false; error: string };

export async function deliverAdminComposeMail(
  mail: AdminComposeMail,
  userId: string | null,
): Promise<DeliverAdminComposeResult> {
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
  if (!result.ok) return { ok: false, error: result.error };

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

  return {
    ok: true,
    id: result.id,
    routed,
    inReplyToEmailId: mail.inReplyToEmailId,
  };
}
