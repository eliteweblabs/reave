/**
 * Pure booking → dashboard stats. Keep this file free of Astro/env imports
 * so verify scripts can load it without the rest of the booking client.
 */

export type BookingSliceRow = {
  uid: string;
  startTime: string;
  title?: string;
  attendee?: string;
  location?: string;
  status?: string;
};

export type BookingDashboardEvent = {
  id: string;
  uid: string;
  time: string;
  title: string;
  type: string;
  attendee?: string;
  status?: string;
};

export type DerivedBookingDashboardSlice = {
  eventsToday: BookingDashboardEvent[];
  eventsNext24h: BookingDashboardEvent[];
  meetingsTotal: number;
};

function dateKeyInTimezone(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

function toDashboardEvent(b: BookingSliceRow): BookingDashboardEvent {
  const attendee = b.attendee?.trim();
  const title =
    b.title?.trim() ||
    (attendee && attendee !== 'Unknown' ? `Meeting with ${attendee}` : 'Meeting');
  return {
    id: b.uid,
    uid: b.uid,
    time: b.startTime,
    title,
    type: b.location?.trim() || 'meeting',
    attendee: attendee && attendee !== 'Unknown' ? attendee : undefined,
    status: b.status,
  };
}

/** Derive today / next-24h / unique total from one upcoming + one past list. */
export function deriveBookingDashboardSlice(
  upcoming: BookingSliceRow[],
  past: BookingSliceRow[],
  now: number,
  today: string,
  tz = 'America/New_York',
): DerivedBookingDashboardSlice {
  const cutoff = now + 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const eventsToday: BookingDashboardEvent[] = [];
  const eventsNext24h: BookingDashboardEvent[] = [];

  for (const b of [...upcoming, ...past]) {
    if (seen.has(b.uid)) continue;
    seen.add(b.uid);
    if (dateKeyInTimezone(b.startTime, tz) === today) {
      eventsToday.push(toDashboardEvent(b));
    }
    const startMs = new Date(b.startTime).getTime();
    if (!Number.isNaN(startMs) && startMs >= now && startMs <= cutoff) {
      eventsNext24h.push(toDashboardEvent(b));
    }
  }

  eventsToday.sort((a, b) => a.time.localeCompare(b.time));
  eventsNext24h.sort((a, b) => a.time.localeCompare(b.time));
  return { eventsToday, eventsNext24h, meetingsTotal: seen.size };
}
