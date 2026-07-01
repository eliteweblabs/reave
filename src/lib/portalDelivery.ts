/**
 * Deliver a client portal link to a client over email or SMS.
 *
 * Shared by the Telegram agent, admin client card, and review flows so every
 * channel sends the same copy.
 */
import type { ContactRecord } from './contactApi';
import { clientPortalUrl, extractPortal, setContactPortal } from './contactApi';
import { brandedEmailHtml } from './emailTemplates';
import { isEmailSendConfigured, isEmailToSmsConfigured, sendEmail, sendSmsViaEmailGateway } from './outbound';
import { getCarrierInfo, isValidCarrier } from './smsUtils';

export type SendPortalResult =
  | { ok: true; channel: 'email' | 'sms'; dest: string; url: string }
  | { ok: false; error: string };

export type SendPortalChannel = 'email' | 'sms' | 'auto';

function resolveChannel(
  contact: ContactRecord,
  channel: SendPortalChannel
): 'email' | 'sms' | null {
  if (channel === 'email') return 'email';
  if (channel === 'sms') return 'sms';
  if (contact.email) return 'email';
  if (contact.phone) return 'sms';
  return null;
}

async function rememberSmsCarrier(uid: string, contact: ContactRecord, carrier: string): Promise<void> {
  const existing = extractPortal(contact) ?? {};
  if (existing.smsCarrier === carrier) return;
  await setContactPortal(uid, { ...existing, smsCarrier: carrier });
}

export async function sendPortalLink(opts: {
  contact: ContactRecord;
  channel: SendPortalChannel;
  message?: string;
  tab?: string;
  /** Carrier key (att, verizon, …) — required for SMS via email gateway. */
  carrier?: string;
  /** When true, save carrier on the contact portal metadata for next time. */
  rememberCarrier?: boolean;
}): Promise<SendPortalResult> {
  const { contact: c, channel, message, tab, rememberCarrier = true } = opts;

  const portal = extractPortal(c);
  if (portal && portal.enabled === false) {
    return { ok: false, error: 'This client’s page is hidden. Re-enable it before sending.' };
  }

  const resolved = resolveChannel(c, channel);
  if (!resolved) {
    return { ok: false, error: 'This client has no email or phone on file to send to.' };
  }
  if (resolved === 'email' && !c.email) {
    return { ok: false, error: `${c.name || 'Client'} has no email on file. Add one first.` };
  }
  if (resolved === 'sms' && !c.phone) {
    return { ok: false, error: `${c.name || 'Client'} has no phone on file. Add one first.` };
  }

  const url = clientPortalUrl(c.uid, tab ? { tab } : undefined);
  const firstName = (c.firstName || c.name || '').trim().split(/\s+/)[0] || 'there';
  const intro = typeof message === 'string' && message.trim() ? `${message.trim()}\n\n` : '';

  if (resolved === 'email') {
    if (!isEmailSendConfigured()) {
      return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
    }
    const subject = c.company ? `Your client page — ${c.company}` : 'Your client page';
    const introLines = intro ? [intro.trim()] : [];
    const text =
      `${intro}Hi ${firstName},\n\n` +
      `Here's your personal client page — your details and any outstanding invoices live here:\n\n${url}\n\n` +
      `Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.`;
    const html = await brandedEmailHtml({
      firstName,
      paragraphs: [
        ...introLines,
        "Here's your personal client page — your details and any outstanding invoices live here:",
      ],
      cta: { label: 'Open your client page', url },
      note: 'Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.',
    });
    const r = await sendEmail({ to: c.email as string, subject, text, html });
    if (!r.ok) return { ok: false, error: `Email failed: ${r.error}` };
    return { ok: true, channel: 'email', dest: c.email as string, url };
  }

  const carrier = (opts.carrier || portal?.smsCarrier || '').trim();
  if (!carrier || !isValidCarrier(carrier)) {
    return { ok: false, error: 'Select a mobile carrier to text this client.' };
  }
  if (!isEmailToSmsConfigured()) {
    return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
  }

  const body = `${intro}Hi ${firstName}, here's your client page: ${url}`;
  const carrierName = getCarrierInfo(carrier)?.name ?? 'SMS';
  const r = await sendSmsViaEmailGateway({
    phone: c.phone as string,
    carrier,
    text: body,
    subject: `Your client page`,
  });
  if (!r.ok) return { ok: false, error: `Text failed: ${r.error}` };

  if (rememberCarrier) {
    await rememberSmsCarrier(c.uid, c, carrier);
  }

  const dest = r.gatewayEmail ?? `${c.phone} (${carrierName})`;
  return { ok: true, channel: 'sms', dest, url };
}
