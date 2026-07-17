/**
 * GET  /api/bookings — upcoming/recent Cal.com bookings (admin).
 * POST /api/bookings — create a Cal.com booking (admin).
 * Query: ?upcoming=true|false (default true), ?status=accepted, ?limit=50
 *        ?from=YYYY-MM-DD&to=YYYY-MM-DD for calendar range
 */

import type { APIContext } from 'astro';
import {
  bookingCreate,
  bookingList,
  calcomWebappUrl,
  dateKeyInTimezone,
  isBookingConfigured,
  publicBookingPageUrl,
  resolveBookingAddress,
  type BookingSummary,
} from '../../../lib/bookingClient';
import { checkEmailMeetingSlot } from '../../../lib/emailScheduling';
import { hasFeature } from '../../../lib/features';
import { mapboxPublicToken } from '../../../lib/mapboxClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('scheduling')) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  if (!isBookingConfigured()) {
    return json({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const url = new URL(context.request.url);
  const from = url.searchParams.get('from')?.trim() || undefined;
  const to = url.searchParams.get('to')?.trim() || undefined;
  const rangeQuery = Boolean(from || to);
  const upcoming = rangeQuery ? undefined : url.searchParams.get('upcoming') !== 'false';
  const status = url.searchParams.get('status') || undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 50, 200) : rangeQuery ? 200 : 50;

  function inRange(b: BookingSummary): boolean {
    const key = dateKeyInTimezone(b.startTime);
    if (from && key < from) return false;
    if (to && key > to) return false;
    return true;
  }

  let bookings: BookingSummary[] = [];
  if (rangeQuery) {
    const [upRes, pastRes] = await Promise.all([
      bookingList({ upcoming: true, status, limit }),
      bookingList({ upcoming: false, status, limit }),
    ]);
    if (!upRes.ok) return json({ ok: false, error: upRes.error }, upRes.status ?? 502);
    if (!pastRes.ok) return json({ ok: false, error: pastRes.error }, pastRes.status ?? 502);
    const seen = new Set<string>();
    for (const b of [...upRes.data.bookings, ...pastRes.data.bookings]) {
      if (seen.has(b.uid)) continue;
      seen.add(b.uid);
      if (inRange(b)) bookings.push(b);
    }
    bookings.sort((a, b) => a.startTime.localeCompare(b.startTime));
  } else {
    const result = await bookingList({ upcoming, status, limit });
    if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
    bookings = result.data.bookings;
  }

  const calcomAdmin = calcomWebappUrl();
  return json({
    ok: true,
    upcoming: rangeQuery ? null : upcoming,
    from: from ?? null,
    to: to ?? null,
    count: bookings.length,
    bookings,
    meta: {
      bookingFormUrl: '/form/schedule',
      publicBookingUrl: publicBookingPageUrl() ?? null,
      calcomAdminUrl: calcomAdmin ?? null,
      mapboxToken: mapboxPublicToken(),
    },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('scheduling')) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }

  if (!isBookingConfigured()) {
    return json({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const name = String(rec.name ?? '').trim();
  const email = String(rec.email ?? '').trim();
  const startRaw = String(rec.start ?? '').trim();
  const notes = rec.notes != null ? String(rec.notes).trim().slice(0, 500) : '';
  const phone = rec.phone != null ? String(rec.phone).trim() : undefined;
  const address = resolveBookingAddress(rec.address);

  if (!name) return json({ ok: false, error: 'Guest name is required' }, 400);
  if (!email.includes('@')) return json({ ok: false, error: 'Valid guest email is required' }, 400);

  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) {
    return json({ ok: false, error: 'Invalid start time' }, 400);
  }

  const checkRes = await checkEmailMeetingSlot({
    proposedStart: start.toISOString(),
    from: `${name} <${email}>`,
    contactName: name,
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

  const created = await bookingCreate({
    name,
    email,
    start: start.toISOString(),
    notes: notes || undefined,
    phone,
    ...(address ? { address } : {}),
  });
  if (!created.ok) {
    return json({ ok: false, error: created.error }, created.status ?? 502);
  }

  const booking = created.data.booking;
  if (!booking?.uid) {
    return json({ ok: false, error: 'Booking API did not return a booking id' }, 502);
  }

  return json({
    ok: true,
    booking: {
      uid: booking.uid,
      startTime: booking.startTime ?? start.toISOString(),
    },
  });
}
