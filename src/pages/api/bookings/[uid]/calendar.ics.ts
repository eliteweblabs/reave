/**
 * GET /api/bookings/[uid]/calendar.ics — attendee-facing iCalendar download.
 * No auth: booking uid is the capability token (same model as Cal.com manage links).
 */

import type { APIRoute } from 'astro';
import { buildBookingIcs } from '../../../../lib/calendarLinks';
import { bookingGet, bookingManageUrl, isBookingConfigured } from '../../../../lib/bookingClient';
import { getCompanyConfig } from '../../../../lib/companyConfig';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  if (!isBookingConfigured()) {
    return new Response('Scheduling is not configured', { status: 503 });
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return new Response('Not found', { status: 404 });

  const result = await bookingGet(uid);
  if (!result.ok) {
    return new Response(result.error || 'Booking not found', {
      status: result.status === 404 ? 404 : 502,
    });
  }

  const booking = result.data.booking;
  const company = await getCompanyConfig();
  const manageUrl = bookingManageUrl(uid);
  const attendee =
    booking.attendee?.trim() && booking.attendee !== 'Unknown'
      ? booking.attendee.trim()
      : booking.email?.trim() || 'Guest';
  const title =
    booking.title?.trim() ||
    (company.name ? `Meeting with ${company.name}` : `Meeting with ${attendee}`);

  const descriptionParts = [
    booking.description?.trim(),
    manageUrl ? `Manage or reschedule: ${manageUrl}` : '',
  ].filter(Boolean);

  const ics = buildBookingIcs({
    uid,
    title,
    startIso: booking.startTime,
    endIso: booking.endTime,
    location: booking.location,
    description: descriptionParts.join('\n\n'),
    organizerEmail: company.fromEmail?.trim() || company.supportEmail?.trim() || undefined,
    organizerName: company.name?.trim() || undefined,
  });

  if (!ics) return new Response('Could not build calendar file', { status: 500 });

  const filename = `meeting-${uid.slice(0, 8)}.ics`;
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
};
