/**
 * Background scheduler for calendar booking reminders.
 * Lazy-started on dashboard / bookings / poll traffic — mirrors newsletterScheduler.
 * Railway cron hitting /api/calendar/reminders/poll?key= is the reliable trigger.
 */
import { isCalendarRemindersEnabled, runCalendarReminderPoll } from './calendarReminderEngine';
import { isPgConfigured } from './pgPool';
import { serverEnv } from './serverEnv';

let _timer: ReturnType<typeof setInterval> | null = null;

function pollIntervalMs(): number {
  const min = Number(serverEnv('CALENDAR_REMINDER_POLL_MINUTES') || 1);
  const clamped = Math.max(1, Math.min(min, 5));
  return clamped * 60_000;
}

export function calendarReminderPollSecret(): string | null {
  return serverEnv('CALENDAR_REMINDER_POLL_SECRET')?.trim() || null;
}

export function ensureCalendarReminderScheduler(): void {
  if (_timer) return;
  if (!isCalendarRemindersEnabled()) return;
  if (!isPgConfigured()) return;

  const ms = pollIntervalMs();
  void runCalendarReminderPoll().catch((e) =>
    console.warn('[calendar-reminders] initial run failed', e),
  );
  _timer = setInterval(() => {
    void runCalendarReminderPoll().catch((e) => console.warn('[calendar-reminders] run failed', e));
  }, ms);
  console.info('[calendar-reminders] scheduler started', { intervalMinutes: ms / 60_000 });
}
