/**
 * GET /api/bookings — upcoming/recent Cal.com bookings (admin).
 * Query: ?upcoming=true|false (default true), ?status=ACCEPTED, ?limit=50
 */

import type { APIContext } from 'astro';
import { bookingList, isBookingConfigured } from '../../../lib/bookingClient';
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
  const upcoming = url.searchParams.get('upcoming') !== 'false';
  const status = url.searchParams.get('status') || undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 50, 200) : 50;

  const result = await bookingList({ upcoming, status, limit });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  return json({
    ok: true,
    upcoming,
    count: result.data.bookings.length,
    bookings: result.data.bookings,
  });
}
