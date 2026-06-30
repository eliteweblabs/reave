/**
 * Check proposed meeting times from inbox email against Cal.com availability.
 */

import { parseSenderEmail, parseSenderName } from './emailAddress';
import {
  bookingAvailability,
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

function slotMatches(proposed: Date, slotIso: string): boolean {
  const slot = new Date(slotIso);
  if (Number.isNaN(slot.getTime())) return false;
  return Math.abs(slot.getTime() - proposed.getTime()) <= SLOT_MATCH_MS;
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
  const inAvailability =
    openSlots.length === 0 ? null : openSlots.some((slot) => slotMatches(proposed, slot.iso));

  let available = false;
  let conflictReason: string | null = null;

  if (onCalendar) {
    conflictReason = `Conflicts with ${onCalendar.attendee || 'another booking'} at ${formatWhen(onCalendar.startTime)}`;
  } else if (inAvailability === false) {
    conflictReason = 'That time is not an open slot on your Cal.com calendar';
  } else if (inAvailability === true) {
    available = true;
  } else if (!availRes.ok && !onCalendar) {
    // Availability API unavailable — allow booking attempt if no direct overlap.
    available = true;
  }

  const alternatives =
    available ? [] : pickAlternatives(proposed, openSlots, bookings, durationMinutes);

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
