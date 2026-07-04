/**
 * GET  /api/email/inbox/[id]/schedule — check proposed slot vs Cal.com
 * POST /api/email/inbox/[id]/schedule — book meeting and mark inbox item
 */

import type { APIContext } from 'astro';
import { bookingCreate, resolveBookingAddress } from '../../../../../lib/bookingClient';
import {
  storeGetEmailInbox,
  storeUpdateEmailInbox,
} from '../../../../../lib/emailInboxStore';
import {
  attendeeFromEmail,
  checkEmailMeetingSlot,
  DEFAULT_MEETING_MINUTES,
} from '../../../../../lib/emailScheduling';
import { hasFeature } from '../../../../../lib/features';

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

async function loadEmail(id: string) {
  const event = await storeGetEmailInbox(id);
  if (!event) return { error: 'Not found', status: 404 as const };
  if (!event.proposedMeetingStart) {
    return { error: 'No proposed meeting time on this message', status: 400 as const };
  }
  return { event };
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

  const { event } = loaded;
  const checkRes = await checkEmailMeetingSlot({
    proposedStart: event.proposedMeetingStart!,
    from: event.from,
    contactName: event.contactName,
  });
  if (!checkRes.ok) return json({ ok: false, error: checkRes.error }, 503);

  return json({
    ok: true,
    alreadyBooked: Boolean(event.bookingUid),
    bookingUid: event.bookingUid,
    bookingStart: event.bookingStart,
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

  const { event } = loaded;
  if (event.bookingUid) {
    return json({
      ok: true,
      alreadyBooked: true,
      bookingUid: event.bookingUid,
      bookingStart: event.bookingStart,
      event,
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const startRaw = rec.start != null ? String(rec.start).trim() : event.proposedMeetingStart!;
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
  if (!checkRes.check.available) {
    return json(
      {
        ok: false,
        error: checkRes.check.conflictReason || 'Time slot is not available',
        check: checkRes.check,
      },
      409,
    );
  }

  const attendee = attendeeFromEmail({ from: event.from, contactName: event.contactName });
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

  const created = await bookingCreate({
    name: attendee.name,
    email: attendee.email,
    start: start.toISOString(),
    notes: notes.slice(0, 500),
    ...(address ? { address } : {}),
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

  return json({
    ok: true,
    bookingUid,
    bookingStart,
    durationMinutes: DEFAULT_MEETING_MINUTES,
    event: updated,
  });
}
