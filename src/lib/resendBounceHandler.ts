/**
 * resendBounceHandler — process Resend email.bounced / email.complained events.
 *
 * 1. Resolves the recipient email to a contact via contact-api (listContacts q=email).
 * 2. Appends a timestamped bounce note to the contact's notes field.
 * 3. Fires a dismissible admin dashboard alert + phone push notification.
 */

import { listContacts, updateContact } from './contactApi';
import { sendPushNotification } from './webPush';

export type ResendBounceEvent = {
  type: 'email.bounced' | 'email.complained';
  data: {
    email_id?: string;
    /** The address that bounced (to field). */
    to?: string | string[];
    from?: string;
    subject?: string;
    bounce?: {
      type?: string; // e.g. "hard" | "soft"
      message?: string;
    };
  };
};

export type BounceHandlerResult = {
  action: 'marked' | 'no_contact' | 'error';
  email?: string;
  contactUid?: string;
  contactName?: string;
  alertFired: boolean;
  error?: string;
};

function normalizeToAddress(to: string | string[] | undefined): string {
  if (!to) return '';
  const first = Array.isArray(to) ? to[0] : to;
  return (first ?? '').trim().toLowerCase();
}

function buildBounceNote(event: ResendBounceEvent): string {
  const ts = new Date().toISOString();
  if (event.type === 'email.complained') {
    return `[${ts}] Email spam complaint received — address may be flagged.`;
  }
  const bounceType = event.data.bounce?.type ?? 'unknown';
  const bounceMsg = event.data.bounce?.message?.trim();
  const detail = bounceMsg ? `: ${bounceMsg}` : '';
  return `[${ts}] Email bounced (${bounceType})${detail} — address may be invalid.`;
}

export async function handleResendBounceEvent(
  event: ResendBounceEvent,
): Promise<BounceHandlerResult> {
  const email = normalizeToAddress(event.data.to);
  if (!email) {
    return { action: 'error', alertFired: false, error: 'No recipient address in event' };
  }

  // 1. Look up contact by email address
  const lookup = await listContacts({ q: email, limit: 5 });
  const contact = lookup.ok
    ? (lookup.data.contacts.find(
        (c) => c.email?.trim().toLowerCase() === email,
      ) ?? null)
    : null;

  const bounceNote = buildBounceNote(event);
  const isComplaint = event.type === 'email.complained';
  const alertTitle = isComplaint
    ? `📛 Spam complaint: ${email}`
    : `📬 Email bounced: ${email}`;
  const subject = event.data.subject?.trim() ?? '';
  const alertDetail = contact
    ? `${contact.name}${subject ? ` — "${subject}"` : ''}`
    : subject || 'No matching contact found';

  // 2. Mark the contact if found
  if (contact) {
    const existingNotes = contact.notes?.trim() ?? '';
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${bounceNote}`
      : bounceNote;

    await updateContact(contact.uid, { notes: updatedNotes }).catch((e) => {
      console.warn('[resend-bounce] failed to update contact notes', e);
    });
  } else {
    console.info('[resend-bounce] no contact found for email', email);
  }

  // 3. Fire admin alert + push
  const alertUrl = contact
    ? `/admin?tab=contacts&uid=${encodeURIComponent(contact.uid)}`
    : '/admin?tab=contacts';

  const pushed = await sendPushNotification({
    title: alertTitle,
    body: alertDetail,
    tag: `bounce:${email}`,
    url: alertUrl,
    kind: 'system',
    urgent: isComplaint,
  }).catch(() => null);

  return {
    action: contact ? 'marked' : 'no_contact',
    email,
    contactUid: contact?.uid,
    contactName: contact?.name,
    alertFired: pushed !== null,
  };
}
