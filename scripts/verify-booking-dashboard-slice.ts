/**
 * Guard: dashboard booking stats come from one upcoming + one past list.
 */
import assert from 'node:assert/strict';
import {
  deriveBookingDashboardSlice,
  type BookingSliceRow,
} from '../src/lib/bookingDashboardSlice';

function booking(partial: Partial<BookingSliceRow> & { uid: string; startTime: string }): BookingSliceRow {
  return {
    title: 'Meeting',
    status: 'accepted',
    attendee: 'Pat',
    ...partial,
  };
}

const now = Date.parse('2026-08-27T16:00:00.000Z');
const today = '2026-08-27';
const todaySoon = booking({ uid: 'today-soon', startTime: '2026-08-27T18:00:00.000Z' });
const todayPast = booking({ uid: 'today-past', startTime: '2026-08-27T12:00:00.000Z' });
const tomorrow = booking({ uid: 'tomorrow', startTime: '2026-08-28T15:00:00.000Z' });
const lastWeek = booking({ uid: 'old', startTime: '2026-08-20T15:00:00.000Z' });
const dup = booking({ uid: 'today-soon', startTime: '2026-08-27T18:00:00.000Z' });

const slice = deriveBookingDashboardSlice(
  [todaySoon, tomorrow, dup],
  [todayPast, lastWeek],
  now,
  today,
);

assert.equal(slice.meetingsTotal, 4);
assert.deepEqual(
  slice.eventsToday.map((e) => e.uid),
  ['today-past', 'today-soon'],
);
assert.deepEqual(
  slice.eventsNext24h.map((e) => e.uid),
  ['today-soon', 'tomorrow'],
);

console.log('ok: booking dashboard slice');
