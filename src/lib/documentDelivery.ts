/**
 * Deliver a document-signing link to a client over a specific channel.
 */
import type { ContactRecord } from './contactApi';
import { extractPortal } from './contactApi';
import { brandedEmailHtml } from './emailTemplates';
import { isEmailSendConfigured, isEmailToSmsConfigured, sendEmail, sendSmsViaEmailGateway } from './outbound';
import { isValidCarrier } from './smsUtils';

export type SendDocumentResult =
  | { ok: true; channel: 'email' | 'sms'; dest: string }
  | { ok: false; error: string };

export async function sendDocumentLink(opts: {
  contact: ContactRecord;
  docUrl: string;
  docTitle: string;
  channel: 'email' | 'sms';
  carrier?: string;
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

  if (!c.phone) return { ok: false, error: `${c.name} has no phone on file. Add one first.` };
  const portal = extractPortal(c);
  const carrier = (opts.carrier || portal?.smsCarrier || '').trim();
  if (!carrier || !isValidCarrier(carrier)) {
    return { ok: false, error: 'Select a mobile carrier to text this client.' };
  }
  if (!isEmailToSmsConfigured()) {
    return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
  }

  const body = `Hi ${firstName}, please review and sign "${docTitle}": ${docUrl}`;
  const r = await sendSmsViaEmailGateway({ phone: c.phone, carrier, text: body, subject: docTitle });
  if (!r.ok) return { ok: false, error: `Text failed: ${r.error}` };
  return { ok: true, channel: 'sms', dest: r.gatewayEmail ?? c.phone };
}
