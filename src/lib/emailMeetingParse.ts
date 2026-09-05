/**
 * Ground inbound meeting datetimes in the email text.
 * Clock times must be written as 2pm / 2:00 PM / 14:30 — never inferred from
 * IP octets, street numbers, or date-only deadlines.
 */

import { htmlToPlainText } from './emailBody';

const DEFAULT_MEETING_DISPLAY_TZ = 'America/New_York';

function meetingDisplayTimeZone(): string {
  const fromEnv =
    typeof process !== 'undefined' ? String(process.env?.BOOKING_TIMEZONE || '').trim() : '';
  return fromEnv || DEFAULT_MEETING_DISPLAY_TZ;
}

/** Calendar parts for a UTC instant in the install booking timezone. */
function datePartsInTimeZone(
  instant: Date,
  timeZone: string,
): { year: number; monthIndex: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  const weekdayName = String(parts.weekday || '').toLowerCase();
  const weekday = WEEKDAYS.indexOf(weekdayName as (typeof WEEKDAYS)[number]);
  return {
    year: Number(parts.year),
    monthIndex: Number(parts.month) - 1,
    day: Number(parts.day),
    weekday: weekday >= 0 ? weekday : instant.getUTCDay(),
  };
}

function addCalendarDaysInTimeZone(
  year: number,
  monthIndex: number,
  day: number,
  days: number,
  timeZone: string,
): { year: number; monthIndex: number; day: number } {
  const anchor = wallClockInTimeZoneToIso(year, monthIndex, day, 12, 0, timeZone);
  const shifted = new Date(anchor);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  const parts = datePartsInTimeZone(shifted, timeZone);
  return { year: parts.year, monthIndex: parts.monthIndex, day: parts.day };
}

/** Interpret email wall clock in BOOKING_TIMEZONE — Railway runs in UTC. */
export function wallClockInTimeZoneToIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = meetingDisplayTimeZone(),
): string {
  let utcMs = Date.UTC(year, monthIndex, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
    const shown = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    utcMs += Date.UTC(year, monthIndex, day, hour, minute, 0) - shown;
  }
  return new Date(utcMs).toISOString();
}

export function extractAppointmentLocation(text: string): string | null {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (
      /\b\d{1,6}\s+[A-Za-z0-9][\w\s.'#-]*\b(?:Street|St|Avenue|Ave|Road|Rd|Way|Blvd|Boulevard|Drive|Dr|Lane|Ln|Parkway|Pkwy|Highway|Hwy|Circle|Cir|Court|Ct)\b\.?/i.test(
        line,
      )
    ) {
      const next = lines[i + 1];
      if (next && /,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\b/.test(next)) {
        return `${line}, ${next}`.slice(0, 240);
      }
      if (/,?\s*[A-Z]{2}\s+\d{5}\b/.test(line)) return line.slice(0, 240);
    }
  }
  return null;
}

export function isVendorConfirmedAppointment(input: {
  subject?: string | null;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  from?: string | null;
}): boolean {
  const evidence = inboundMeetingEvidence(input);
  if (!looksLikeConfirmedAppointment(evidence)) return false;
  const from = String(input.from || '').toLowerCase();
  if (
    /\b(best\s*buy|geek\s*squad|apple|genius\s*bar|booksy|noreply|no-reply|donotreply)\b/i.test(
      from,
    )
  ) {
    return true;
  }
  return /\b(info|support|notify|notification)@/i.test(from);
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

const CLOCK_NEAR_DATE_CHARS = 100;

/** Categories that must never spawn a meeting banner (vendor alerts, receipts, auth). */
export const MEETING_SKIP_CATEGORIES = new Set([
  'alert',
  'junk',
  'auto_deleted',
  'receipt',
  'otp',
  'auth_link',
]);

type ClockHit = { hour: number; minute: number; index: number; length: number };

/**
 * Real clock times only: "2pm", "2:00 PM", "14:30".
 * Bare digits (IP octets, "600 Congress", "10%") are not times.
 */
export function parseAllClockTimes(text: string): ClockHit[] {
  const source = String(text || '');
  const hits: ClockHit[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  const meridiemRe = /(?<!\d)(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi;
  for (const m of source.matchAll(meridiemRe)) {
    if (m.index == null) continue;
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (hour < 1 || hour > 12 || minute > 59) continue;
    const meridiem = m[3].toLowerCase().replace(/\./g, '').replace(/\s/g, '');
    if (meridiem.startsWith('p') && hour < 12) hour += 12;
    if (meridiem.startsWith('a') && hour === 12) hour = 0;
    hits.push({ hour, minute, index: m.index, length: m[0].length });
    occupied.push({ start: m.index, end: m.index + m[0].length });
  }

  const hhmmRe = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g;
  for (const m of source.matchAll(hhmmRe)) {
    if (m.index == null) continue;
    const end = m.index + m[0].length;
    if (occupied.some((span) => m.index < span.end && end > span.start)) continue;
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour > 23) continue;
    hits.push({ hour, minute, index: m.index, length: m[0].length });
  }

  hits.sort((a, b) => a.index - b.index);
  return hits;
}

/** Vendor/store mail confirming an appointment — not a scheduling ask. */
export function looksLikeConfirmedAppointment(text: string): boolean {
  const source = String(text || '');
  if (!source.trim()) return false;
  return (
    /\b(?:your\s+)?appointment\s+(?:is\s+)?(?:scheduled|confirmed)\b/i.test(source) ||
    /\bappointment\s+has\s+been\s+scheduled\b/i.test(source) ||
    /\bcarry-in\s+appointment\b/i.test(source) ||
    /\b(?:service|store|geek\s+squad)\s+appointment\b/i.test(source) ||
    (/\bwe'?re\s+all\s+set\s+for\s+your\b/i.test(source) && /\bappointment\b/i.test(source))
  );
}

/** Sender is asking to meet — not "scheduled a launch" or "10% of calls". */
export function looksLikeMeetingIntent(text: string): boolean {
  const source = String(text || '');
  if (!source.trim()) return false;
  if (looksLikeConfirmedAppointment(source)) return true;
  return (
    /\b(meetings?\b|meet\b|appointment\b|calendly\b|facetime\b|google meet\b|zoom\b)/i.test(source) ||
    /\bget together\b/i.test(source) ||
    /\bcalendar invite\b/i.test(source) ||
    /\b(?:book(?:ing)?|schedule|set up|hop on)\s+(?:a |an |some )?(?:time|slot|call|meeting|appointment|zoom)\b/i.test(
      source,
    ) ||
    /\blet'?s (?:talk|meet|connect|schedule)\b/i.test(source) ||
    /\b(?:are you|you )(?:free|available)\b/i.test(source) ||
    /\b(?:available|free) (?:to talk|for a (?:call|meeting|chat)|on|at)\b/i.test(source) ||
    /\bdo you have (?:time|availability)\b/i.test(source) ||
    /\b(?:works|work) for you\b/i.test(source) ||
    /\b(?:pick|find) a time\b/i.test(source)
  );
}

function confirmedAppointmentSchedulingNote(evidence: string): string {
  const duration = evidence.match(/\b(\d+)[\s-]*minute\s+appointment\b/i);
  const dur = duration ? `${duration[1]}-minute ` : '';
  if (/\bbest\s*buy\b/i.test(evidence) || /\bgeek\s+squad\b/i.test(evidence)) {
    return `Best Buy ${dur}appointment — check email for date/time`;
  }
  if (/\bapple\b/i.test(evidence) && /\bcarry-in\b/i.test(evidence)) {
    return `Apple carry-in ${dur}appointment — check email for date/time`;
  }
  return `${dur}Appointment confirmed — check email for date/time`.trim();
}

export function inboundMeetingEvidence(input: {
  subject?: string | null;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
}): string {
  const htmlPlain = input.bodyHtml?.trim() ? htmlToPlainText(input.bodyHtml) : '';
  return [input.subject, input.bodyText, input.bodySnippet, htmlPlain].filter(Boolean).join('\n');
}

export function inboundHasClockTime(text: string): boolean {
  return parseAllClockTimes(text).length > 0;
}

const NAMED_MONTH_DATE_RE =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/;
const WEEKDAY_NAME_RE = new RegExp(`\\b(?:${WEEKDAYS.join('|')})\\b`, 'i');

/**
 * The sender named the day, not just a time of day. "2pm" alone lands on
 * whatever day the mail arrived, which is how promo blasts ("join our Zoom at
 * 2pm") turn into fake appointments.
 */
export function inboundStatesMeetingDate(text: string): boolean {
  const source = String(text || '');
  if (!source.trim()) return false;
  return (
    NAMED_MONTH_DATE_RE.test(source) ||
    NUMERIC_DATE_RE.test(source) ||
    WEEKDAY_NAME_RE.test(source)
  );
}

function clockPartsInTimeZone(
  iso: string,
  timeZone: string,
): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      timeZone,
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour, minute };
  } catch {
    return null;
  }
}

/** True when the ISO time-of-day appears as a real clock time in the email text. */
export function proposedMeetingTimeMatchesSource(iso: string, text: string): boolean {
  const clocks = parseAllClockTimes(text);
  if (!clocks.length) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const parts = clockPartsInTimeZone(iso, meetingDisplayTimeZone());
  if (!parts) return false;
  return clocks.some((c) => c.hour === parts.hour && c.minute === parts.minute);
}

function nearestClockToIndex(clocks: ClockHit[], index: number): ClockHit | null {
  if (!clocks.length) return null;
  let best: ClockHit | null = null;
  let bestDist = Infinity;
  for (const clock of clocks) {
    const dist = Math.abs(clock.index - index);
    if (dist < bestDist) {
      best = clock;
      bestDist = dist;
    }
  }
  if (!best || bestDist > CLOCK_NEAR_DATE_CHARS) return null;
  return best;
}

/** Vendor HTML often puts "Monday, September 7" and "2:20 p.m. ET" far apart. */
function pickClockForDateAnchor(source: string, clocks: ClockHit[], dateIndex: number): ClockHit | null {
  const near = nearestClockToIndex(clocks, dateIndex);
  if (near) return near;
  if (!looksLikeConfirmedAppointment(source)) return null;
  if (clocks.length === 1) return clocks[0]!;
  const tzClock = clocks.find((c) =>
    /\b(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT)\b/i.test(
      source.slice(c.index + c.length, c.index + c.length + 16),
    ),
  );
  if (tzClock) return tzClock;
  return clocks[0] ?? null;
}

function daysToStartOfNextCalendarWeek(refDay: number): number {
  // Calendar weeks start Monday; refDay is JS getDay() (0=Sun … 6=Sat).
  if (refDay === 0) return 1;
  return (8 - refDay) % 7 || 7;
}

function parseWeekdayFromSchedulingText(
  text: string,
): { day: number; modifier: 'next_week' | 'next' | null; index: number } | null {
  const lower = text.toLowerCase();
  const nextWeek = /\bnext\s+week\b/.test(lower);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b${WEEKDAYS[i]}\\b`, 'i');
    const m = re.exec(text);
    if (!m || m.index == null) continue;
    const nextDay = !nextWeek && new RegExp(`\\bnext\\s+${WEEKDAYS[i]}\\b`, 'i').test(lower);
    const modifier = nextWeek ? 'next_week' : nextDay ? 'next' : null;
    return { day: i, modifier, index: m.index };
  }
  return null;
}

/** Best-effort parse of phrases like "next Tuesday at 2:00 p.m." relative to receivedAt. */
export function parseRelativeMeetingTime(text: string, ref: Date): string | null {
  const source = String(text || '').trim();
  if (!source) return null;
  const clocks = parseAllClockTimes(source);
  if (!clocks.length) return null;

  const timeZone = meetingDisplayTimeZone();
  const weekday = parseWeekdayFromSchedulingText(source);
  const time = weekday ? nearestClockToIndex(clocks, weekday.index) : clocks[0];
  if (!time) return null;
  if (weekday && Math.abs(time.index - weekday.index) > CLOCK_NEAR_DATE_CHARS) return null;

  const refParts = datePartsInTimeZone(ref, timeZone);
  let { year, monthIndex, day } = refParts;

  if (weekday) {
    const refDay = refParts.weekday;
    let daysAhead: number;

    if (weekday.modifier === 'next_week') {
      const daysFromMonday = (weekday.day - 1 + 7) % 7;
      daysAhead = daysToStartOfNextCalendarWeek(refDay) + daysFromMonday;
    } else {
      daysAhead = (weekday.day - refDay + 7) % 7;
      if (weekday.modifier === 'next') {
        daysAhead = daysAhead === 0 ? 7 : daysAhead + 7;
      } else if (daysAhead === 0) {
        const sameDay = wallClockInTimeZoneToIso(year, monthIndex, day, time.hour, time.minute, timeZone);
        if (new Date(sameDay).getTime() <= ref.getTime()) daysAhead = 7;
      }
    }
    if (daysAhead) {
      ({ year, monthIndex, day } = addCalendarDaysInTimeZone(year, monthIndex, day, daysAhead, timeZone));
    }
  }

  const iso = wallClockInTimeZoneToIso(year, monthIndex, day, time.hour, time.minute, timeZone);
  if (new Date(iso).getTime() <= ref.getTime()) return null;
  return iso;
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
  const clocks = parseAllClockTimes(source);
  if (!clocks.length) return null;

  const namedMonth = source.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
  );
  if (namedMonth && namedMonth.index != null) {
    const time = pickClockForDateAnchor(source, clocks, namedMonth.index);
    if (!time) return null;
    const month = MONTH_INDEX[namedMonth[1].toLowerCase().replace(/\.$/, '')];
    if (month === undefined) return null;
    const day = parseInt(namedMonth[2], 10);
    const timeZone = meetingDisplayTimeZone();
    let year = namedMonth[3]
      ? parseInt(namedMonth[3], 10)
      : datePartsInTimeZone(ref, timeZone).year;
    let iso = wallClockInTimeZoneToIso(year, month, day, time.hour, time.minute, timeZone);
    if (!namedMonth[3] && new Date(iso).getTime() <= ref.getTime()) {
      iso = wallClockInTimeZoneToIso(year + 1, month, day, time.hour, time.minute, timeZone);
    }
    if (new Date(iso).getTime() <= ref.getTime()) return null;
    return iso;
  }

  const numeric = source.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numeric && numeric.index != null) {
    const time = nearestClockToIndex(clocks, numeric.index);
    if (!time) return null;
    let year = parseInt(numeric[3], 10);
    if (year < 100) year += 2000;
    const month = parseInt(numeric[1], 10) - 1;
    const day = parseInt(numeric[2], 10);
    const iso = wallClockInTimeZoneToIso(year, month, day, time.hour, time.minute, meetingDisplayTimeZone());
    if (new Date(iso).getTime() <= ref.getTime()) return null;
    return iso;
  }

  return null;
}

export function resolveMeetingStartFromInbox(input: {
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  summary?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  receivedAt?: string | null;
}): string | null {
  const evidence = inboundMeetingEvidence({
    subject: input.subject,
    bodyText: input.bodyText,
    bodySnippet: input.bodySnippet,
    bodyHtml: input.bodyHtml,
  });
  const direct = parseProposedMeetingStart(input.proposedMeetingStart);
  if (direct && evidence && proposedMeetingTimeMatchesSource(direct, evidence)) {
    return direct;
  }
  return resolveProposedMeetingStart({
    proposedMeetingStart: null,
    schedulingNote: input.schedulingNote,
    summary: input.summary,
    bodyText: evidence || input.bodyText,
    receivedAt: input.receivedAt,
  });
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

export function sanitizeInboundMeetingProposal(input: {
  category?: string | null;
  proposedMeetingStart?: string | null;
  schedulingNote?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodySnippet?: string | null;
  bodyHtml?: string | null;
  receivedAt?: string | null;
}): {
  proposedMeetingStart: string | null;
  schedulingNote: string;
  discardedReason: string | null;
} {
  const empty = {
    proposedMeetingStart: null as string | null,
    schedulingNote: '',
    discardedReason: null as string | null,
  };
  const category = String(input.category || '').toLowerCase();
  const hadProposal = Boolean(
    parseProposedMeetingStart(input.proposedMeetingStart) ||
      String(input.schedulingNote || '').trim(),
  );

  if (MEETING_SKIP_CATEGORIES.has(category)) {
    return {
      ...empty,
      discardedReason: hadProposal ? `${category} mail is not a meeting request` : null,
    };
  }

  const evidence = inboundMeetingEvidence({
    subject: input.subject,
    bodyText: input.bodyText,
    bodySnippet: input.bodySnippet,
    bodyHtml: input.bodyHtml,
  });
  const confirmed = looksLikeConfirmedAppointment(evidence);
  if (!looksLikeMeetingIntent(evidence)) {
    return {
      ...empty,
      discardedReason: hadProposal ? 'no meeting language in the email' : null,
    };
  }
  if (!confirmed && !inboundHasClockTime(evidence)) {
    return {
      ...empty,
      discardedReason: hadProposal ? 'no clock time in the email — deadlines are not meetings' : null,
    };
  }

  let start = parseProposedMeetingStart(input.proposedMeetingStart);
  if (start && !proposedMeetingTimeMatchesSource(start, evidence)) {
    start = null;
  }
  if (!start && inboundHasClockTime(evidence)) {
    start = resolveProposedMeetingStart({
      proposedMeetingStart: null,
      bodyText: evidence,
      receivedAt: input.receivedAt,
    });
  }
  if (start && !proposedMeetingTimeMatchesSource(start, evidence)) {
    start = null;
  }
  if (start) {
    return {
      proposedMeetingStart: start,
      schedulingNote: String(input.schedulingNote || '').trim(),
      discardedReason: null,
    };
  }

  if (confirmed) {
    return {
      proposedMeetingStart: null,
      schedulingNote:
        String(input.schedulingNote || '').trim() || confirmedAppointmentSchedulingNote(evidence),
      discardedReason: null,
    };
  }

  return {
    ...empty,
    discardedReason: hadProposal ? 'proposed time was not stated in the email' : null,
  };
}
