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
import { sendInboundThreadReply } from '../../../../../lib/inboundEmailReply';
import {
  attendeeFromEmail,
  buildMeetingScheduleInviteEmail,
  buildMeetingSlotBookedEmail,
  checkEmailMeetingSlot,
  DEFAULT_MEETING_MINUTES,
  resolveProposedMeetingStart,
} from '../../../../../lib/emailScheduling';
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
    resolveProposedMeetingStart({
      proposedMeetingStart: event.proposedMeetingStart,
      schedulingNote: event.schedulingNote,
      summary: event.summary,
      bodyText: event.bodySnippet || event.bodyText,
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
    .filter((j) => j.status === 'inquiry' || j.status === 'active')
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
    return json({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);
  }
  const updated = await storeUpdateEmailInbox(id, {
    action: 'filed',
    status: 'FILED',
    acceptAutomationDecision: true,
    markAutomationAck: true,
  });
  return json({
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
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!schedulingEnabled()) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);

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
    resolveProposedMeetingStart({
      proposedMeetingStart: event.proposedMeetingStart,
      schedulingNote: event.schedulingNote,
      summary: event.summary,
      bodyText: event.bodySnippet || event.bodyText,
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
      return json({ ok: false, error: 'No booking on this message' }, 400);
    }
    const bookingStart = event.bookingStart || proposedStart;
    const suggestions = await openProjectSuggestions(event.contactUid);
    if (event.jobSlug) {
      return json({
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
    return json({
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
      return json({ ok: false, error: 'No booking on this message' }, 400);
    }
    const bookingStart = event.bookingStart || proposedStart;
    if (!bookingStart) {
      return json({ ok: false, error: 'No booking time on this message' }, 400);
    }
    const withProject = await attachMeetingProject(id, event, event.bookingUid, bookingStart);
    if (!withProject.jobSlug) {
      return json({ ok: false, error: 'Could not create or link a project' }, 502);
    }
    return json({
      ok: true,
      action: 'attach-project',
      jobSlug: withProject.jobSlug,
      jobTitle: withProject.jobTitle,
      event: withProject,
    });
  }

  if (action === 'confirm') {
    if (!event.bookingUid) {
      return json({ ok: false, error: 'No booking on this message' }, 400);
    }
    const whenIso = event.bookingStart || proposedStart;
    if (!whenIso) {
      return json({ ok: false, error: 'No booking time on this message' }, 400);
    }
    // Client already requested this meeting (often via a no-reply third-party
    // address) — confirm locally without emailing them back.
    const withProject = await attachMeetingProject(id, event, event.bookingUid, whenIso);
    const updated = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      acceptAutomationDecision: true,
      markAutomationAck: true,
    });
    const whenLabel = formatWhenLabel(whenIso);
    return json({
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
    return json({ ok: false, error: 'No proposed meeting time on this message' }, 400);
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
    if (!sent.ok) return json({ ok: false, error: sent.error }, sent.error.includes('configured') ? 503 : 502);

    const updated = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      acceptAutomationDecision: true,
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
    const withProject = await attachMeetingProject(
      id,
      event,
      event.bookingUid,
      event.bookingStart || proposedStart,
    );
    return json({
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
    // Already on the calendar — ack without emailing. Inbound meeting requests
    // often come from no-reply third-party addresses.
    const withProject = await attachMeetingProject(
      id,
      event,
      event.bookingUid,
      event.bookingStart || start.toISOString(),
    );
    const updated = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      acceptAutomationDecision: true,
      markAutomationAck: true,
    });
    return json({
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

  let updated = await storeUpdateEmailInbox(id, {
    action: 'booked',
    bookingUid,
    bookingStart,
  });
  if (!updated) return json({ ok: false, error: 'Booked but failed to update inbox record' }, 500);

  updated = await attachMeetingProject(id, updated, bookingUid, bookingStart);

  if (action === 'accept-notify') {
    // Book + clear the review item. Do not email the requester — they initiated
    // via inbound mail (often a no-reply scheduling service).
    const filed = await storeUpdateEmailInbox(id, {
      action: 'filed',
      status: 'FILED',
      acceptAutomationDecision: true,
      markAutomationAck: true,
    });
    return json({
      ok: true,
      booked: true,
      notified: false,
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
