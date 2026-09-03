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

/** Canonical storage / display form (e.g. `"60,15"`). */
export function formatCalendarReminderOffsets(minutes: number[]): string {
  return parseCalendarReminderOffsets(minutes.join(',')).join(',');
}

/** Normalize admin/env input to a canonical comma-separated string. */
export function normalizeCalendarReminderMinutesInput(
  raw?: string | number | null,
  fallback = DEFAULT_CALENDAR_REMINDER_MINUTES.join(','),
): string {
  if (raw == null || raw === '') {
    return formatCalendarReminderOffsets(parseCalendarReminderOffsets(fallback));
  }
  return formatCalendarReminderOffsets(parseCalendarReminderOffsets(String(raw)));
}

export function reminderDedupKey(bookingUid: string, offsetMinutes: number): string {
  return `calendar:${bookingUid.trim()}:${offsetMinutes}`;
}

export function calendarReminderTag(bookingUid: string, offsetMinutes: number): string {
  return `calendar-reminder-${bookingUid.trim()}-${offsetMinutes}`;
}

/** Inverse of calendarReminderTag — bookingUid may contain hyphens. */
export function parseCalendarReminderTag(
  tag?: string | null,
): { bookingUid: string; offsetMinutes: number } | null {
  const raw = String(tag || '').trim();
  const match = raw.match(/^calendar-reminder-(.+)-(\d+)$/i);
  if (!match) return null;
  const offsetMinutes = Number(match[2]);
  if (!Number.isFinite(offsetMinutes) || offsetMinutes < 1) return null;
  return { bookingUid: match[1], offsetMinutes };
}

/** Start time inferred from when the reminder alert was created (fire ≈ start − offset). */
export function inferCalendarReminderStartMs(opts: {
  tag?: string | null;
  createdAt?: string | null;
}): number | null {
  const parsed = parseCalendarReminderTag(opts.tag);
  if (!parsed) return null;
  const created = Date.parse(String(opts.createdAt || ''));
  if (!Number.isFinite(created)) return null;
  return created + parsed.offsetMinutes * 60_000;
}

/** Meeting review / calendar-reminder cards that should expire after the slot. */
export function isExpiringMeetingNotice(item: {
  type?: string | null;
  alertKind?: string | null;
}): boolean {
  const type = String(item?.type || '');
  if (type === 'meeting' || type === 'meeting_request' || type === 'meeting_conflict') return true;
  return type === 'push_alert' && item?.alertKind === 'calendar';
}

export function resolveMeetingNoticeStartMs(item: {
  type?: string | null;
  alertKind?: string | null;
  bookingStart?: string | null;
  proposedMeetingStart?: string | null;
  tag?: string | null;
  receivedAt?: string | null;
}): number | null {
  if (!isExpiringMeetingNotice(item)) return null;
  const direct = item.bookingStart || item.proposedMeetingStart;
  if (direct) {
    const ms = Date.parse(direct);
    if (Number.isFinite(ms)) return ms;
  }
  return inferCalendarReminderStartMs({ tag: item.tag, createdAt: item.receivedAt });
}

/** Grace after meeting start before a live dashboard card fades out. */
export const MEETING_NOTICE_EXPIRE_HOLD_MS = 2200;

export function meetingNoticeExpireAtMs(item: {
  type?: string | null;
  alertKind?: string | null;
  bookingStart?: string | null;
  proposedMeetingStart?: string | null;
  tag?: string | null;
  receivedAt?: string | null;
}): number | null {
  const startMs = resolveMeetingNoticeStartMs(item);
  if (startMs == null) return null;
  return startMs + MEETING_NOTICE_EXPIRE_HOLD_MS;
}

/** True once the meeting slot (+ hold) has passed — card should not stay on the dashboard. */
export function isExpiredMeetingNotice(
  item: {
    type?: string | null;
    alertKind?: string | null;
    bookingStart?: string | null;
    proposedMeetingStart?: string | null;
    tag?: string | null;
    receivedAt?: string | null;
  },
  nowMs = Date.now(),
): boolean {
  const expireAt = meetingNoticeExpireAtMs(item);
  if (expireAt == null) return false;
  return expireAt <= nowMs;
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
