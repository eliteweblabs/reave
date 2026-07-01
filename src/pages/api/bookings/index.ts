/**
 * GET /api/bookings — upcoming/recent Cal.com bookings (admin).
 * Query: ?upcoming=true|false (default true), ?status=ACCEPTED, ?limit=50
 */

import type { APIContext } from 'astro';
import {
  bookingList,
  calcomWebappUrl,
  dateKeyInTimezone,
  isBookingConfigured,
  publicBookingPageUrl,
  type BookingSummary,
} from '../../../lib/bookingClient';
import { hasFeature } from '../../../lib/features';

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
    },
  });
}
