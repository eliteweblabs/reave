/**
 * Verify BusinessHours → GBP regularHours conversion.
 * Run: npx tsx scripts/verify-gbp-hours.ts
 */
import assert from 'node:assert/strict';
import { businessHoursToGbpRegularHours } from '../src/lib/gbpHours.ts';
import { emptyBusinessHours, normalizeIntervals } from '../src/lib/businessHours.ts';

const weekdayHours = emptyBusinessHours('manual');
for (let day = 1; day <= 5; day += 1) {
  weekdayHours.days[day] = normalizeIntervals([{ start: 9 * 60, end: 17 * 60 }]);
}

const converted = businessHoursToGbpRegularHours(weekdayHours);
assert.ok(converted);
assert.equal(converted!.periods.length, 5);
assert.equal(converted!.periods[0].openDay, 'MONDAY');
assert.deepEqual(converted!.periods[0].openTime, { hours: 9, minutes: 0 });
assert.deepEqual(converted!.periods[0].closeTime, { hours: 17, minutes: 0 });

const always = emptyBusinessHours('manual');
always.alwaysOpen = true;
const alwaysConverted = businessHoursToGbpRegularHours(always);
assert.ok(alwaysConverted);
assert.equal(alwaysConverted!.periods[0].openDay, 'SUNDAY');
assert.equal(alwaysConverted!.periods[0].closeDay, 'SATURDAY');

console.log('verify-gbp-hours: ok');
