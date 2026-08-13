/**
 * Guard: calendar reminder fire times, copy, and offset parsing.
 * Run: npm run check:calendar-reminders
 */
import assert from 'node:assert/strict';
import {
  calendarReminderTag,
  calendarReminderUrl,
  formatReminderOffsetLabel,
  parseCalendarReminderOffsets,
  reminderDecision,
  reminderDedupKey,
  reminderFireAtMs,
  reminderPushCopy,
  sameBookingStart,
} from '../src/lib/calendarReminderLogic.ts';

assert.deepEqual(parseCalendarReminderOffsets(undefined), [15]);
assert.deepEqual(parseCalendarReminderOffsets(''), [15]);
assert.deepEqual(parseCalendarReminderOffsets('15'), [15]);
assert.deepEqual(parseCalendarReminderOffsets('1440, 60, 15'), [1440, 60, 15]);
assert.deepEqual(parseCalendarReminderOffsets('15,15,0,-5'), [15]);

const start = Date.parse('2026-08-13T16:00:00.000Z');
assert.equal(reminderFireAtMs(start, 15), Date.parse('2026-08-13T15:45:00.000Z'));

assert.equal(
  reminderDecision({ startMs: start, offsetMinutes: 15, nowMs: Date.parse('2026-08-13T15:00:00.000Z') }),
  'pending',
);
assert.equal(
  reminderDecision({ startMs: start, offsetMinutes: 15, nowMs: Date.parse('2026-08-13T15:45:00.000Z') }),
  'due',
);
assert.equal(
  reminderDecision({ startMs: start, offsetMinutes: 15, nowMs: Date.parse('2026-08-13T16:00:00.000Z') }),
  'skip_past',
);

assert.equal(formatReminderOffsetLabel(15), '15 minutes');
assert.equal(formatReminderOffsetLabel(60), '1 hour');
assert.equal(formatReminderOffsetLabel(1440), '1 day');

const copy = reminderPushCopy({
  title: 'Site visit',
  attendee: 'Sarah Chen',
  whenLabel: 'August 13 at 12:00 PM',
  offsetMinutes: 15,
});
assert.equal(copy.title, 'Meeting in 15 minutes');
assert.match(copy.body, /Sarah Chen/);
assert.match(copy.body, /August 13/);

assert.equal(reminderDedupKey('abc', 15), 'calendar:abc:15');
assert.equal(calendarReminderTag('abc', 15), 'calendar-reminder-abc-15');
assert.equal(calendarReminderUrl('abc'), '/admin?tab=schedule&booking=abc');
assert.ok(sameBookingStart('2026-08-13T16:00:00.000Z', '2026-08-13T16:00:30.000Z'));
assert.equal(sameBookingStart('2026-08-13T16:00:00.000Z', '2026-08-13T16:10:00.000Z'), false);

console.log('ok: calendar reminders');
