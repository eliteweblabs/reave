/**
 * Branded outbound share delivery — email (Resend) and SMS (Telnyx).
 * Used by the admin share sheet, agent tools, and document send API.
 */
import { bookingGet, bookingManageUrl, publicBookingPageUrl } from './bookingClient';
import {
  clientPortalUrl,
  extractPortal,
  getContact,
  resolveContact,
  type ContactRecord,
} from './contactApi';
import { brandedEmailHtml } from './emailTemplates';
import { createTrackedProjectLink } from './linkTracking';
import { logOutboundEmailForProject } from './logOutboundEmailForProject';
import { isEmailSendConfigured, isSmsSendConfigured, sendEmail, sendSms } from './outbound';
import { recordProjectOutboundEmail } from './projectOutboundEmail';
import { isSafeWorkSlug, storeReadWork } from './workStore';

export type ShareKind = 'portal' | 'work' | 'booking' | 'document';
export type ShareChannel = 'email' | 'sms';

export type ShareRecipientInput = {
  contactUid?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type ShareBookingInput = {
  uid: string;
  title?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
};

export type DeliverShareInput = {
  kind: ShareKind;
  channel: ShareChannel;
  recipient: ShareRecipientInput;
  /** Pre-built URL; server may replace with a tracked link when jobSlug is set. */
  url?: string;
  message?: string;
  jobSlug?: string;
  tab?: string;
  booking?: ShareBookingInput;
  /** Document template slug when kind is document. */
  template?: string;
  docTitle?: string;
  sentBy?: string | null;
  request?: Request;
  /** Outbound email log source (default share_sheet). */
  source?: string;
};

export type DeliverShareResult =
  | { ok: true; channel: ShareChannel; dest: string; url: string; tracked?: { token: string; job_slug: string } }
  | { ok: false; error: string };

type ResolvedRecipient = {
  contact?: ContactRecord;
  name: string;
  firstName: string;
  email?: string;
  phone?: string;
  contactUid?: string;
};

function firstNameFrom(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

function formatBookingWhen(startIso: string, endIso?: string): string {
  try {
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return startIso;
    const datePart = start.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (endIso) {
      const end = new Date(endIso);
      if (!Number.isNaN(end.getTime())) {
        const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return `${datePart} · ${startTime} – ${endTime}`;
      }
    }
    return `${datePart} · ${startTime}`;
  } catch {
    return startIso;
  }
}

async function resolveShareRecipient(input: ShareRecipientInput): Promise<ResolvedRecipient> {
  const uid = input.contactUid?.trim();
  if (uid) {
    const current = await getContact(uid);
    if (current.ok) {
      const c = current.data;
      return {
        contact: c,
        name: c.name,
        firstName: firstNameFrom(c.firstName || c.name),
        email: c.email?.trim() || undefined,
        phone: c.phone?.trim() || undefined,
        contactUid: c.uid,
      };
    }
  }

  const email = input.email?.trim();
  const name = input.name?.trim() || 'Guest';
  let phone = input.phone?.trim() || undefined;

  if (email) {
    const resolved = await resolveContact({ email });
    if (resolved.ok && resolved.data && typeof resolved.data === 'object') {
      const o = resolved.data as Record<string, unknown>;
      const match = String(o.match ?? '');
      const contactObj = o.contact;
      if (
        (match === 'exact' || match === 'likely') &&
        contactObj &&
        typeof contactObj === 'object' &&
        'uid' in contactObj
      ) {
        const full = await getContact(String((contactObj as { uid: unknown }).uid));
        if (full.ok) {
          const c = full.data;
          return {
            contact: c,
            name: c.name,
            firstName: firstNameFrom(c.firstName || c.name),
            email: c.email?.trim() || email,
            phone: c.phone?.trim() || phone,
            contactUid: c.uid,
          };
        }
      }
    }
  }

  return {
    name,
    firstName: firstNameFrom(name),
    email,
    phone,
  };
}

async function resolveShareUrl(
  input: DeliverShareInput,
  recipient: ResolvedRecipient,
): Promise<{ url: string; tracked?: { token: string; job_slug: string } }> {
  if (input.url?.trim()) return { url: input.url.trim() };

  const contactUid = recipient.contactUid?.trim();
  if (!contactUid) return { url: '' };

  const tab = input.tab?.trim() || (input.kind === 'work' ? 'work' : undefined);
  let url = clientPortalUrl(contactUid, tab ? { tab } : undefined);
  let tracked: { token: string; job_slug: string } | undefined;

  const jobSlug = input.jobSlug?.trim();
  if (jobSlug && isSafeWorkSlug(jobSlug)) {
    const job = await storeReadWork(jobSlug);
    if (job && (job.contact_uid === contactUid || !job.contact_uid)) {
      const created = await createTrackedProjectLink({
        jobSlug,
        contactUid,
        tab: tab || undefined,
        channel: input.channel,
        sentBy: input.sentBy ?? null,
        request: input.request,
      });
      if (created.ok) {
        url = created.url;
        tracked = { token: created.link.token, job_slug: jobSlug };
      }
    }
  }

  return { url, tracked };
}

function isPrivateShareUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('.internal') || h === 'localhost' || h.startsWith('127.');
  } catch {
    return false;
  }
}

function resolveBookingShareUrl(input: { url?: string; booking?: ShareBookingInput }): string {
  let url = input.url?.trim() || '';
  if (url && isPrivateShareUrl(url)) url = '';
  if (!url && input.booking?.uid) {
    url = bookingManageUrl(input.booking.uid) || publicBookingPageUrl() || '';
  }
  return url;
}

function bookingShareCtaLabel(url: string): string {
  return url.includes('/booking/') ? 'Manage your appointment' : 'View booking page';
}

function bookingDetailsLines(booking: ShareBookingInput): string[] {
  const lines: string[] = [];
  const when = formatBookingWhen(booking.startTime, booking.endTime);
  lines.push(`When: ${when}`);
  if (booking.location?.trim()) lines.push(`Location: ${booking.location.trim()}`);
  if (booking.description?.trim()) lines.push(`Notes: ${booking.description.trim()}`);
  return lines;
}

async function sendPortalShare(opts: {
  recipient: ResolvedRecipient;
  channel: ShareChannel;
  url: string;
  message?: string;
  jobSlug?: string;
  sentBy?: string | null;
  tracked?: { token: string; job_slug: string };
  source?: string;
}): Promise<DeliverShareResult> {
  const { recipient, channel, url, message, jobSlug, sentBy, tracked, source = 'share_sheet' } = opts;
  const intro = message?.trim() ? `${message.trim()}\n\n` : '';
  const shareUrl = url;
  const company = recipient.contact?.company?.trim();

  if (channel === 'email') {
    if (!isEmailSendConfigured()) return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
    const to = recipient.email?.trim();
    if (!to) return { ok: false, error: 'No email on file for this recipient.' };

    const subject = company ? `Your client page — ${company}` : 'Your client page';
    const introLines = intro ? [intro.trim()] : [];
    const text =
      `${intro}Hi ${recipient.firstName},\n\n` +
      `Here's your personal client page — your details and any outstanding invoices live here:\n\n${shareUrl}\n\n` +
      `Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.`;
    const html = await brandedEmailHtml({
      firstName: recipient.firstName,
      paragraphs: [
        ...introLines,
        "Here's your personal client page — your details and any outstanding invoices live here:",
      ],
      cta: { label: 'Open your client page', url: shareUrl },
      note: 'Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.',
    });
    const r = await sendEmail({ to, subject, text, html });
    if (!r.ok) return { ok: false, error: r.error };

    if (tracked?.job_slug) {
      const job = await storeReadWork(tracked.job_slug);
      void recordProjectOutboundEmail({
        jobSlug: tracked.job_slug,
        jobTitle: job?.title ?? '',
        contactUid: recipient.contactUid ?? null,
        toEmail: to,
        subject,
        resendId: r.id,
        sentBy: sentBy ?? null,
        source,
      });
    } else if (recipient.contactUid) {
      void logOutboundEmailForProject({
        toEmail: to,
        subject,
        resendId: r.id,
        sentBy: sentBy ?? null,
        source,
        contactUid: recipient.contactUid,
        jobSlug: jobSlug || null,
      });
    }

    return { ok: true, channel: 'email', dest: to, url: shareUrl, tracked };
  }

  if (!isSmsSendConfigured()) {
    return { ok: false, error: 'SMS not configured. Set TELNYX_API_KEY + TELNYX_FROM_NUMBER.' };
  }
  const to = recipient.phone?.trim();
  if (!to) return { ok: false, error: 'No phone on file for this recipient.' };

  const body = `${intro}Hi ${recipient.firstName}, here's your client page: ${shareUrl}`;
  const r = await sendSms({ to, body });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, channel: 'sms', dest: to, url: shareUrl, tracked };
}

async function sendBookingShare(opts: {
  recipient: ResolvedRecipient;
  channel: ShareChannel;
  booking: ShareBookingInput;
  url?: string;
  message?: string;
}): Promise<DeliverShareResult> {
  const { recipient, channel, booking, url, message } = opts;
  const intro = message?.trim() ? `${message.trim()}\n\n` : '';
  const title = booking.title?.trim() || 'Meeting';
  const when = formatBookingWhen(booking.startTime, booking.endTime);
  const detailLines = bookingDetailsLines(booking);
  const shareUrl = resolveBookingShareUrl({ url, booking });

  if (channel === 'email') {
    if (!isEmailSendConfigured()) return { ok: false, error: 'Email not configured. Set RESEND_API_KEY.' };
    const to = recipient.email?.trim();
    if (!to) return { ok: false, error: 'No email on file for this guest.' };

    const subject = `Your meeting — ${title}`;
    const paragraphs = [
      ...(intro ? [intro.trim()] : []),
      `Your meeting "${title}" is scheduled.`,
      ...detailLines,
    ];
    const text =
      `${intro}Hi ${recipient.firstName},\n\n` +
      `Your meeting "${title}" is scheduled.\n\n` +
      `${detailLines.join('\n')}\n` +
      (shareUrl ? `\n${shareUrl}\n` : '');

    const html = await brandedEmailHtml({
      firstName: recipient.firstName,
      paragraphs,
      ...(shareUrl ? { cta: { label: bookingShareCtaLabel(shareUrl), url: shareUrl } } : {}),
    });
    const r = await sendEmail({ to, subject, text, html });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, channel: 'email', dest: to, url: shareUrl };
  }

  if (!isSmsSendConfigured()) {
    return { ok: false, error: 'SMS not configured. Set TELNYX_API_KEY + TELNYX_FROM_NUMBER.' };
  }
  const to = recipient.phone?.trim();
  if (!to) return { ok: false, error: 'No phone on file for this guest.' };

  const body =
    `${intro}Hi ${recipient.firstName}, your meeting "${title}" is ${when}.` +
    (booking.location?.trim() ? ` Location: ${booking.location.trim()}.` : '') +
    (shareUrl ? ` ${shareUrl}` : '');
  const r = await sendSms({ to, body });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, channel: 'sms', dest: to, url: shareUrl };
}

export async function deliverShare(input: DeliverShareInput): Promise<DeliverShareResult> {
  const channel = input.channel;
  if (channel !== 'email' && channel !== 'sms') {
    return { ok: false, error: 'channel must be "email" or "sms"' };
  }

  const recipient = await resolveShareRecipient(input.recipient);

  if (input.kind === 'document') {
    const { sendDocumentLink } = await import('./documentDelivery');
    if (!recipient.contact) {
      return { ok: false, error: 'Contact not found for document delivery.' };
    }
    const template = input.template?.trim();
    const docUrl = input.url?.trim();
    const docTitle = input.docTitle?.trim() || 'Document';
    if (!template || !docUrl) {
      return { ok: false, error: 'Document share requires template and url.' };
    }
    const result = await sendDocumentLink({
      contact: recipient.contact,
      docUrl,
      docTitle,
      channel,
    });
    if (!result.ok) return result;
    return { ok: true, channel: result.channel, dest: result.dest, url: docUrl };
  }

  if (input.kind === 'booking') {
    let booking = input.booking;
    const uid = booking?.uid?.trim() || input.recipient.contactUid;
    if (!booking && uid) {
      const fetched = await bookingGet(uid);
      if (fetched.ok) {
        const b = fetched.data.booking;
        booking = {
          uid: b.uid,
          title: b.title,
          startTime: b.startTime,
          endTime: b.endTime,
          location: b.location,
          description: b.description,
        };
        if (!recipient.email && b.email) recipient.email = b.email.trim();
        if (recipient.name === 'Guest' && b.attendee) recipient.name = b.attendee;
        if (recipient.firstName === 'Guest' && b.attendee) {
          recipient.firstName = firstNameFrom(b.attendee);
        }
      }
    }
    if (!booking?.startTime) {
      return { ok: false, error: 'Booking details are required.' };
    }
    return sendBookingShare({
      recipient,
      channel,
      booking,
      url: resolveBookingShareUrl({ url: input.url, booking }),
      message: input.message,
    });
  }

  if (recipient.contact) {
    const portal = extractPortal(recipient.contact);
    if (portal && portal.enabled === false) {
      return { ok: false, error: 'This client’s page is hidden. Re-enable it before sharing.' };
    }
  }

  const resolved = await resolveShareUrl(input, recipient);
  if (!resolved.url) return { ok: false, error: 'Could not build a share link.' };

  return sendPortalShare({
    recipient,
    channel,
    url: resolved.url,
    message: input.message,
    jobSlug: input.jobSlug,
    sentBy: input.sentBy,
    tracked: resolved.tracked,
    source: input.source,
  });
}
