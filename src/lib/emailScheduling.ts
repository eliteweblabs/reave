/**
 * Check proposed meeting times from inbox email against Cal.com availability.
 */

import { parseSenderEmail, parseSenderName } from './emailAddress';
import {
  bookingAvailability,
  bookingCreate,
  bookingList,
  isBookingConfigured,
  type AvailabilitySlot,
  type BookingSummary,
} from './bookingClient';

export const DEFAULT_MEETING_MINUTES = 30;
const SLOT_MATCH_MS = 5 * 60 * 1000;
const MAX_ALTERNATIVES = 6;

export type ScheduleSlot = AvailabilitySlot;

export type ScheduleCheckResult = {
  configured: boolean;
  proposedStart: string;
  proposedLabel: string;
  available: boolean;
  conflictReason: string | null;
  alternatives: ScheduleSlot[];
  attendeeName: string;
  attendeeEmail: string;
  durationMinutes: number;
};

function formatWhen(iso: string): string {
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

/** Human-readable meeting time for notifications and copy. */
export function formatMeetingWhenLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return formatWhen(iso);
  }
}

function overlapsExisting(
  start: Date,
  durationMinutes: number,
  bookings: BookingSummary[],
): BookingSummary | null {
  const endMs = start.getTime() + durationMinutes * 60 * 1000;
  for (const b of bookings) {
    const status = String(b.status || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'REJECTED') continue;
    const bStart = new Date(b.startTime).getTime();
    const bEnd = new Date(b.endTime).getTime();
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;
    if (start.getTime() < bEnd && endMs > bStart) return b;
  }
  return null;
}

function flattenOpenSlots(
  days: Array<{ date: string; slots: AvailabilitySlot[] }>,
): ScheduleSlot[] {
  const out: ScheduleSlot[] = [];
  const now = Date.now();
  for (const day of days) {
    for (const slot of day.slots ?? []) {
      const t = new Date(slot.iso).getTime();
      if (Number.isNaN(t) || t < now - SLOT_MATCH_MS) continue;
      out.push(slot);
    }
  }
  return out;
}

function pickAlternatives(
  proposed: Date,
  openSlots: ScheduleSlot[],
  bookings: BookingSummary[],
  durationMinutes: number,
): ScheduleSlot[] {
  const ranked = openSlots
    .filter((slot) => !overlapsExisting(new Date(slot.iso), durationMinutes, bookings))
    .sort(
      (a, b) =>
        Math.abs(new Date(a.iso).getTime() - proposed.getTime()) -
        Math.abs(new Date(b.iso).getTime() - proposed.getTime()),
    );
  const seen = new Set<string>();
  const out: ScheduleSlot[] = [];
  for (const slot of ranked) {
    if (seen.has(slot.iso)) continue;
    seen.add(slot.iso);
    out.push(slot);
    if (out.length >= MAX_ALTERNATIVES) break;
  }
  return out;
}

export function attendeeFromEmail(input: {
  from: string;
  contactName?: string | null;
}): { name: string; email: string } {
  const email = parseSenderEmail(input.from);
  const parsedName = parseSenderName(input.from);
  const name = (input.contactName || parsedName || email.split('@')[0] || 'Guest').trim();
  return { name, email: email.includes('@') ? email : '' };
}

export function parseProposedMeetingStart(raw: unknown): string | null {
  if (raw == null || raw === 'null') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function parseTimeFromSchedulingText(text: string): { hour: number; minute: number } | null {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = (m[3] || '').toLowerCase().replace(/\./g, '').replace(/\s/g, '');
  if (meridiem.startsWith('p') && hour < 12) hour += 12;
  if (meridiem.startsWith('a') && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseWeekdayFromSchedulingText(text: string): { day: number; next: boolean } | null {
  const lower = text.toLowerCase();
  const next = /\bnext\b/.test(lower);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`, 'i').test(lower)) return { day: i, next };
  }
  return null;
}

/** Best-effort parse of phrases like "next Tuesday at 2:00 p.m." relative to receivedAt. */
export function parseRelativeMeetingTime(text: string, ref: Date): string | null {
  const source = String(text || '').trim();
  if (!source) return null;
  const time = parseTimeFromSchedulingText(source);
  if (!time) return null;

  const weekday = parseWeekdayFromSchedulingText(source);
  const target = new Date(ref);

  if (weekday) {
    const refDay = ref.getDay();
    let daysAhead = (weekday.day - refDay + 7) % 7;
    if (weekday.next && daysAhead === 0) daysAhead = 7;
    else if (!weekday.next && daysAhead === 0) {
      target.setHours(time.hour, time.minute, 0, 0);
      if (target.getTime() <= ref.getTime()) daysAhead = 7;
    }
    target.setDate(ref.getDate() + daysAhead);
  }

  target.setHours(time.hour, time.minute, 0, 0);
  if (target.getTime() <= ref.getTime()) return null;
  return target.toISOString();
}

export function resolveProposedMeetingStart(input: {
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  summary?: string | null;
  receivedAt?: string | null;
}): string | null {
  const direct = parseProposedMeetingStart(input.proposedMeetingStart);
  if (direct) return direct;

  const ref = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(ref.getTime())) return null;

  for (const candidate of [input.schedulingNote, input.summary]) {
    const parsed = parseRelativeMeetingTime(String(candidate || ''), ref);
    if (parsed) return parsed;
  }
  return null;
}

export function buildMeetingAcceptNotifyEmail(input: {
  attendeeName: string;
  whenLabel: string;
  companyName?: string | null;
}): { subject: string; text: string } {
  const name = input.attendeeName.trim() || 'there';
  const when = input.whenLabel.trim();
  const signOff = input.companyName?.trim() || 'Thanks';
  const text = [
    `Hi ${name},`,
    '',
    when
      ? `Thanks for reaching out. I've confirmed our meeting for ${when}.`
      : `Thanks for reaching out. I've confirmed our meeting.`,
    '',
    'Looking forward to speaking with you.',
    '',
    signOff,
  ].join('\n');
  return { subject: 'Meeting confirmed', text };
}

export function buildMeetingSlotBookedEmail(input: {
  attendeeName: string;
  whenLabel: string;
  companyName?: string | null;
}): { subject: string; text: string } {
  const name = input.attendeeName.trim() || 'there';
  const when = input.whenLabel.trim();
  const signOff = input.companyName?.trim() || 'Thanks';
  const text = [
    `Hi ${name},`,
    '',
    when
      ? `Thanks for your message. Unfortunately I'm already booked at ${when}.`
      : `Thanks for your message. Unfortunately that time is already booked.`,
    '',
    "I'd be happy to find another time — I'll follow up shortly with some options.",
    '',
    signOff,
  ].join('\n');
  return { subject: 'Re: Meeting time', text };
}

export async function checkEmailMeetingSlot(input: {
  proposedStart: string;
  from: string;
  contactName?: string | null;
  durationMinutes?: number;
}): Promise<{ ok: true; check: ScheduleCheckResult } | { ok: false; error: string }> {
  if (!isBookingConfigured()) {
    return { ok: false, error: 'BOOKING_API_URL is not set' };
  }

  const proposed = new Date(input.proposedStart);
  if (Number.isNaN(proposed.getTime())) {
    return { ok: false, error: 'Invalid proposed meeting time' };
  }

  const durationMinutes = input.durationMinutes ?? DEFAULT_MEETING_MINUTES;
  const attendee = attendeeFromEmail(input);

  const [availRes, listRes] = await Promise.all([
    bookingAvailability(),
    bookingList({ upcoming: true, limit: 100 }),
  ]);

  const bookings = listRes.ok ? listRes.data.bookings : [];
  const openSlots = availRes.ok ? flattenOpenSlots(availRes.data.days) : [];

  const onCalendar = overlapsExisting(proposed, durationMinutes, bookings);

  let available = false;
  let conflictReason: string | null = null;

  if (onCalendar) {
    conflictReason = `Conflicts with ${onCalendar.attendee || 'another booking'} at ${formatWhen(onCalendar.startTime)}`;
  } else {
    // Only block on overlapping bookings. Cal.com availability slots can be
    // incomplete (hours, buffers, API limits) — let bookingCreate be final.
    available = true;
  }

  const alternatives = available
    ? []
    : pickAlternatives(proposed, openSlots, bookings, durationMinutes);

  return {
    ok: true,
    check: {
      configured: true,
      proposedStart: proposed.toISOString(),
      proposedLabel: formatWhen(proposed.toISOString()),
      available,
      conflictReason,
      alternatives,
      attendeeName: attendee.name,
      attendeeEmail: attendee.email,
      durationMinutes,
    },
  };
}

export type AutoBookMeetingResult =
  | {
      ok: true;
      bookingUid: string;
      bookingStart: string;
      whenLabel: string;
      routeNote: string;
    }
  | {
      ok: false;
      reason: 'not_configured' | 'unavailable' | 'no_attendee' | 'invalid_time' | 'booking_failed';
      error?: string;
    };

/** Book an inbound meeting request when the proposed slot is open. */
export async function tryAutoBookInboundMeeting(input: {
  proposedStart: string;
  from: string;
  contactName?: string | null;
  subject: string;
  schedulingNote?: string;
  summary?: string;
}): Promise<AutoBookMeetingResult> {
  if (!isBookingConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const proposed = new Date(input.proposedStart);
  if (Number.isNaN(proposed.getTime())) {
    return { ok: false, reason: 'invalid_time' };
  }

  const checkRes = await checkEmailMeetingSlot({
    proposedStart: proposed.toISOString(),
    from: input.from,
    contactName: input.contactName,
  });
  if (!checkRes.ok) {
    return { ok: false, reason: 'booking_failed', error: checkRes.error };
  }
  if (!checkRes.check.available) {
    return { ok: false, reason: 'unavailable', error: checkRes.check.conflictReason ?? undefined };
  }

  const attendee = attendeeFromEmail({ from: input.from, contactName: input.contactName });
  if (!attendee.email.includes('@')) {
    return { ok: false, reason: 'no_attendee' };
  }

  const notes = [
    `From inbox: ${input.subject || '(no subject)'}`,
    input.schedulingNote ? `Requested: ${input.schedulingNote}` : '',
    input.summary ? input.summary.slice(0, 200) : '',
  ]
    .filter(Boolean)
    .join('\n');

  const created = await bookingCreate({
    name: attendee.name,
    email: attendee.email,
    start: proposed.toISOString(),
    notes: notes.slice(0, 500),
  });
  if (!created.ok) {
    return { ok: false, reason: 'booking_failed', error: created.error };
  }

  const bookingUid = created.data.booking?.uid ?? null;
  const bookingStart = created.data.booking?.startTime ?? proposed.toISOString();
  if (!bookingUid) {
    return { ok: false, reason: 'booking_failed', error: 'Booking API did not return a booking id' };
  }

  const whenLabel = formatMeetingWhenLabel(bookingStart);
  return {
    ok: true,
    bookingUid,
    bookingStart,
    whenLabel,
    routeNote: `Meeting scheduled automatically for ${whenLabel}`,
  };
}
