/**
 * calcom-booking-api client (eliteweblabs/calcom-booking-api on Railway).
 *
 * Reads/writes Cal.com bookings via the standalone microservice. Prefer
 * BOOKING_API_URL (private Railway network) server-side; falls back to
 * PUBLIC_BOOKING_API_URL for local dev.
 */
import { cachedCompanyBrandName, cachedCompanyDomain } from './companyConfig';
import { getStoredCompanyConfig } from './companyConfigStore';
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

export type AvailabilitySlot = {
  iso: string;
  label: string;
};

export type AvailabilityDay = {
  date: string;
  label: string;
  slots: AvailabilitySlot[];
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
  const privateUrl = serverEnv('BOOKING_API_URL')?.trim();
  const publicUrl = serverEnv('PUBLIC_BOOKING_API_URL')?.trim();
  // Railway private network URLs are unreachable from localhost — prefer public in dev.
  const raw =
    import.meta.env.DEV && publicUrl
      ? publicUrl
      : privateUrl || publicUrl;
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function bookingApiKey(): string | null {
  return serverEnv('BOOKING_API_KEY')?.trim() || null;
}

export function isBookingConfigured(): boolean {
  return Boolean(bookingBaseUrl());
}

/** Hostnames that are not reachable from email/SMS recipients or admin browsers. */
function isPrivateCalcomHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.startsWith('127.') || h.endsWith('.internal');
}

function normalizePublicCalcomBase(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === 'https://') return null;
  const base = trimmed.replace(/\/+$/, '');
  try {
    const host = new URL(base.startsWith('http') ? base : `https://${base}`).hostname;
    if (isPrivateCalcomHost(host)) return null;
  } catch {
    return null;
  }
  return base;
}

/** Public Cal.com web app base URL (custom domain or Railway public domain). */
export function calcomWebappUrl(): string | null {
  const candidates = [
    serverEnv('PUBLIC_CALCOM_WEBAPP_URL'),
    serverEnv('CALCOM_WEBAPP_URL'),
    serverEnv('CALCOM_API_URL'),
  ];
  for (const raw of candidates) {
    const url = normalizePublicCalcomBase(raw);
    if (url) return url;
  }
  return null;
}

export function calcomUsername(): string {
  const configured = serverEnv('CALCOM_USERNAME')?.trim();
  if (configured) return configured;
  const domain = serverEnv('COMPANY_DOMAIN')?.trim() || cachedCompanyDomain();
  if (domain) return domain.split('.')[0]?.toLowerCase() || 'bookings';
  return cachedCompanyBrandName().toLowerCase().replace(/\s+/g, '') || 'bookings';
}

/** Optional job-site address when the caller has one (omit to skip geocoding). */
export function bookingDefaultAddress(): string | undefined {
  return serverEnv('BOOKING_DEFAULT_ADDRESS')?.trim() || undefined;
}

export function resolveBookingAddress(raw: unknown): string | undefined {
  const fromBody = raw != null ? String(raw).trim() : '';
  return fromBody || undefined;
}

/** Address for calcom-booking-api create/reschedule — must geocode. */
export async function bookingAddressForCreate(raw?: unknown): Promise<string | undefined> {
  const fromBody = resolveBookingAddress(raw);
  if (fromBody) return fromBody;

  const stored = await getStoredCompanyConfig();
  const companyAddress = stored?.address?.trim();
  if (companyAddress) return companyAddress;

  return bookingDefaultAddress();
}

/** Public Cal.com booking page for the default event type slug. */
export function publicBookingPageUrl(eventSlug = '30min'): string | null {
  const web = calcomWebappUrl();
  if (web) return `${web}/${calcomUsername()}/${eventSlug}`;
  return null;
}

/**
 * Attendee-facing Cal.com page for an existing booking. Shows the booking
 * details and offers Reschedule / Cancel (Cal.com's `{bookerUrl}/booking/{uid}`
 * page; reschedule → `/reschedule/{uid}`, cancel → `?cancel=true`). Cal.com may
 * ask the attendee to confirm their email before making changes.
 */
export function bookingManageUrl(uid: string | null | undefined): string | null {
  const web = calcomWebappUrl();
  if (!web || !uid) return null;
  return `${web}/booking/${encodeURIComponent(uid)}`;
}

/** Gateway statuses that usually mean the service is restarting/cold-starting. */
const TRANSIENT_BOOKING_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_BOOKING_MESSAGE =
  'The booking service is temporarily unavailable (it may be restarting). Please try again in a moment.';

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

  // Only retry safe/idempotent reads — retrying a create/reschedule/cancel on a
  // 502 risks duplicating a request the service may have already processed.
  const method = (init.method ?? 'GET').toUpperCase();
  const retryable = method === 'GET' || method === 'HEAD';
  const maxAttempts = retryable ? 3 : 1;

  let lastError: { ok: false; error: string; status?: number } = {
    ok: false,
    error: 'Booking service request failed',
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch (e) {
      lastError = { ok: false, error: e instanceof Error ? e.message : String(e) };
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      return lastError;
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
      const upstreamMsg = (parsed as { error?: string })?.error || text.slice(0, 200);
      const isTransient = TRANSIENT_BOOKING_STATUSES.has(res.status);
      const msg = upstreamMsg || (isTransient ? TRANSIENT_BOOKING_MESSAGE : `HTTP ${res.status}`);
      lastError = { ok: false, error: msg, status: res.status };
      if (isTransient && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      return lastError;
    }

    return { ok: true, data: parsed as T };
  }

  return lastError;
}

/** Cal.com Postgres enum values are lowercase (accepted, cancelled, …). */
export function normalizeBookingStatus(status?: string): string | undefined {
  const s = status?.trim().toLowerCase();
  return s || undefined;
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
        status: normalizeBookingStatus(input?.status),
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

export async function bookingAvailability(): Promise<
  BookingResult<{ days: AvailabilityDay[] }>
> {
  const out = await bookingFetch<{ success?: boolean; days?: AvailabilityDay[] }>(
    '/api/booking/availability',
    { method: 'GET' },
  );
  if (!out.ok) return out;
  return { ok: true, data: { days: out.data.days ?? [] } };
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

/** True when the calcom-booking-api rejected the request at its Mapbox geocode step. */
function isBookingGeocodeError(error: string | undefined): boolean {
  return Boolean(error) && /could not be geocoded/i.test(error!);
}

/**
 * The calcom-booking-api microservice geocodes every booking address through
 * Mapbox before creating the Cal.com event. When its MAPBOX_ACCESS_TOKEN is
 * missing/invalid it rejects EVERY address — even "New York" — with
 * "Address could not be geocoded", which misleadingly looks like a bad address.
 *
 * Re-check the address with our own (independently configured) geocoder so the
 * operator gets an accurate message: a genuinely bad address vs. a booking
 * service whose Mapbox token needs fixing.
 */
async function explainBookingGeocodeError(
  address: string,
  status?: number,
): Promise<{ ok: false; error: string; status?: number }> {
  let resolvesHere = false;
  try {
    const { resolveAddressCoordinates } = await import('./mapbox');
    resolvesHere = Boolean(await resolveAddressCoordinates(address));
  } catch {
    resolvesHere = false;
  }

  if (resolvesHere) {
    return {
      ok: false,
      status,
      error:
        `Scheduling is temporarily unavailable. The booking service could not geocode ` +
        `“${address}”, even though it resolves here — the calcom-booking-api MAPBOX_ACCESS_TOKEN ` +
        `is likely missing or invalid. Set a valid Mapbox token on that Railway service to restore bookings.`,
    };
  }

  return {
    ok: false,
    status,
    error: `Could not locate “${address}” on the map. Double-check the street address, city, state, and ZIP, then try again.`,
  };
}

type BookingApiResponse = {
  success?: boolean;
  needsConfirmation?: boolean;
  message?: string;
  candidates?: Array<{ uid?: string; name?: string; email?: string }>;
  booking?: { uid?: string; startTime?: string };
};

/**
 * The calcom-booking-api can reply HTTP 200 with `success:false` +
 * `needsConfirmation` when the attendee ambiguously matches existing contacts
 * (a "possible" fuzzy match). Because it's a 200, bookingFetch treats it as ok;
 * surface it as a clear 409 instead of the misleading "did not return a booking
 * id" 502 the caller would otherwise emit.
 */
function bookingConfirmationError(
  data: BookingApiResponse,
): { ok: false; error: string; status?: number } | null {
  if (data.success !== false && !data.needsConfirmation) return null;
  const names = (data.candidates ?? [])
    .map((c) => (c.name || c.email || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  const base =
    data.message?.trim() || 'The booking service could not complete this booking.';
  return {
    ok: false,
    status: 409,
    error: names ? `${base} (possible existing contacts: ${names})` : base,
  };
}

export async function bookingCreate(input: {
  name: string;
  email: string;
  start: string;
  phone?: string;
  notes?: string;
  address?: string;
  /**
   * When set, the booking service uses this contact directly and SKIPS its
   * fuzzy name/email resolution — so a known meeting attendee never gets
   * blocked by a "possible matching contacts" prompt. Resolve/ensure the
   * contact on our side (by exact email), then pass the uid here.
   */
  confirmContactUid?: string;
}): Promise<BookingResult<{ booking?: { uid?: string; startTime?: string } }>> {
  const { address: _address, confirmContactUid, ...rest } = input;
  const address = await bookingAddressForCreate(_address);
  if (!address) {
    return {
      ok: false,
      error:
        'Meeting address is required. Enter a street address or set your business address in Admin → Company.',
      status: 400,
    };
  }
  const result = await bookingFetch<BookingApiResponse>('/api/booking/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...rest,
      address,
      ...(confirmContactUid ? { confirmContactUid } : {}),
    }),
  });
  if (!result.ok && isBookingGeocodeError(result.error)) {
    return explainBookingGeocodeError(address, result.status);
  }
  if (result.ok) {
    const confirmErr = bookingConfirmationError(result.data);
    if (confirmErr) return confirmErr;
  }
  return result;
}

export async function bookingCancel(
  uid: string,
  reason?: string,
): Promise<BookingResult<{ success?: boolean }>> {
  return bookingFetch(`/api/booking/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: reason ? JSON.stringify({ cancellationReason: reason }) : undefined,
  });
}

export async function bookingReschedule(
  uid: string,
  input: { start: string; address?: string; notes?: string; phone?: string },
): Promise<BookingResult<{ success?: boolean }>> {
  const { address: _address, ...rest } = input;
  const address = await bookingAddressForCreate(_address);
  if (!address) {
    return {
      ok: false,
      error:
        'Meeting address is required. Enter a street address or set your business address in Admin → Company.',
      status: 400,
    };
  }
  const result = await bookingFetch<BookingApiResponse>(
    `/api/booking/${encodeURIComponent(uid)}/reschedule`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        address,
      }),
    },
  );
  if (!result.ok && isBookingGeocodeError(result.error)) {
    return explainBookingGeocodeError(address, result.status);
  }
  if (result.ok) {
    const confirmErr = bookingConfirmationError(result.data);
    if (confirmErr) return confirmErr;
  }
  return result;
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

/** Bookings whose start falls on today in BOOKING_TIMEZONE (includes past events today). */
export async function bookingsToday(): Promise<
  BookingResult<{ events: DashboardEvent[]; configured: boolean }>
> {
  if (!isBookingConfigured()) {
    return { ok: true, data: { events: [], configured: false } };
  }

  const limit = 50;
  const [upcomingRes, pastRes] = await Promise.all([
    bookingList({ upcoming: true, status: 'accepted', limit }),
    bookingList({ upcoming: false, status: 'accepted', limit }),
  ]);
  if (!upcomingRes.ok) return upcomingRes;
  if (!pastRes.ok) return pastRes;

  const today = todayKeyInTimezone();
  const seen = new Set<string>();
  const events: DashboardEvent[] = [];
  for (const b of [...upcomingRes.data.bookings, ...pastRes.data.bookings]) {
    if (seen.has(b.uid)) continue;
    seen.add(b.uid);
    if (dateKeyInTimezone(b.startTime) !== today) continue;
    events.push(bookingToDashboardEvent(b));
  }
  events.sort((a, b) => a.time.localeCompare(b.time));

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

/** One-line summary for display. */
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
