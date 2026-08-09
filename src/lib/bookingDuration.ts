/**
 * Meeting length helpers for Cal.com bookings.
 *
 * Cal.com event types have fixed lengths — there is no true "open-ended"
 * meeting. Callers pass durationMinutes and/or eventSlug; we map that onto
 * the closest configured event type (e.g. 60 → 60min).
 */

/** Default Cal.com meeting length when none is requested. */
export const DEFAULT_MEETING_MINUTES = 30;

export type ResolvedBookingLength = {
  durationMinutes: number;
  eventSlug?: string;
  eventTypeId?: number;
  title?: string;
};

type BookingEventType = {
  id: number;
  title: string;
  slug: string;
  length: number;
};

const WORD_HOURS: Record<string, number> = {
  an: 1,
  one: 1,
  a: 1,
  two: 2,
  three: 3,
  half: 0.5,
};

/** Parse requested length from free text ("for an hour", "90 min", "1.5 hours"). */
export function parseMeetingDurationMinutes(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const t = text.toLowerCase().replace(/\s+/g, ' ');

  // "90 minutes" / "90-minute" / "90 min"
  const minMatch = t.match(/\b(\d{1,3})\s*-?\s*(?:minutes?|mins?)\b/);
  if (minMatch) {
    const n = Number(minMatch[1]);
    if (Number.isFinite(n) && n >= 5 && n <= 480) return Math.round(n);
  }

  // "1.5 hours" / "2 hr"
  const decimalHours = t.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  if (decimalHours) {
    const hours = Number(decimalHours[1]);
    if (Number.isFinite(hours) && hours > 0 && hours <= 8) {
      return Math.round(hours * 60);
    }
  }

  // "an hour" / "one hour" / "half an hour" / "half hour"
  if (/\bhalf(?:\s+an?)?\s*(?:hour|hr)\b/.test(t)) return 30;
  const wordHour = t.match(/\b(an|a|one|two|three)\s*(?:hour|hr)s?\b/);
  if (wordHour) {
    const hours = WORD_HOURS[wordHour[1]!];
    if (hours) return Math.round(hours * 60);
  }

  // Slug-style "60min" / "15min"
  const slug = t.match(/\b(\d{1,3})\s*min\b/);
  if (slug) {
    const n = Number(slug[1]);
    if (Number.isFinite(n) && n >= 5 && n <= 480) return Math.round(n);
  }

  return null;
}

function pickClosestEventType(
  types: BookingEventType[],
  minutes: number,
): BookingEventType | null {
  if (!types.length) return null;
  const exact = types.find((t) => t.length === minutes);
  if (exact) return exact;

  const bySlug = types.find((t) => t.slug === `${minutes}min`);
  if (bySlug) return bySlug;

  // Prefer the shortest event type that can cover the request; else closest.
  const covering = types
    .filter((t) => t.length >= minutes)
    .sort((a, b) => a.length - b.length);
  if (covering[0]) return covering[0];

  return [...types].sort(
    (a, b) => Math.abs(a.length - minutes) - Math.abs(b.length - minutes),
  )[0] ?? null;
}

/**
 * Resolve duration + Cal.com event type for a booking create.
 * Falls back to DEFAULT_MEETING_MINUTES (30) when nothing is specified.
 */
export async function resolveBookingLength(input?: {
  durationMinutes?: number | null;
  eventSlug?: string | null;
}): Promise<ResolvedBookingLength> {
  const slug = input?.eventSlug?.trim() || undefined;
  const requested =
    typeof input?.durationMinutes === 'number' &&
    Number.isFinite(input.durationMinutes) &&
    input.durationMinutes >= 5 &&
    input.durationMinutes <= 480
      ? Math.round(input.durationMinutes)
      : undefined;

  // Dynamic import keeps parse helpers usable outside the Astro runtime.
  const { bookingEventTypes } = await import('./bookingClient');
  const typesRes = await bookingEventTypes();
  const types = typesRes.ok ? typesRes.data.eventTypes : [];

  if (slug) {
    const match = types.find((t) => t.slug === slug);
    if (match) {
      return {
        durationMinutes: match.length,
        eventSlug: match.slug,
        eventTypeId: match.id,
        title: match.title,
      };
    }
    return {
      durationMinutes: requested ?? DEFAULT_MEETING_MINUTES,
      eventSlug: slug,
    };
  }

  const minutes = requested ?? DEFAULT_MEETING_MINUTES;
  const match = pickClosestEventType(types, minutes);
  if (match) {
    return {
      durationMinutes: match.length,
      eventSlug: match.slug,
      eventTypeId: match.id,
      title: match.title,
    };
  }

  return {
    durationMinutes: minutes,
    eventSlug: `${minutes}min`,
  };
}

/** Best-effort duration from scheduling note / subject / body (first hit wins). */
export function inferMeetingDurationMinutes(...texts: Array<string | null | undefined>): number | null {
  for (const text of texts) {
    const parsed = parseMeetingDurationMinutes(text);
    if (parsed != null) return parsed;
  }
  return null;
}
