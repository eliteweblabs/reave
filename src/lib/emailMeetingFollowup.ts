/**
 * Detect when a client emails about an existing booked meeting (confirmation, follow-up).
 */

import { parseSenderEmail, parseSenderName } from './emailAddress';
import { bookingList, isBookingConfigured } from './bookingClient';
import { storeListEmailInbox } from './emailInboxStore';
import { formatMeetingWhenLabel } from './emailScheduling';

export type RelatedBooking = {
  uid: string;
  startTime: string;
  attendeeName: string;
};

function displayFirstName(input: { contactName?: string | null; from: string }): string {
  const fromName = parseSenderName(input.from);
  const raw = (input.contactName || fromName || '').trim();
  if (!raw) return 'Client';
  return raw.split(/\s+/)[0] || 'Client';
}

function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isActiveBookingStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s !== 'CANCELLED' && s !== 'REJECTED';
}

function looksLikeInitialMeetingRequest(blob: string): boolean {
  return /\b(can we meet|could we meet|would you be available|do you have time|let'?s schedule|let'?s find a time|pick a time|book a time|works for you|work for you|available (?:on|at|this)|free (?:on|at|this))\b/i.test(
    blob,
  );
}

export function looksLikeMeetingFollowUp(input: {
  subject?: string;
  summary?: string;
  bodyText?: string;
}): boolean {
  const blob = [input.subject, input.summary, input.bodyText].join(' ').trim();
  if (!blob) return false;
  if (!/\b(meet(ing)?|call|appointment|calendar|zoom|teams|sync|chat)\b/i.test(blob)) {
    return false;
  }
  if (looksLikeInitialMeetingRequest(blob)) return false;

  if (
    /\b(see you|looking forward|still on|still good|still works|still happening|confirmed|confirmation|confirm(?:ed|ing)?(?:\s+the|\s+our|\s+that)?\s+(?:meet|call|appointment|time|slot)?|thanks for confirm|following up (?:on|about)|follow.?up (?:on|about)|as discussed|per our (?:call|meeting)|reminder about|about our (?:meet|call|appointment)|re:?\s*(?:our|the)\s+(?:meet|call|appointment))\b/i.test(
      blob,
    )
  ) {
    return true;
  }

  if (/\b(re:\s*)?(meeting\s+)?(confirm|confirmed|follow.?up|reminder)\b/i.test(input.subject || '')) {
    return true;
  }

  return false;
}

function scoreBookingTimeMatch(startTime: string, proposedStart?: string | null): number {
  if (!proposedStart) return 0;
  const b = new Date(startTime).getTime();
  const p = new Date(proposedStart).getTime();
  if (Number.isNaN(b) || Number.isNaN(p)) return 0;
  return -Math.abs(b - p);
}

export async function findRelatedBookingForAttendee(input: {
  attendeeEmail: string;
  proposedStart?: string | null;
}): Promise<RelatedBooking | null> {
  const email = input.attendeeEmail.trim().toLowerCase();
  if (!email.includes('@')) return null;

  const candidates: RelatedBooking[] = [];
  const now = Date.now();
  const lookbackMs = 24 * 60 * 60 * 1000;
  const lookaheadMs = 21 * 24 * 60 * 60 * 1000;

  if (isBookingConfigured()) {
    const listRes = await bookingList({ upcoming: true, limit: 100 });
    if (listRes.ok) {
      for (const b of listRes.data.bookings) {
        if (!isActiveBookingStatus(b.status)) continue;
        if (!emailsMatch(b.email, email)) continue;
        const t = new Date(b.startTime).getTime();
        if (Number.isNaN(t) || t < now - lookbackMs || t > now + lookaheadMs) continue;
        candidates.push({
          uid: b.uid,
          startTime: b.startTime,
          attendeeName: b.attendee || email,
        });
      }
    }
  }

  const inboxEvents = await storeListEmailInbox(100, { hideJunk: true });
  for (const e of inboxEvents) {
    if (!e.bookingUid) continue;
    const sender = parseSenderEmail(e.from || '');
    if (!emailsMatch(sender, email)) continue;
    const start = e.bookingStart || e.proposedMeetingStart;
    if (!start) continue;
    const t = new Date(start).getTime();
    if (Number.isNaN(t) || t < now - lookbackMs || t > now + lookaheadMs) continue;
    if (candidates.some((c) => c.uid === e.bookingUid)) continue;
    candidates.push({
      uid: e.bookingUid,
      startTime: start,
      attendeeName: e.contactName || sender,
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const scoreA = scoreBookingTimeMatch(a.startTime, input.proposedStart);
    const scoreB = scoreBookingTimeMatch(b.startTime, input.proposedStart);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return candidates[0] ?? null;
}

export function buildMeetingFollowupNotificationTitle(input: {
  contactName?: string | null;
  from: string;
}): string {
  const who = displayFirstName(input);
  return `Meeting follow-up from ${who}.`;
}

export async function detectMeetingFollowUp(input: {
  from: string;
  contactName?: string | null;
  subject: string;
  summary: string;
  bodyText: string;
  proposedMeetingStart?: string | null;
}): Promise<{
  booking: RelatedBooking;
  routeNote: string;
  notificationTitle: string;
} | null> {
  if (
    !looksLikeMeetingFollowUp({
      subject: input.subject,
      summary: input.summary,
      bodyText: input.bodyText,
    })
  ) {
    return null;
  }

  const attendeeEmail = parseSenderEmail(input.from);
  const related = await findRelatedBookingForAttendee({
    attendeeEmail,
    proposedStart: input.proposedMeetingStart,
  });
  if (!related) return null;

  const whenLabel = formatMeetingWhenLabel(related.startTime);
  return {
    booking: related,
    routeNote: `Meeting follow-up about ${whenLabel}`,
    notificationTitle: buildMeetingFollowupNotificationTitle({
      contactName: input.contactName,
      from: input.from,
    }),
  };
}
