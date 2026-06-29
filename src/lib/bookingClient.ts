/**
 * calcom-booking-api client (eliteweblabs/calcom-booking-api on Railway).
 *
 * Reads/writes Cal.com bookings via the standalone microservice. Prefer
 * BOOKING_API_URL (private Railway network) server-side; falls back to
 * PUBLIC_BOOKING_API_URL for local dev.
 */
import { serverEnv } from './serverEnv';

export type BookingSummary = {
  uid: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  attendee: string;
  email: string;
  location?: string;
  description?: string;
  attendeeTimezone?: string;
};

export type BookingEventType = {
  id: number;
  title: string;
  slug: string;
  length: number;
  description?: string | null;
};

export type DashboardEvent = {
  id: string;
  time: string;
  title: string;
  type: string;
  attendee?: string;
  status?: string;
  uid?: string;
};

type BookingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function bookingBaseUrl(): string | null {
  const raw =
    serverEnv('BOOKING_API_URL')?.trim() ||
    serverEnv('PUBLIC_BOOKING_API_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function bookingApiKey(): string | null {
  return serverEnv('BOOKING_API_KEY')?.trim() || null;
}

export function isBookingConfigured(): boolean {
  return Boolean(bookingBaseUrl());
}

export function calcomWebappUrl(): string | null {
  const raw =
    serverEnv('CALCOM_WEBAPP_URL')?.trim() ||
    serverEnv('CALCOM_API_URL')?.trim();
  if (!raw || raw === 'https://') return null;
  return raw.replace(/\/+$/, '');
}

export function calcomUsername(): string {
  return serverEnv('CALCOM_USERNAME')?.trim() || 'reave';
}

/** Public Cal.com booking page for the default event type slug. */
export function publicBookingPageUrl(eventSlug = '30min'): string | null {
  const web = calcomWebappUrl();
  if (web) return `${web}/${calcomUsername()}/${eventSlug}`;
  return null;
}

async function bookingFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<BookingResult<T>> {
  const base = bookingBaseUrl();
  if (!base) return { ok: false, error: 'BOOKING_API_URL is not set' };

  let url = `${base}${path}`;
  if (init.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (path.includes('?') ? '&' : '?') + qs;
  }

  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const key = bookingApiKey();
  if (key) headers.set('X-API-Key', key);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON
    }
  }

  if (!res.ok) {
    const msg =
      (parsed as { error?: string })?.error ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: parsed as T };
}

export async function bookingList(input?: {
  upcoming?: boolean;
  status?: string;
  limit?: number;
  username?: string;
}): Promise<BookingResult<{ bookings: BookingSummary[] }>> {
  const out = await bookingFetch<{ success?: boolean; bookings?: BookingSummary[] }>(
    '/api/booking/list',
    {
      method: 'GET',
      query: {
        upcoming: input?.upcoming ? 'true' : undefined,
        status: input?.status,
        limit: input?.limit,
        username: input?.username,
      },
    },
  );
  if (!out.ok) return out;
  return { ok: true, data: { bookings: out.data.bookings ?? [] } };
}

export async function bookingGet(
  uid: string,
): Promise<BookingResult<{ booking: BookingSummary & { eventSlug?: string; slotLength?: number } }>> {
  const out = await bookingFetch<{ success?: boolean; booking?: BookingSummary }>(
    `/api/booking/${encodeURIComponent(uid)}`,
    { method: 'GET' },
  );
  if (!out.ok) return out;
  if (!out.data.booking) return { ok: false, error: 'Booking not found', status: 404 };
  return { ok: true, data: { booking: out.data.booking } };
}

export async function bookingEventTypes(): Promise<
  BookingResult<{ eventTypes: BookingEventType[] }>
> {
  const out = await bookingFetch<{ success?: boolean; eventTypes?: BookingEventType[] }>(
    '/api/booking/event-types',
    { method: 'GET' },
  );
  if (!out.ok) return out;
  return { ok: true, data: { eventTypes: out.data.eventTypes ?? [] } };
}

export async function bookingCreate(input: {
  name: string;
  email: string;
  start: string;
  phone?: string;
  notes?: string;
  address?: string;
}): Promise<BookingResult<{ booking?: { uid?: string; startTime?: string } }>> {
  return bookingFetch('/api/booking/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function bookingCancel(uid: string): Promise<BookingResult<{ success?: boolean }>> {
  return bookingFetch(`/api/booking/${encodeURIComponent(uid)}`, { method: 'DELETE' });
}

export async function bookingReschedule(
  uid: string,
  input: { start: string; address?: string; notes?: string; phone?: string },
): Promise<BookingResult<{ success?: boolean }>> {
  return bookingFetch(`/api/booking/${encodeURIComponent(uid)}/reschedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

const DEFAULT_TZ = 'America/New_York';

function bookingTimezone(): string {
  return serverEnv('BOOKING_TIMEZONE')?.trim() || DEFAULT_TZ;
}

/** YYYY-MM-DD in the configured timezone. */
export function dateKeyInTimezone(iso: string, tz = bookingTimezone()): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

export function todayKeyInTimezone(tz = bookingTimezone()): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

export function bookingToDashboardEvent(b: BookingSummary): DashboardEvent {
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

/** Bookings whose start falls on today in BOOKING_TIMEZONE. */
export async function bookingsToday(): Promise<
  BookingResult<{ events: DashboardEvent[]; configured: boolean }>
> {
  if (!isBookingConfigured()) {
    return { ok: true, data: { events: [], configured: false } };
  }

  const listed = await bookingList({ upcoming: true, status: 'ACCEPTED', limit: 50 });
  if (!listed.ok) return listed;

  const today = todayKeyInTimezone();
  const events = listed.data.bookings
    .filter((b) => dateKeyInTimezone(b.startTime) === today)
    .map(bookingToDashboardEvent)
    .sort((a, b) => a.time.localeCompare(b.time));

  return { ok: true, data: { events, configured: true } };
}

export async function bookingPing(): Promise<
  BookingResult<{ reachable: boolean; db?: string }>
> {
  const out = await bookingFetch<{ status?: string; db?: string }>('/health', { method: 'GET' });
  if (!out.ok) return out;
  return {
    ok: true,
    data: { reachable: out.data.status === 'ok', db: out.data.db },
  };
}

/** One-line summary for Telegram. */
export function formatBookingLine(b: BookingSummary, tz = bookingTimezone()): string {
  const when = new Date(b.startTime).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const who = b.attendee && b.attendee !== 'Unknown' ? b.attendee : b.email || 'Unknown';
  const loc = b.location?.trim() ? ` · ${b.location.trim()}` : '';
  return `${when} — ${who}${loc} (${b.status}) · ${b.uid.slice(0, 8)}`;
}
