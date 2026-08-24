/**
 * GET/POST /api/calendar/reminders/poll — sync upcoming Cal.com bookings and
 * fire due meeting reminders (Web Push + dashboard).
 *
 * Auth: ?key=<CALENDAR_REMINDER_POLL_SECRET> or deployment owner Clerk session.
 */
import { runCalendarReminderPoll } from '../../../../lib/calendarReminderEngine';
import {
  calendarReminderPollSecret,
  ensureCalendarReminderScheduler,
} from '../../../../lib/calendarReminderScheduler';
import { createPollRoute } from '../../../../lib/api/pollRoute';

export const prerender = false;

const route = createPollRoute({
  feature: 'scheduling',
  secret: calendarReminderPollSecret,
  ensureScheduler: ensureCalendarReminderScheduler,
  run: async () => {
    const result = await runCalendarReminderPoll();
    return {
      body: result,
      status: result.ok ? 200 : result.error === 'already running' ? 200 : 503,
    };
  },
});

export const GET = route.GET;
export const POST = route.POST;
