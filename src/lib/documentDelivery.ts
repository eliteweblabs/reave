/**
 * Deliver a filled-document link to a client over a specific channel.
 *
 * With Digital Signature on, the email/SMS asks them to review and sign.
 * Documents-only installs send a view/print link — no e-sign language.
 */
import type { ContactRecord } from './contactApi';
import { isEmailSendConfigured, isSmsSendConfigured, sendEmail, sendSms } from './outbound';
import { brandedEmailHtml } from './emailTemplates';
import { hasDigitalSignature } from './features';

export type SendDocumentResult =
  | { ok: true; channel: 'email' | 'sms'; dest: string }
  | { ok: false; error: string };

export async function sendDocumentLink(opts: {
  contact: ContactRecord;
  docUrl: string;
  docTitle: string;
  channel: 'email' | 'sms';
}): Promise<SendDocumentResult> {
  const { contact: c, docUrl, docTitle, channel } = opts;
  const firstName = (c.firstName || c.name || '').split(/\s+/)[0] || 'there';

  const forSigning = hasDigitalSignature();

  if (channel === 'email') {
    if (!isEmailSendConfigured()) return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
    if (!c.email) return { ok: false, error: `${c.name} has no email on file. Add one first.` };
    const subject = forSigning ? `Please review and sign: ${docTitle}` : `Please review: ${docTitle}`;
    const bodyText = forSigning
      ? `Hi ${firstName},\n\nPlease review and sign this document:\n\n${docUrl}\n\nYou can read and sign it from any device. Once signed, it appears in your portal under Documents.`
      : `Hi ${firstName},\n\nPlease review this document:\n\n${docUrl}\n\nYou can read it from any device.`;
    const html = await brandedEmailHtml({
      firstName,
      paragraphs: forSigning
        ? [`Please review and sign the following document:`, `"${docTitle}"`]
        : [`Please review the following document:`, `"${docTitle}"`],
      cta: {
        label: forSigning ? 'Review & sign document' : 'View document',
        url: docUrl,
      },
      note: forSigning
        ? 'You can read and sign from any device. Once signed, it appears in your portal under Documents.'
        : 'You can read it from any device.',
    });
    const r = await sendEmail({ to: c.email, subject, text: bodyText, html });
    if (!r.ok) return { ok: false, error: `Email failed: ${r.error}` };
    return { ok: true, channel: 'email', dest: c.email };
  }

  if (!isSmsSendConfigured()) return { ok: false, error: 'SMS not configured. Set TELNYX_API_KEY + TELNYX_FROM_NUMBER.' };
  if (!c.phone) return { ok: false, error: `${c.name} has no phone on file. Add one first.` };
  const smsBody = forSigning
    ? `Hi ${firstName}, please review and sign "${docTitle}": ${docUrl}`
    : `Hi ${firstName}, please review "${docTitle}": ${docUrl}`;
  const r = await sendSms({ to: c.phone, body: smsBody });
  if (!r.ok) return { ok: false, error: `SMS failed: ${r.error}` };
  return { ok: true, channel: 'sms', dest: c.phone };
}
