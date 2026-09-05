/**
 * GET  /api/email/inbox/[id]/schedule — check proposed slot vs Cal.com
 * POST /api/email/inbox/[id]/schedule — book meeting and mark inbox item
 *   action: "book" (default) | "accept-notify" | "notify-conflict" | "notify-schedule-link" | "prepare-project" | "attach-project" | "confirm"
 *
 * accept-notify / confirm book (or ack) without emailing the requester — inbound
 * meeting mail is often from a no-reply third-party address.
 */

import type { APIContext } from 'astro';
import {
  bookingCreate,
  bookingTimezone,
  publicBookingPageUrl,
  resolveBookingAddress,
} from '../../../../../lib/bookingClient';
import { getCompanyConfig } from '../../../../../lib/companyConfig';
import {
  archiveEmailInboxPatch,
  storeGetEmailInbox,
  storeUpdateEmailInbox,
  type EmailInboxRecord,
} from '../../../../../lib/emailInboxStore';
import { ensureContactForMeetingEmail } from '../../../../../lib/emailContactExtract';
import { sendInboundThreadReply } from '../../../../../lib/inboundEmailReply';
import {
  attendeeFromEmail,
  buildMeetingScheduleInviteEmail,
  buildMeetingSlotBookedEmail,
  checkEmailMeetingSlot,
  DEFAULT_MEETING_MINUTES,
  resolveMeetingStartFromInbox,
} from '../../../../../lib/emailScheduling';
import {
  extractAppointmentLocation,
  inboundMeetingEvidence,
  isVendorConfirmedAppointment,
} from '../../../../../lib/emailMeetingParse';
import { clerkClient } from '@clerk/astro/server';
import {
  inferMeetingDurationMinutes,
  resolveBookingLength,
} from '../../../../../lib/bookingDuration';
import {
  ensureProjectForMeetingEmail,
  previewMeetingProjectTitle,
} from '../../../../../lib/emailMeetingProject';
import { hasFeature } from '../../../../../lib/features';
import { siteBaseUrl } from '../../../../../lib/contactApi';
import { scheduleFormUrl } from '../../../../../lib/inboundEmailReply';
import { storeListWork } from '../../../../../lib/workStore';
import { isEmailSendConfigured } from '../../../../../lib/outbound';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;


function schedulingEnabled(): boolean {
  return hasFeature('scheduling');
}

async function ownerBookingIdentity(
  context: APIContext,
  userId: string,
  companyName: string,
): Promise<{ name: string; email: string }> {
  try {
    const user = await clerkClient(context).users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress?.trim() || '';
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || companyName || 'Owner';
    return { name, email };
  } catch {
    return { name: companyName || 'Owner', email: '' };
  }
}

async function attachMeetingProject(
  id: string,
  event: EmailInboxRecord,
  bookingUid: string,
  bookingStart: string,
): Promise<EmailInboxRecord> {
  if (event.jobSlug) return event;

  const project = await ensureProjectForMeetingEmail({
    emailId: id,
    from: event.from,
    subject: event.subject,
    summary: event.summary,
    bodyText: event.bodySnippet || event.bodyText,
    bodySnippet: event.bodySnippet,
    receivedAt: event.receivedAt,
    contactUid: event.contactUid,
    contactName: event.contactName,
    resendEmailId: event.resendEmailId,
    jobSlug: event.jobSlug,
    bookingUid,
    bookingStart,
  });
  if (!project.ok) {
    console.warn('[schedule] meeting project attach failed', project.error);
    return event;
  }

  const updated = await storeUpdateEmailInbox(id, {
    jobSlug: project.slug,
    jobTitle: project.title,
    contactUid: project.contactUid,
    contactName: project.contactName,
  });
  return updated ?? event;
}

/**
 * Once the owner has decided (confirmed, notified, or sent a link) the message
 * has no work left in it — archive it in the same write that clears the review.
 */
async function archiveAfterMeetingDecision(
  id: string,
  event: EmailInboxRecord,
): Promise<EmailInboxRecord | null> {
  return storeUpdateEmailInbox(id, {
    ...archiveEmailInboxPatch(event.category),
    acceptAutomationDecision: true,
    markAutomationAck: true,
  });
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
  let proposedStart =
    resolveMeetingStartFromInbox({
      proposedMeetingStart: event.proposedMeetingStart,
      schedulingNote: event.schedulingNote,
      summary: event.summary,
      subject: event.subject,
      bodyText: event.bodyText,
      bodySnippet: event.bodySnippet,
      bodyHtml: event.bodyHtml,
      receivedAt: event.receivedAt,
    }) ?? null;
  if (!proposedStart && event.bookingStart) {
    proposedStart = event.bookingStart;
  }
  if (!proposedStart) {
    return { error: 'No proposed meeting time on this message', status: 400 };
  }
  return { event, proposedStart };
}

async function openProjectSuggestions(contactUid: string | null | undefined) {
  const jobs = await storeListWork({
    contact_uid: contactUid?.trim() || undefined,
  });
  return jobs
    .filter((j) => j.status === 'inquiry' || j.status === 'audit' || j.status === 'active')
    .slice(0, 12)
    .map((j) => ({ slug: j.slug, title: j.title, status: j.status }));
}

async function sendSchedulingReply(
  event: EmailInboxRecord,
  message: { subject: string; text: string; html?: string },
  source = 'schedule_reply',
): Promise<{ ok: true; to: string; emailId?: string } | { ok: false; error: string }> {
  if (!isEmailSendConfigured()) {
    return { ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' };
  }
  return sendInboundThreadReply(event, message, {
    jobSlug: event.jobSlug,
    contactUid: event.contactUid,
    source,
  });
}

async function handleNotifyScheduleLink(
  id: string,
  event: EmailInboxRecord,
): Promise<Response> {
  const company = await getCompanyConfig();
  const attendee = attendeeFromEmail({ from: event.from, contactName: event.contactName });
  const scheduleUrl = hasFeature('scheduling')
    ? scheduleFormUrl(siteBaseUrl(), { name: attendee.name, email: attendee.email })
    : null;
  const mail = await buildMeetingScheduleInviteEmail({
    attendeeName: attendee.name,
    attendeeEmail: attendee.email,
    companyName: company.name,
    scheduleUrl,
  });
  const sent = await sendSchedulingReply(event, mail, 'notify_schedule_link');
  if (!sent.ok) {
    return jsonResponse({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);
  }
  const updated = await archiveAfterMeetingDecision(id, event);
  return jsonResponse({
    ok: true,
    notified: true,
    action: 'notify-schedule-link',
    attendeeEmail: sent.to,
    notifyEmailId: sent.emailId ?? null,
    event: updated ?? event,
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!schedulingEnabled()) {
    return jsonResponse({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const loaded = await loadEmail(id);
  if ('error' in loaded) return jsonResponse({ ok: false, error: loaded.error }, loaded.status);

  const { event, proposedStart } = loaded;
  const checkRes = await checkEmailMeetingSlot({
    proposedStart,
    from: event.from,
    contactName: event.contactName,
  });
  if (!checkRes.ok) return jsonResponse({ ok: false, error: checkRes.error }, 503);

  return jsonResponse({
    ok: true,
    alreadyBooked: Boolean(event.bookingUid),
    bookingUid: event.bookingUid,
    bookingStart: event.bookingStart,
    resolvedStart: proposedStart,
    check: checkRes.check,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!schedulingEnabled()) {
    return jsonResponse({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const action = String(rec.action ?? 'book').trim().toLowerCase();

  if (action === 'notify-schedule-link') {
    return handleNotifyScheduleLink(id, event);
  }

  let proposedStart =
    resolveMeetingStartFromInbox({
      proposedMeetingStart: event.proposedMeetingStart,
      schedulingNote: event.schedulingNote,
      summary: event.summary,
      subject: event.subject,
      bodyText: event.bodyText,
      bodySnippet: event.bodySnippet,
      bodyHtml: event.bodyHtml,
      receivedAt: event.receivedAt,
    }) ?? null;
  if (!proposedStart && event.bookingStart) {
    proposedStart = event.bookingStart;
  }

  if (action === 'accept-notify' && !proposedStart) {
    return handleNotifyScheduleLink(id, event);
  }

  const company = await getCompanyConfig();
  const attendee = attendeeFromEmail({ from: event.from, contactName: event.contactName });

  if (action === 'prepare-project') {
    if (!event.bookingUid) {
      return jsonResponse({ ok: false, error: 'No booking on this message' }, 400);
    }
    const bookingStart = event.bookingStart || proposedStart;
    const suggestions = await openProjectSuggestions(event.contactUid);
    if (event.jobSlug) {
      return jsonResponse({
        ok: true,
        action: 'prepare-project',
        linked: true,
        jobSlug: event.jobSlug,
        jobTitle: event.jobTitle || event.jobSlug,
        proposedTitle: null,
        suggestions,
        bookingStart,
      });
    }
    const proposedTitle = previewMeetingProjectTitle({
      subject: event.subject,
      contactName: event.contactName,
      from: event.from,
      bookingStart,
    });
    return jsonResponse({
      ok: true,
      action: 'prepare-project',
      linked: false,
      jobSlug: null,
      jobTitle: null,
      proposedTitle,
      suggestions,
      bookingStart,
    });
  }

  if (action === 'attach-project') {
    if (!event.bookingUid) {
      return jsonResponse({ ok: false, error: 'No booking on this message' }, 400);
    }
    const bookingStart = event.bookingStart || proposedStart;
    if (!bookingStart) {
      return jsonResponse({ ok: false, error: 'No booking time on this message' }, 400);
    }
    const withProject = await attachMeetingProject(id, event, event.bookingUid, bookingStart);
    if (!withProject.jobSlug) {
      return jsonResponse({ ok: false, error: 'Could not create or link a project' }, 502);
    }
    return jsonResponse({
      ok: true,
      action: 'attach-project',
      jobSlug: withProject.jobSlug,
      jobTitle: withProject.jobTitle,
      event: withProject,
    });
  }

  if (action === 'confirm') {
    if (!event.bookingUid) {
      return jsonResponse({ ok: false, error: 'No booking on this message' }, 400);
    }
    const whenIso = event.bookingStart || proposedStart;
    if (!whenIso) {
      return jsonResponse({ ok: false, error: 'No booking time on this message' }, 400);
    }
    // Client already requested this meeting (often via a no-reply third-party
    // address) — confirm locally without emailing them back.
    const withProject = await attachMeetingProject(id, event, event.bookingUid, whenIso);
    const updated = await archiveAfterMeetingDecision(id, withProject);
    const whenLabel = formatWhenLabel(whenIso);
    return jsonResponse({
      ok: true,
      confirmed: true,
      notified: false,
      action: 'confirm',
      bookingUid: withProject.bookingUid,
      bookingStart: withProject.bookingStart,
      jobSlug: withProject.jobSlug,
      jobTitle: withProject.jobTitle,
      whenLabel,
      attendeeName: attendee.name,
      attendeeEmail: attendee.email,
      event: updated ?? withProject,
    });
  }

  if (!proposedStart) {
    return jsonResponse({ ok: false, error: 'No proposed meeting time on this message' }, 400);
  }

  const startRaw = rec.start != null ? String(rec.start).trim() : proposedStart;
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) {
    return jsonResponse({ ok: false, error: 'Invalid start time' }, 400);
  }

  const durationRaw = rec.durationMinutes ?? rec.duration_minutes;
  const explicitDuration =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? Math.round(durationRaw)
      : typeof durationRaw === 'string' && durationRaw.trim() && Number.isFinite(Number(durationRaw))
        ? Math.round(Number(durationRaw))
        : undefined;
  const inferredDuration = inferMeetingDurationMinutes(
    event.schedulingNote,
    event.subject,
    event.summary,
    event.bodySnippet || event.bodyText,
  );
  const bookingLength = await resolveBookingLength({
    durationMinutes: explicitDuration ?? inferredDuration ?? undefined,
    eventSlug:
      rec.eventSlug != null
        ? String(rec.eventSlug).trim()
        : rec.event_slug != null
          ? String(rec.event_slug).trim()
          : undefined,
  });

  const checkRes = await checkEmailMeetingSlot({
    proposedStart: start.toISOString(),
    from: event.from,
    contactName: event.contactName,
    durationMinutes: bookingLength.durationMinutes,
  });
  if (!checkRes.ok) return jsonResponse({ ok: false, error: checkRes.error }, 503);

  if (action === 'notify-conflict') {
    if (checkRes.check.available) {
      return jsonResponse(
        { ok: false, error: 'That time appears to be open — use Confirm instead', check: checkRes.check },
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
    if (!sent.ok) return jsonResponse({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);

    const updated = await archiveAfterMeetingDecision(id, event);
    return jsonResponse({
      ok: true,
      notified: true,
      action: 'notify-conflict',
      event: updated ?? event,
    });
  }

  if (event.bookingUid && action !== 'accept-notify' && action !== 'confirm') {
    const withProject = await attachMeetingProject(
      id,
      event,
      event.bookingUid,
      event.bookingStart || proposedStart,
    );
    return jsonResponse({
      ok: true,
      alreadyBooked: true,
      bookingUid: withProject.bookingUid,
      bookingStart: withProject.bookingStart,
      jobSlug: withProject.jobSlug,
      jobTitle: withProject.jobTitle,
      event: withProject,
    });
  }

  if (!checkRes.check.available && action === 'accept-notify') {
    return jsonResponse(
      {
        ok: false,
        error: checkRes.check.conflictReason || 'Time slot is not available',
        check: checkRes.check,
        proposedStart: start.toISOString(),
        proposedLabel: formatWhenLabel(start.toISOString()),
      },
      409,
    );
  }

  if (!checkRes.check.available && action === 'book') {
    return jsonResponse(
      {
        ok: false,
        error: checkRes.check.conflictReason || 'Time slot is not available',
        check: checkRes.check,
      },
      409,
    );
  }

  if (action === 'accept-notify' && event.bookingUid) {
    // Already on the calendar — ack without emailing. Inbound meeting requests
    // often come from no-reply third-party addresses.
    const withProject = await attachMeetingProject(
      id,
      event,
      event.bookingUid,
      event.bookingStart || start.toISOString(),
    );
    const updated = await archiveAfterMeetingDecision(id, withProject);
    return jsonResponse({
      ok: true,
      alreadyBooked: true,
      notified: false,
      action: 'accept-notify',
      bookingUid: withProject.bookingUid,
      bookingStart: withProject.bookingStart,
      jobSlug: withProject.jobSlug,
      jobTitle: withProject.jobTitle,
      event: updated ?? withProject,
    });
  }

  const vendorAppointment = isVendorConfirmedAppointment({
    from: event.from,
    subject: event.subject,
    bodyText: event.bodyText,
    bodySnippet: event.bodySnippet,
    bodyHtml: event.bodyHtml,
  });
  const meetingEvidence = inboundMeetingEvidence({
    subject: event.subject,
    bodyText: event.bodyText,
    bodySnippet: event.bodySnippet,
    bodyHtml: event.bodyHtml,
  });
  let bookName = attendee.name;
  let bookEmail = attendee.email;
  const addressFromBody = resolveBookingAddress(rec.address);
  const vendorLocation = vendorAppointment ? extractAppointmentLocation(meetingEvidence) : null;
  let bookAddress = vendorLocation || addressFromBody;

  const notes = [
    vendorAppointment ? `Vendor appointment (${attendee.name})` : null,
    `From inbox: ${event.subject || '(no subject)'}`,
    event.schedulingNote ? `Requested: ${event.schedulingNote}` : '',
    event.summary ? event.summary.slice(0, 200) : '',
  ]
    .filter(Boolean)
    .join('\n');

  let confirmContactUid: string | undefined;
  if (vendorAppointment) {
    const owner = await ownerBookingIdentity(context, userId, company.name);
    if (owner.email.includes('@')) {
      bookName = owner.name;
      bookEmail = owner.email;
    }
  } else {
    const ensuredContact = await ensureContactForMeetingEmail({
      from: event.from,
      bodyText: event.bodySnippet || event.bodyText || undefined,
      summary: event.summary || undefined,
      existingContactUid: event.contactUid,
      existingContactName: event.contactName,
    });
    confirmContactUid = ensuredContact?.ok ? ensuredContact.uid : undefined;
  }

  if (!bookEmail.includes('@')) {
    return jsonResponse({ ok: false, error: 'Could not determine attendee email from sender' }, 400);
  }

  const created = await bookingCreate({
    name: bookName,
    email: bookEmail,
    start: start.toISOString(),
    notes: notes.slice(0, 500),
    durationMinutes: bookingLength.durationMinutes,
    eventSlug: bookingLength.eventSlug,
    ...(bookAddress ? { address: bookAddress } : {}),
    ...(confirmContactUid ? { confirmContactUid } : {}),
  });
  if (!created.ok) {
    return jsonResponse(
      {
        ok: false,
        error: created.error,
        proposedStart: start.toISOString(),
        proposedLabel: formatWhenLabel(start.toISOString()),
        vendorAppointment,
        addressUsed: bookAddress || null,
      },
      created.status ?? 502,
    );
  }

  const bookingUid = created.data.booking?.uid ?? null;
  const bookingStart = created.data.booking?.startTime ?? start.toISOString();
  const durationMinutes =
    created.data.durationMinutes ?? bookingLength.durationMinutes ?? DEFAULT_MEETING_MINUTES;
  if (!bookingUid) {
    return jsonResponse({ ok: false, error: 'Booking API did not return a booking id' }, 502);
  }

  let updated = await storeUpdateEmailInbox(id, {
    action: 'booked',
    bookingUid,
    bookingStart,
  });
  if (!updated) return jsonResponse({ ok: false, error: 'Booked but failed to update inbox record' }, 500);

  updated = await attachMeetingProject(id, updated, bookingUid, bookingStart);

  if (action === 'accept-notify') {
    // Book + clear the review item. Do not email the requester — they initiated
    // via inbound mail (often a no-reply scheduling service).
    const filed = await archiveAfterMeetingDecision(id, updated);
    return jsonResponse({
      ok: true,
      booked: true,
      notified: false,
      action: 'accept-notify',
      bookingUid,
      bookingStart,
      durationMinutes,
      eventSlug: created.data.eventSlug ?? bookingLength.eventSlug ?? null,
      event: filed ?? updated,
    });
  }

  return jsonResponse({
    ok: true,
    bookingUid,
    bookingStart,
    durationMinutes,
    eventSlug: created.data.eventSlug ?? bookingLength.eventSlug ?? null,
    event: updated,
  });
}

function formatWhenLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: bookingTimezone(),
    });
  } catch {
    return iso;
  }
}
