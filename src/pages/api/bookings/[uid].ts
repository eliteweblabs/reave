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
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function schedulingEnabled(): boolean {
  return hasFeature('scheduling');
}

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!schedulingEnabled()) {
    return jsonResponse({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }
  if (!isBookingConfigured()) {
    return jsonResponse({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const result = await bookingGet(uid);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  const web = calcomWebappUrl();
  return jsonResponse({
    ok: true,
    booking: result.data.booking,
    calcomAdminUrl: web ? `${web}/bookings/${uid}` : null,
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!schedulingEnabled()) {
    return jsonResponse({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }
  if (!isBookingConfigured()) {
    return jsonResponse({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown> = {};
  try {
    const text = await context.request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Empty body is fine, use default reason
  }

  const reason =
    typeof body.cancellationReason === 'string' && body.cancellationReason.trim()
      ? body.cancellationReason.trim()
      : 'Cancelled by user';

  const result = await bookingCancel(uid, reason);
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  return jsonResponse({ ok: true, cancelled: true, uid });
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!schedulingEnabled()) {
    return jsonResponse({ ok: false, error: 'Scheduling module not enabled (FEATURES)' }, 404);
  }
  if (!isBookingConfigured()) {
    return jsonResponse({ ok: false, error: 'BOOKING_API_URL is not set' }, 503);
  }

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const start = typeof body.start === 'string' ? body.start.trim() : '';
  if (!start) return jsonResponse({ ok: false, error: 'start is required (ISO8601)' }, 400);

  const result = await bookingReschedule(uid, {
    start,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    phone: typeof body.phone === 'string' ? body.phone : undefined,
    address: typeof body.address === 'string' ? body.address : undefined,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  const refreshed = await bookingGet(uid);
  if (!refreshed.ok) {
    return jsonResponse({ ok: true, rescheduled: true, uid });
  }

  return jsonResponse({
    ok: true,
    rescheduled: true,
    booking: refreshed.data.booking,
  });
};
