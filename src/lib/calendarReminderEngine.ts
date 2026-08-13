/**
 * Calendar booking reminders — queue upcoming Cal.com meetings, then fire
 * Web Push + dashboard alerts when due (default 15 minutes before start).
 */

import { bookingList, bookingTimezone, isBookingConfigured, type BookingSummary } from './bookingClient';
import {
  calendarReminderTag,
  calendarReminderUrl,
  formatReminderWhen,
  parseCalendarReminderOffsets,
  reminderDecision,
  reminderDedupKey,
  reminderFireAtMs,
  reminderPushCopy,
  sameBookingStart,
} from './calendarReminderLogic';
import {
  storeCancelCalendarRemindersForBooking,
  storeCancelOrphanCalendarReminders,
  storeClaimDueCalendarReminders,
  storeFindCalendarReminderByDedup,
  storeMarkCalendarReminder,
  storeReleaseCalendarReminder,
  storeSkipPastCalendarReminders,
  storeUpsertCalendarReminder,
  type CalendarReminder,
} from './calendarReminderStore';
import { hasFeature } from './features';
import { createLogger } from './logger';
import { isPgConfigured } from './pgPool';
import { storeFindPendingPushAlertByTag } from './pushAlertStore';
import { serverEnv } from './serverEnv';
import { sendPushNotification } from './webPush';

const log = createLogger('calendar-reminders');

export type BookingReminderSyncInput = {
  uid: string;
  startTime: string;
  title?: string | null;
  attendee?: string | null;
  status?: string | null;
};

export type CalendarReminderPollResult = {
  ok: boolean;
  synced: number;
  canceled: number;
  skippedPast: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
};

function reminderOffsets(): number[] {
  return parseCalendarReminderOffsets(serverEnv('CALENDAR_REMINDER_MINUTES'));
}

export function isCalendarRemindersEnabled(): boolean {
  if (serverEnv('CALENDAR_REMINDERS_ENABLED') === '0') return false;
  return hasFeature('scheduling') && isBookingConfigured() && isPgConfigured();
}

function isCanceledStatus(status?: string | null): boolean {
  const s = (status ?? '').trim().toLowerCase();
  return s === 'cancelled' || s === 'canceled' || s === 'rejected';
}

function bookingTitle(b: Pick<BookingSummary, 'title' | 'attendee'>): string {
  const attendee = b.attendee?.trim();
  return (
    b.title?.trim() ||
    (attendee && attendee.toLowerCase() !== 'unknown' ? `Meeting with ${attendee}` : 'Meeting')
  );
}

async function upsertOffsetsForBooking(input: BookingReminderSyncInput): Promise<number> {
  const startMs = Date.parse(input.startTime);
  if (!Number.isFinite(startMs)) return 0;
  let synced = 0;
  const title = bookingTitle({ title: input.title ?? '', attendee: input.attendee ?? '' });
  const attendee = input.attendee?.trim() || '';
  for (const offsetMinutes of reminderOffsets()) {
    const decision = reminderDecision({ startMs, offsetMinutes });
    if (decision === 'skip_past') continue;
    const dedupKey = reminderDedupKey(input.uid, offsetMinutes);
    const existing = await storeFindCalendarReminderByDedup(dedupKey).catch(() => null);
    if (
      existing &&
      (existing.status === 'sent' || existing.status === 'sending') &&
      sameBookingStart(existing.startTime, input.startTime)
    ) {
      continue;
    }
    const fireAt = new Date(reminderFireAtMs(startMs, offsetMinutes));
    const row = await storeUpsertCalendarReminder({
      bookingUid: input.uid,
      offsetMinutes,
      fireAt,
      startTime: input.startTime,
      title,
      attendee,
    });
    if (row) synced += 1;
  }
  return synced;
}

export async function syncReminderForBooking(input: BookingReminderSyncInput): Promise<number> {
  if (!isCalendarRemindersEnabled()) return 0;
  const uid = input.uid.trim();
  if (!uid) return 0;
  if (isCanceledStatus(input.status)) {
    await storeCancelCalendarRemindersForBooking(uid);
    return 0;
  }
  return upsertOffsetsForBooking({ ...input, uid });
}

export async function cancelRemindersForBooking(uid: string): Promise<number> {
  if (!isPgConfigured()) return 0;
  return storeCancelCalendarRemindersForBooking(uid);
}

/** Best-effort hook from booking create/reschedule — never throws to the caller. */
export function scheduleBookingReminderSync(input: BookingReminderSyncInput): void {
  void syncReminderForBooking(input)
    .then(async () => {
      await processDueCalendarReminders();
    })
    .catch((e) =>
      log.warn('booking sync failed', { error: e instanceof Error ? e.message : String(e) }),
    );
}

export function scheduleBookingReminderCancel(uid: string): void {
  void cancelRemindersForBooking(uid).catch((e) =>
    log.warn('booking cancel failed', { error: e instanceof Error ? e.message : String(e) }),
  );
}

async function syncUpcomingFromCalcom(): Promise<{ synced: number; canceled: number; error?: string }> {
  const listed = await bookingList({ upcoming: true, status: 'accepted', limit: 200 });
  if (!listed.ok) {
    return { synced: 0, canceled: 0, error: listed.error };
  }
  let synced = 0;
  const activeUids: string[] = [];
  for (const b of listed.data.bookings) {
    if (!b.uid) continue;
    if (isCanceledStatus(b.status)) continue;
    activeUids.push(b.uid);
    synced += await upsertOffsetsForBooking({
      uid: b.uid,
      startTime: b.startTime,
      title: b.title,
      attendee: b.attendee,
      status: b.status,
    });
  }
  const canceled = await storeCancelOrphanCalendarReminders(activeUids);
  return { synced, canceled };
}

async function fireReminder(row: CalendarReminder): Promise<'sent' | 'skipped' | 'failed'> {
  const startMs = Date.parse(row.startTime);
  if (!Number.isFinite(startMs) || startMs <= Date.now()) {
    await storeMarkCalendarReminder(row.id, 'skipped');
    return 'skipped';
  }

  const tag = calendarReminderTag(row.bookingUid, row.offsetMinutes);
  const existing = await storeFindPendingPushAlertByTag(tag).catch(() => null);
  if (existing) {
    await storeMarkCalendarReminder(row.id, 'sent');
    return 'sent';
  }

  const copy = reminderPushCopy({
    title: row.title,
    attendee: row.attendee,
    whenLabel: formatReminderWhen(row.startTime, bookingTimezone()),
    offsetMinutes: row.offsetMinutes,
  });

  try {
    await sendPushNotification({
      title: copy.title,
      body: copy.body,
      tag,
      url: calendarReminderUrl(row.bookingUid),
      kind: 'calendar',
      urgent: true,
      actions: ['view'],
    });
    await storeMarkCalendarReminder(row.id, 'sent');
    return 'sent';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await storeReleaseCalendarReminder(row.id, message);
    log.warn('push failed', { id: row.id, bookingUid: row.bookingUid, error: message });
    return 'failed';
  }
}

export async function processDueCalendarReminders(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  skippedPast: number;
}> {
  const skippedPast = await storeSkipPastCalendarReminders().catch(() => 0);
  const due = await storeClaimDueCalendarReminders(50);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of due) {
    const outcome = await fireReminder(row);
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'skipped') skipped += 1;
    else failed += 1;
  }
  return { processed: due.length, sent, skipped, failed, skippedPast };
}

let _running = false;

export async function runCalendarReminderPoll(): Promise<CalendarReminderPollResult> {
  const empty: CalendarReminderPollResult = {
    ok: true,
    synced: 0,
    canceled: 0,
    skippedPast: 0,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!isCalendarRemindersEnabled()) {
    return { ...empty, ok: false, error: 'calendar reminders disabled' };
  }
  if (_running) return { ...empty, error: 'already running' };
  _running = true;
  try {
    const sync = await syncUpcomingFromCalcom();
    const due = await processDueCalendarReminders();
    return {
      ok: !sync.error,
      synced: sync.synced,
      canceled: sync.canceled,
      skippedPast: due.skippedPast,
      processed: due.processed,
      sent: due.sent,
      skipped: due.skipped,
      failed: due.failed,
      ...(sync.error ? { error: sync.error } : {}),
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.warn('poll failed', { error });
    return { ...empty, ok: false, error };
  } finally {
    _running = false;
  }
}
