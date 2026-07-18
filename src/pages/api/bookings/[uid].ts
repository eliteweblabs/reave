/**
 * GET    /api/bookings/[uid] — one Cal.com booking
 * DELETE /api/bookings/[uid] — cancel booking
 * PATCH  /api/bookings/[uid] — reschedule (body: { start: ISO8601 })
 */

import type { APIRoute } from 'astro';
import {
  bookingCancel,
  bookingGet,
  bookingReschedule,
  calcomWebappUrl,
  isBookingConfigured,
} from '../../../lib/bookingClient';
import { hasFeature } from '../../../lib/features';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function schedulingEnabled(): boolean {
  return hasFeature('scheduling');
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!schedulingEnabled()) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }
  if (!isBookingConfigured()) {
    return json({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  const result = await bookingGet(uid);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const web = calcomWebappUrl();
  return json({
    ok: true,
    booking: result.data.booking,
    calcomAdminUrl: web ? `${web}/bookings/${uid}` : null,
  });
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!schedulingEnabled()) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }
  if (!isBookingConfigured()) {
    return json({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Empty body is fine, use default reason
  }

  const reason =
    typeof body.cancellationReason === 'string' && body.cancellationReason.trim()
      ? body.cancellationReason.trim()
      : 'Cancelled by user';

  const result = await bookingCancel(uid, reason);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  return json({ ok: true, cancelled: true, uid });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!schedulingEnabled()) {
    return json({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }
  if (!isBookingConfigured()) {
    return json({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const uid = (params.uid ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const start = typeof body.start === 'string' ? body.start.trim() : '';
  if (!start) return json({ ok: false, error: 'start is required (ISO8601)' }, 400);

  const result = await bookingReschedule(uid, {
    start,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    phone: typeof body.phone === 'string' ? body.phone : undefined,
    address: typeof body.address === 'string' ? body.address : undefined,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const refreshed = await bookingGet(uid);
  if (!refreshed.ok) {
    return json({ ok: true, rescheduled: true, uid });
  }

  return json({
    ok: true,
    rescheduled: true,
    booking: refreshed.data.booking,
  });
};
