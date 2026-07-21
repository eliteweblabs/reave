/**
 * GET /api/admin/bookings-debug — diagnostic endpoint for debugging today's bookings
 */

import type { APIContext } from 'astro';
import {
  bookingList,
  bookingsToday,
  dateKeyInTimezone,
  todayKeyInTimezone,
  bookingTimezone,
} from '../../../lib/bookingClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const today = todayKeyInTimezone();
  const tz = bookingTimezone();

  // Fetch all bookings
  const [upcomingRes, pastRes] = await Promise.all([
    bookingList({ upcoming: true, status: 'accepted', limit: 50 }),
    bookingList({ upcoming: false, status: 'accepted', limit: 50 }),
  ]);

  const upcomingBookings = upcomingRes.ok ? upcomingRes.data.bookings : [];
  const pastBookings = pastRes.ok ? pastRes.data.bookings : [];
  const allBookings = [...upcomingBookings, ...pastBookings];

  // Analyze each booking
  const bookingAnalysis = allBookings.map((b) => {
    const bookingDate = dateKeyInTimezone(b.startTime, tz);
    return {
      uid: b.uid,
      title: b.title,
      attendee: b.attendee,
      startTime: b.startTime,
      bookingDate,
      isToday: bookingDate === today,
      status: b.status,
    };
  });

  // Get today's events using the regular function
  const todayResult = await bookingsToday();

  return json({
    ok: true,
    debug: {
      timezone: tz,
      today,
      upcomingCount: upcomingBookings.length,
      pastCount: pastBookings.length,
      totalBookings: allBookings.length,
      todayBookingsFromFunction: todayResult.ok ? todayResult.data.events.length : 0,
      bookings: bookingAnalysis,
      todayEventsFromFunction: todayResult.ok ? todayResult.data.events : [],
      upcomingError: upcomingRes.ok ? null : upcomingRes.error,
      pastError: pastRes.ok ? null : pastRes.error,
      todayError: todayResult.ok ? null : todayResult.error,
    },
  });
}
