/**
 * Check proposed meeting times from inbox email against Cal.com availability.
 */

import { parseSenderEmail, parseSenderName } from './emailAddress';
import {
  bookingAvailability,
  bookingCreate,
  bookingGet,
  bookingList,
  isBookingConfigured,
  type AvailabilitySlot,
  type BookingSummary,
} from './bookingClient';
import { siteBaseUrl } from './contactApi';
import { bookingCalendarUrl, mapsDirectionsUrl } from './calendarLinks';
import { scheduleFormUrl } from './inboundEmailReply';

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

function daysToStartOfNextCalendarWeek(refDay: number): number {
  // Calendar weeks start Monday; refDay is JS getDay() (0=Sun … 6=Sat).
  if (refDay === 0) return 1;
  return (8 - refDay) % 7 || 7;
}

function parseWeekdayFromSchedulingText(
  text: string,
): { day: number; modifier: 'next_week' | 'next' | null } | null {
  const lower = text.toLowerCase();
  const nextWeek = /\bnext\s+week\b/.test(lower);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (!new RegExp(`\\b${WEEKDAYS[i]}\\b`, 'i').test(lower)) continue;
    const nextDay =
      !nextWeek && new RegExp(`\\bnext\\s+${WEEKDAYS[i]}\\b`, 'i').test(lower);
    const modifier = nextWeek ? 'next_week' : nextDay ? 'next' : null;
    return { day: i, modifier };
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
    let daysAhead: number;

    if (weekday.modifier === 'next_week') {
      const daysFromMonday = (weekday.day - 1 + 7) % 7;
      daysAhead = daysToStartOfNextCalendarWeek(refDay) + daysFromMonday;
    } else {
      daysAhead = (weekday.day - refDay + 7) % 7;
      if (weekday.modifier === 'next') {
        daysAhead = daysAhead === 0 ? 7 : daysAhead + 7;
      } else if (daysAhead === 0) {
        target.setHours(time.hour, time.minute, 0, 0);
        if (target.getTime() <= ref.getTime()) daysAhead = 7;
      }
    }
    target.setDate(ref.getDate() + daysAhead);
  }

  target.setHours(time.hour, time.minute, 0, 0);
  if (target.getTime() <= ref.getTime()) return null;
  return target.toISOString();
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

/** Parse explicit calendar dates like "Wednesday, July 22, 2026 at 2:00 PM". */
export function parseExplicitMeetingDateTime(text: string, ref: Date): string | null {
  const source = String(text || '').trim();
  if (!source) return null;
  const time = parseTimeFromSchedulingText(source);
  if (!time) return null;

  const namedMonth = source.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
  );
  if (namedMonth) {
    const month = MONTH_INDEX[namedMonth[1].toLowerCase().replace(/\.$/, '')];
    if (month === undefined) return null;
    const day = parseInt(namedMonth[2], 10);
    let year = namedMonth[3] ? parseInt(namedMonth[3], 10) : ref.getFullYear();
    const target = new Date(year, month, day, time.hour, time.minute, 0, 0);
    if (!namedMonth[3] && target.getTime() <= ref.getTime()) {
      target.setFullYear(year + 1);
    }
    if (target.getTime() <= ref.getTime()) return null;
    return target.toISOString();
  }

  const numeric = source.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numeric) {
    let year = parseInt(numeric[3], 10);
    if (year < 100) year += 2000;
    const month = parseInt(numeric[1], 10) - 1;
    const day = parseInt(numeric[2], 10);
    const target = new Date(year, month, day, time.hour, time.minute, 0, 0);
    if (target.getTime() <= ref.getTime()) return null;
    return target.toISOString();
  }

  return null;
}

export function resolveProposedMeetingStart(input: {
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  summary?: string | null;
  bodyText?: string | null;
  receivedAt?: string | null;
}): string | null {
  const direct = parseProposedMeetingStart(input.proposedMeetingStart);
  if (direct) return direct;

  const ref = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(ref.getTime())) return null;

  for (const candidate of [input.schedulingNote, input.summary, input.bodyText]) {
    const text = String(candidate || '').trim();
    if (!text) continue;
    const explicit = parseExplicitMeetingDateTime(text, ref);
    if (explicit) return explicit;
    const parsed = parseRelativeMeetingTime(text, ref);
    if (parsed) return parsed;
  }
  return null;
}

function firstNameFrom(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0] || 'there';
}

export type MeetingEmail = { subject: string; text: string; html?: string };

/**
 * Meeting-confirmation reply sent after a booking is accepted. Returns a
 * plain-text body (threaded personal reply) plus a branded HTML version with a
 * "Manage your appointment" button when a Cal.com manage link is available, so
 * the attendee can reschedule or cancel themselves.
 */
export async function buildMeetingAcceptNotifyEmail(input: {
  attendeeName: string;
  whenLabel: string;
  companyName?: string | null;
  /** Cal.com booking page where the attendee can reschedule/cancel. */
  manageUrl?: string | null;
  /** Optional meeting location shown as a "Where" row. */
  locationLabel?: string | null;
  /** When set, enriches location/times and enables an Add to calendar link. */
  bookingUid?: string | null;
}): Promise<MeetingEmail> {
  const name = input.attendeeName.trim() || 'there';
  const when = input.whenLabel.trim();
  const manageUrl = input.manageUrl?.trim() || '';
  let location = input.locationLabel?.trim() || '';
  const signOff = input.companyName?.trim() || 'Thanks';
  const bookingUid = input.bookingUid?.trim() || '';

  if (bookingUid) {
    try {
      const got = await bookingGet(bookingUid);
      if (got.ok && !location) {
        location = got.data.booking.location?.trim() || '';
      }
    } catch {
      // best-effort — keep caller-provided location
    }
  }

  const calendarUrl = bookingUid ? bookingCalendarUrl(bookingUid) : '';
  const directionsUrl = location ? mapsDirectionsUrl(location) : '';

  const text = [
    `Hi ${name},`,
    '',
    when
      ? `Thanks for reaching out. I've confirmed our meeting for ${when}.`
      : `Thanks for reaching out. I've confirmed our meeting.`,
    calendarUrl ? `Add to calendar: ${calendarUrl}` : '',
    location ? `Where: ${location}` : '',
    directionsUrl ? `Directions: ${directionsUrl}` : '',
    '',
    'Looking forward to speaking with you.',
    manageUrl ? '' : '',
    manageUrl ? `Need to reschedule or cancel? Manage your appointment here:` : '',
    manageUrl ? manageUrl : '',
    '',
    signOff,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const { brandedEmailHtml } = await import('./emailTemplates');
  const metaRows: [string, string, string?][] = [];
  if (when) metaRows.push(['When', when, calendarUrl || undefined]);
  if (location) metaRows.push(['Where', location, directionsUrl || undefined]);
  const html = await brandedEmailHtml({
    firstName: firstNameFrom(name),
    paragraphs: [
      "Thanks for reaching out — your meeting is confirmed.",
      'Looking forward to speaking with you.',
    ],
    metaRows,
    cta: manageUrl ? { label: 'Manage your appointment', url: manageUrl } : undefined,
    note: manageUrl
      ? 'Need to make a change? Use the button above to reschedule or cancel — no account required.'
      : undefined,
  });

  return { subject: 'Meeting confirmed', text, html };
}

/**
 * Reply sent when the attendee's requested time is already booked. Branded HTML
 * with an optional "See available times" button pointing at the public booking
 * page so they can self-serve a new slot.
 */
export async function buildMeetingSlotBookedEmail(input: {
  attendeeName: string;
  whenLabel: string;
  companyName?: string | null;
  /** Public Cal.com booking page for picking another time. */
  bookingUrl?: string | null;
}): Promise<MeetingEmail> {
  const name = input.attendeeName.trim() || 'there';
  const when = input.whenLabel.trim();
  const bookingUrl = input.bookingUrl?.trim() || '';
  const signOff = input.companyName?.trim() || 'Thanks';

  const text = [
    `Hi ${name},`,
    '',
    when
      ? `Thanks for your message. Unfortunately I'm already booked at ${when}.`
      : `Thanks for your message. Unfortunately that time is already booked.`,
    '',
    bookingUrl
      ? 'You can grab another time that works for you here:'
      : "I'd be happy to find another time — I'll follow up shortly with some options.",
    bookingUrl ? bookingUrl : '',
    '',
    signOff,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const { brandedEmailHtml } = await import('./emailTemplates');
  const html = await brandedEmailHtml({
    firstName: firstNameFrom(name),
    paragraphs: [
      when
        ? `Thanks for your message — unfortunately I'm already booked at ${when}.`
        : 'Thanks for your message — unfortunately that time is already booked.',
      bookingUrl
        ? 'No problem though — you can grab another time that works for you below.'
        : "I'd be happy to find another time — I'll follow up shortly with some options.",
    ],
    cta: bookingUrl ? { label: 'See available times', url: bookingUrl } : undefined,
  });

  return { subject: 'Re: Meeting time', text, html };
}

function extractDomainFromText(text: string): string | null {
  const m = text.match(
    /\b([a-z0-9][-a-z0-9]*\.(?:com|org|net|io|app|co|dev|us|uk|edu|gov|biz|info))\b/i,
  );
  return m?.[1]?.toLowerCase() ?? null;
}

function projectContextPhrase(input: {
  jobTitle?: string | null;
  summary?: string | null;
  subject?: string | null;
}): string {
  const blob = [input.summary, input.subject, input.jobTitle].filter(Boolean).join(' ');
  const domain = extractDomainFromText(blob);
  if (domain) {
    return `the project files for the ${domain} rebuild`;
  }
  const title = input.jobTitle?.trim();
  if (title && !/^new project$/i.test(title)) {
    return `your request about "${title}"`;
  }
  return 'your project request';
}

/**
 * Branded acknowledgment sent when a new project is auto-created from inbound email.
 */
export async function buildNewProjectAckEmail(input: {
  attendeeName: string;
  jobTitle?: string | null;
  summary?: string | null;
  subject?: string | null;
  companyName?: string | null;
  scheduleUrl?: string | null;
}): Promise<MeetingEmail> {
  const name = input.attendeeName.trim() || 'there';
  const signOff = input.companyName?.trim() || 'Thanks';
  const context = projectContextPhrase(input);
  const scheduleUrl = input.scheduleUrl?.trim() || scheduleFormUrl(siteBaseUrl());

  const paragraphs = [
    `Thanks for sending over ${context}. I've reviewed your request and I'm excited to discuss your vision for this project.`,
    scheduleUrl
      ? 'You can schedule a time that works for you using the link below — or reply with your availability and I can suggest some specific times.'
      : 'Reply with your availability and I can suggest some times to connect.',
    'Looking forward to connecting!',
  ];

  const text = [
    `Hi ${name},`,
    '',
    paragraphs[0],
    '',
    scheduleUrl ? `Schedule a time: ${scheduleUrl}` : '',
    scheduleUrl ? '' : '',
    paragraphs[1],
    '',
    signOff,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

  const { brandedEmailHtml } = await import('./emailTemplates');
  const html = await brandedEmailHtml({
    firstName: firstNameFrom(name),
    paragraphs,
    cta: scheduleUrl ? { label: 'Schedule a meeting', url: scheduleUrl } : undefined,
  });

  const subjectBase = input.subject?.trim() || input.jobTitle?.trim() || 'your project';
  return { subject: `Re: ${subjectBase} — Let's schedule a meeting`, text, html };
}

/**
 * Branded reply when a client wants to meet but did not propose a specific time.
 */
export async function buildMeetingScheduleInviteEmail(input: {
  attendeeName: string;
  companyName?: string | null;
  scheduleUrl?: string | null;
  bookingUrl?: string | null;
}): Promise<MeetingEmail> {
  const name = input.attendeeName.trim() || 'there';
  const signOff = input.companyName?.trim() || 'Thanks';
  const scheduleUrl =
    input.scheduleUrl?.trim() ||
    input.bookingUrl?.trim() ||
    scheduleFormUrl(siteBaseUrl());

  const paragraphs = [
    "Thanks for reaching out — I'd love to connect.",
    'Pick a time that works for you using the link below, or reply with your availability.',
  ];

  const text = [
    `Hi ${name},`,
    '',
    paragraphs[0],
    paragraphs[1],
    '',
    scheduleUrl,
    '',
    signOff,
  ].join('\n');

  const { brandedEmailHtml } = await import('./emailTemplates');
  const html = await brandedEmailHtml({
    firstName: firstNameFrom(name),
    paragraphs,
    cta: { label: 'Schedule a meeting', url: scheduleUrl },
  });

  return { subject: "Re: Let's schedule a meeting", text, html };
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
  /**
   * Known contact uid for the sender (resolved by exact email). Passed through
   * to the booking service so it skips its fuzzy name match instead of
   * silently failing to auto-book when a sender's name loosely matches an
   * unrelated existing contact.
   */
  confirmContactUid?: string;
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
    ...(input.confirmContactUid ? { confirmContactUid: input.confirmContactUid } : {}),
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
