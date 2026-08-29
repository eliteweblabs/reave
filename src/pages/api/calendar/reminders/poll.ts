/**
 * GET/POST /api/calendar/reminders/poll — sync upcoming Cal.com bookings and
 * fire due meeting reminders (Web Push + dashboard).
 *
 * Auth: ?key=<CALENDAR_REMINDER_POLL_SECRET> or deployment owner Clerk session.
 */
import type { APIRoute } from 'astro';
import { runCalendarReminderPoll } from '../../../../lib/calendarReminderEngine';
import {
  calendarReminderPollSecret,
  ensureCalendarReminderScheduler,
} from '../../../../lib/calendarReminderScheduler';
import { hasFeature } from '../../../../lib/features';
import { authorizePollOrOwner } from '../../../../lib/pollRouteAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, calendarReminderPollSecret);
  if (auth instanceof Response) return auth;

  if (!hasFeature('scheduling')) {
    return jsonResponse({ ok: false, error: 'scheduling not enabled' }, 404);
  }

  ensureCalendarReminderScheduler();
  const result = await runCalendarReminderPoll();
  return jsonResponse(result, result.ok ? 200 : result.error === 'already running' ? 200 : 503);
};

export const POST: APIRoute = GET;
