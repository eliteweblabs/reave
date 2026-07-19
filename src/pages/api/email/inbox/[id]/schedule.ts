/**
 * GET  /api/email/inbox/[id]/schedule — check proposed slot vs Cal.com
 * POST /api/email/inbox/[id]/schedule — book meeting and mark inbox item
 *   action: "book" (default) | "accept-notify" | "notify-conflict"
 */

import type { APIContext } from 'astro';
import {
  bookingCreate,
  bookingGet,
  bookingManageUrl,
  publicBookingPageUrl,
  resolveBookingAddress,
} from '../../../../../lib/bookingClient';
import { getCompanyConfig } from '../../../../../lib/companyConfig';
import {
  storeGetEmailInbox,
  storeUpdateEmailInbox,
  type EmailInboxRecord,
} from '../../../../../lib/emailInboxStore';
import { ensureContactForMeetingEmail } from '../../../../../lib/emailContactExtract';
import { buildReplyEmailHeaders, buildReplySubject, resolveReplyRecipient } from '../../../../../lib/emailReply';
import {
  attendeeFromEmail,
  buildMeetingAcceptNotifyEmail,
  buildMeetingSlotBookedEmail,
  checkEmailMeetingSlot,
  DEFAULT_MEETING_MINUTES,
  resolveProposedMeetingStart,
} from '../../../../../lib/emailScheduling';
import { hasFeature } from '../../../../../lib/features';
import { isEmailSendConfigured, sendEmail } from '../../../../../lib/outbound';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function schedulingEnabled(): boolean {
  return hasFeature('scheduling');
}

type LoadedEmail = {
  event: EmailInboxRecord;
  proposedStart: string;
};

async function loadEmail(id: string): Promise<
  | LoadedEmail
  | { error: string; status: 404 | 400 }
> {
  const event = await storeGetEmailInbox(id);
  if (!event) return { error: 'Not found', status: 404 };
  const proposedStart = resolveProposedMeetingStart({
    proposedMeetingStart: event.proposedMeetingStart,
    schedulingNote: event.schedulingNote,
    summary: event.summary,
    bodyText: event.bodySnippet || event.bodyText,
    receivedAt: event.receivedAt,
  });
  if (!proposedStart) {
    return { error: 'No proposed meeting time on this message', status: 400 };
  }
  return { event, proposedStart };
}

async function sendSchedulingReply(
  event: EmailInboxRecord,
  message: { subject: string; text: string; html?: string },
): Promise<{ ok: true; to: string; emailId?: string } | { ok: false; error: string }> {
  if (!isEmailSendConfigured()) {
    return { ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' };
  }
  const to = resolveReplyRecipient(event);
  if (!to.includes('@')) {
    return { ok: false, error: 'Could not determine reply recipient' };
  }
  const result = await sendEmail({
    to,
    subject: buildReplySubject(event.subject || message.subject),
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    headers: buildReplyEmailHeaders(event),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, to, emailId: result.id };
}

/** Best-effort meeting location for the confirmation email's "Where" row. */
async function resolveBookingLocation(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  try {
    const got = await bookingGet(uid);
    if (got.ok) return got.data.booking.location?.trim() || null;
  } catch {
    // best-effort — omit the row if the lookup fails
  }
  return null;
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!schedulingEnabled()) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const loaded = await loadEmail(id);
  if ('error' in loaded) return json({ ok: false, error: loaded.error }, loaded.status);

  const { event, proposedStart } = loaded;
  const checkRes = await checkEmailMeetingSlot({
    proposedStart,
    from: event.from,
    contactName: event.contactName,
  });
  if (!checkRes.ok) return json({ ok: false, error: checkRes.error }, 503);

  return json({
    ok: true,
    alreadyBooked: Boolean(event.bookingUid),
    bookingUid: event.bookingUid,
    bookingStart: event.bookingStart,
    resolvedStart: proposedStart,
    check: checkRes.check,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!schedulingEnabled()) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const loaded = await loadEmail(id);
  if ('error' in loaded) return json({ ok: false, error: loaded.error }, loaded.status);

  const { event, proposedStart } = loaded;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const action = String(rec.action ?? 'book').trim().toLowerCase();

  const company = await getCompanyConfig();
  const attendee = attendeeFromEmail({ from: event.from, contactName: event.contactName });

  if (action === 'confirm') {
    if (!event.bookingUid) {
      return json({ ok: false, error: 'No booking on this message' }, 400);
    }
    const whenLabel = formatWhenLabel(event.bookingStart || proposedStart);
    const mail = await buildMeetingAcceptNotifyEmail({
      attendeeName: attendee.name,
      whenLabel,
      companyName: company.name,
      manageUrl: bookingManageUrl(event.bookingUid),
      locationLabel: await resolveBookingLocation(event.bookingUid),
      bookingUid: event.bookingUid,
    });
    const sent = await sendSchedulingReply(event, mail);
    if (!sent.ok) {
      return json({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);
    }
    const updated = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      markAutomationAck: true,
    });
    return json({
      ok: true,
      confirmed: true,
      notified: true,
      action: 'confirm',
      bookingUid: event.bookingUid,
      bookingStart: event.bookingStart,
      whenLabel,
      attendeeName: attendee.name,
      attendeeEmail: sent.to,
      notifyEmailId: sent.emailId ?? null,
      event: updated ?? event,
    });
  }

  const startRaw = rec.start != null ? String(rec.start).trim() : proposedStart;
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) {
    return json({ ok: false, error: 'Invalid start time' }, 400);
  }

  const checkRes = await checkEmailMeetingSlot({
    proposedStart: start.toISOString(),
    from: event.from,
    contactName: event.contactName,
  });
  if (!checkRes.ok) return json({ ok: false, error: checkRes.error }, 503);

  if (action === 'notify-conflict') {
    if (checkRes.check.available) {
      return json(
        { ok: false, error: 'That time appears to be open — use Accept and Notify instead', check: checkRes.check },
        409,
      );
    }
    const mail = await buildMeetingSlotBookedEmail({
      attendeeName: attendee.name,
      whenLabel: checkRes.check.proposedLabel,
      companyName: company.name,
      bookingUrl: publicBookingPageUrl(),
    });
    const sent = await sendSchedulingReply(event, mail);
    if (!sent.ok) return json({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);

    const updated = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      markAutomationAck: true,
    });
    return json({
      ok: true,
      notified: true,
      action: 'notify-conflict',
      event: updated ?? event,
    });
  }

  if (event.bookingUid && action !== 'accept-notify' && action !== 'confirm') {
    return json({
      ok: true,
      alreadyBooked: true,
      bookingUid: event.bookingUid,
      bookingStart: event.bookingStart,
      event,
    });
  }

  if (!checkRes.check.available && action === 'accept-notify') {
    return json(
      {
        ok: false,
        error: checkRes.check.conflictReason || 'Time slot is not available',
        check: checkRes.check,
      },
      409,
    );
  }

  if (!checkRes.check.available && action === 'book') {
    return json(
      {
        ok: false,
        error: checkRes.check.conflictReason || 'Time slot is not available',
        check: checkRes.check,
      },
      409,
    );
  }

  if (action === 'accept-notify' && event.bookingUid) {
    const mail = await buildMeetingAcceptNotifyEmail({
      attendeeName: attendee.name,
      whenLabel: formatWhenLabel(event.bookingStart || start.toISOString()),
      companyName: company.name,
      manageUrl: bookingManageUrl(event.bookingUid),
      locationLabel: await resolveBookingLocation(event.bookingUid),
      bookingUid: event.bookingUid,
    });
    const sent = await sendSchedulingReply(event, mail);
    if (!sent.ok) return json({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);
    const updated = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      markAutomationAck: true,
    });
    return json({
      ok: true,
      alreadyBooked: true,
      notified: true,
      action: 'accept-notify',
      bookingUid: event.bookingUid,
      bookingStart: event.bookingStart,
      event: updated ?? event,
    });
  }

  if (!attendee.email.includes('@')) {
    return json({ ok: false, error: 'Could not determine attendee email from sender' }, 400);
  }

  const address = resolveBookingAddress(rec.address);

  const notes = [
    `From inbox: ${event.subject || '(no subject)'}`,
    event.schedulingNote ? `Requested: ${event.schedulingNote}` : '',
    event.summary ? event.summary.slice(0, 200) : '',
  ]
    .filter(Boolean)
    .join('\n');

  // This attendee already emailed us to request the meeting — they're a known
  // person, not an ambiguous lead. Resolve/ensure their contact by exact email
  // on our side and hand the booking service a definite contact uid, so it
  // skips its fuzzy name match (which would otherwise flag unrelated contacts
  // like "Martin …" for a sender named "joel.martinez" and block approval).
  const ensuredContact = await ensureContactForMeetingEmail({
    from: event.from,
    bodyText: event.bodySnippet || event.bodyText || undefined,
    summary: event.summary || undefined,
    existingContactUid: event.contactUid,
    existingContactName: event.contactName,
  });
  const confirmContactUid = ensuredContact?.ok ? ensuredContact.uid : undefined;

  const created = await bookingCreate({
    name: attendee.name,
    email: attendee.email,
    start: start.toISOString(),
    notes: notes.slice(0, 500),
    ...(address ? { address } : {}),
    ...(confirmContactUid ? { confirmContactUid } : {}),
  });
  if (!created.ok) {
    return json({ ok: false, error: created.error }, created.status ?? 502);
  }

  const bookingUid = created.data.booking?.uid ?? null;
  const bookingStart = created.data.booking?.startTime ?? start.toISOString();
  if (!bookingUid) {
    return json({ ok: false, error: 'Booking API did not return a booking id' }, 502);
  }

  const updated = await storeUpdateEmailInbox(id, {
    action: 'booked',
    bookingUid,
    bookingStart,
  });
  if (!updated) return json({ ok: false, error: 'Booked but failed to update inbox record' }, 500);

  if (action === 'accept-notify') {
    const mail = await buildMeetingAcceptNotifyEmail({
      attendeeName: attendee.name,
      whenLabel: formatWhenLabel(bookingStart),
      companyName: company.name,
      manageUrl: bookingManageUrl(bookingUid),
      locationLabel: await resolveBookingLocation(bookingUid),
      bookingUid,
    });
    const sent = await sendSchedulingReply(updated, mail);
    if (!sent.ok) {
      return json({
        ok: true,
        booked: true,
        notifyError: sent.error,
        bookingUid,
        bookingStart,
        durationMinutes: DEFAULT_MEETING_MINUTES,
        event: updated,
      });
    }
    const filed = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      markAutomationAck: true,
    });
    return json({
      ok: true,
      booked: true,
      notified: true,
      action: 'accept-notify',
      bookingUid,
      bookingStart,
      durationMinutes: DEFAULT_MEETING_MINUTES,
      event: filed ?? updated,
    });
  }

  return json({
    ok: true,
    bookingUid,
    bookingStart,
    durationMinutes: DEFAULT_MEETING_MINUTES,
    event: updated,
  });
}

function formatWhenLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
