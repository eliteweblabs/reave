/**
 * GET/POST /api/calendar/reminders/poll — sync upcoming Cal.com bookings and
 * fire due meeting reminders (Web Push + dashboard).
 *
 * Auth: ?key=<CALENDAR_REMINDER_POLL_SECRET> or deployment owner Clerk session.
 */
import type { APIRoute } from 'astro';
import { createPollRoute } from '../../../../lib/api/pollRoute';
import { runCalendarReminderPoll } from '../../../../lib/calendarReminderEngine';
import {
  calendarReminderPollSecret,
  ensureCalendarReminderScheduler,
} from '../../../../lib/calendarReminderScheduler';
import { hasFeature } from '../../../../lib/features';

export const prerender = false;

const poll = createPollRoute({
  getSecret: calendarReminderPollSecret,
  feature: {
    check: () => hasFeature('scheduling'),
    error: 'scheduling not enabled',
  },
  ensureScheduler: ensureCalendarReminderScheduler,
  run: async () => runCalendarReminderPoll(),
  mapStatus: (result) => {
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return 200;
    }
    const error = result && typeof result === 'object' ? (result as { error?: string }).error : undefined;
    return error === 'already running' ? 200 : 503;
  },
});

export const GET: APIRoute = poll;
export const POST: APIRoute = poll;
