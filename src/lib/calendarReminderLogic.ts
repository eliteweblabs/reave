/**
 * Pure helpers for calendar booking reminders (no I/O).
 * Default: one push + dashboard alert 15 minutes before each accepted booking.
 */

export const DEFAULT_CALENDAR_REMINDER_MINUTES = [15];
/** Cap a single offset at 7 days. */
export const MAX_CALENDAR_REMINDER_MINUTES = 10_080;

export type CalendarReminderDecision = 'pending' | 'due' | 'skip_past';

export function parseCalendarReminderOffsets(raw?: string | null): number[] {
  const source = (raw ?? '').trim();
  const nums = source
    ? source
        .split(/[,\s]+/)
        .map((part) => Number(part))
        .filter((n) => Number.isFinite(n) && n > 0)
    : DEFAULT_CALENDAR_REMINDER_MINUTES;
  const unique = [
    ...new Set(nums.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= MAX_CALENDAR_REMINDER_MINUTES)),
  ];
  unique.sort((a, b) => b - a);
  return unique.length ? unique : [...DEFAULT_CALENDAR_REMINDER_MINUTES];
}

export function reminderDedupKey(bookingUid: string, offsetMinutes: number): string {
  return `calendar:${bookingUid.trim()}:${offsetMinutes}`;
}

export function calendarReminderTag(bookingUid: string, offsetMinutes: number): string {
  return `calendar-reminder-${bookingUid.trim()}-${offsetMinutes}`;
}

export function calendarReminderUrl(bookingUid: string): string {
  return `/admin?tab=schedule&booking=${encodeURIComponent(bookingUid.trim())}`;
}

export function reminderFireAtMs(startMs: number, offsetMinutes: number): number {
  return startMs - offsetMinutes * 60_000;
}

export function reminderDecision(opts: {
  startMs: number;
  offsetMinutes: number;
  nowMs?: number;
}): CalendarReminderDecision {
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(opts.startMs) || opts.startMs <= nowMs) return 'skip_past';
  const fireAt = reminderFireAtMs(opts.startMs, opts.offsetMinutes);
  return fireAt <= nowMs ? 'due' : 'pending';
}

export function formatReminderOffsetLabel(minutes: number): string {
  if (minutes === 1440) return '1 day';
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes === 60) return '1 hour';
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60} hours`;
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export function formatReminderWhen(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    });
  } catch {
    return iso;
  }
}

export function reminderPushCopy(opts: {
  title?: string | null;
  attendee?: string | null;
  whenLabel: string;
  offsetMinutes: number;
}): { title: string; body: string } {
  const who = (opts.attendee ?? '').trim();
  const whoOk = who && who.toLowerCase() !== 'unknown';
  const meetingTitle = (opts.title ?? '').trim();
  const heading = `Meeting in ${formatReminderOffsetLabel(opts.offsetMinutes)}`;
  const subject =
    meetingTitle && (!whoOk || !meetingTitle.toLowerCase().includes(who.toLowerCase()))
      ? meetingTitle
      : whoOk
        ? `Meeting with ${who}`
        : meetingTitle || 'Meeting';
  const detailParts = [whoOk && subject !== `Meeting with ${who}` ? who : '', opts.whenLabel].filter(
    Boolean,
  );
  return {
    title: heading,
    body: detailParts.join(' · ') || subject,
  };
}

export function sameBookingStart(aIso: string, bIso: string, slackMs = 120_000): boolean {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return aIso === bIso;
  return Math.abs(a - b) <= slackMs;
}
