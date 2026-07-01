/**
 * Deliver a document-signing link to a client over a specific channel.
 *
 * Factored out so both the Telegram flow and the admin "review & send" page can
 * send the exact same email/SMS. Returns a plain result (no side-channel UI) so
 * callers can render the outcome however they like.
 */
import type { ContactRecord } from './contactApi';
import { isEmailSendConfigured, isSmsSendConfigured, sendEmail, sendSms } from './outbound';
import { brandedEmailHtml } from './emailTemplates';

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

  if (channel === 'email') {
    if (!isEmailSendConfigured()) return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
    if (!c.email) return { ok: false, error: `${c.name} has no email on file. Add one first.` };
    const subject = `Please review and sign: ${docTitle}`;
    const bodyText = `Hi ${firstName},\n\nPlease review and sign this document:\n\n${docUrl}\n\nYou can read and sign it from any device. Once signed, it appears in your portal under Documents.`;
    const html = await brandedEmailHtml({
      firstName,
      paragraphs: [`Please review and sign the following document:`, `"${docTitle}"`],
      cta: { label: 'Review & sign document', url: docUrl },
      note: 'You can read and sign from any device. Once signed, it appears in your portal under Documents.',
    });
    const r = await sendEmail({ to: c.email, subject, text: bodyText, html });
    if (!r.ok) return { ok: false, error: `Email failed: ${r.error}` };
    return { ok: true, channel: 'email', dest: c.email };
  }

  if (!isSmsSendConfigured()) return { ok: false, error: 'SMS not configured. Set TELNYX_API_KEY + TELNYX_FROM_NUMBER.' };
  if (!c.phone) return { ok: false, error: `${c.name} has no phone on file. Add one first.` };
  const r = await sendSms({ to: c.phone, body: `Hi ${firstName}, please review and sign "${docTitle}": ${docUrl}` });
  if (!r.ok) return { ok: false, error: `SMS failed: ${r.error}` };
  return { ok: true, channel: 'sms', dest: c.phone };
}
