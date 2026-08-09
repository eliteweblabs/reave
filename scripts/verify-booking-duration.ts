/**
 * Smoke tests for meeting duration parsing / inference.
 * Run: npx tsx scripts/verify-booking-duration.ts
 */
import assert from 'node:assert/strict';
import {
  inferMeetingDurationMinutes,
  parseMeetingDurationMinutes,
} from '../src/lib/bookingDuration';

const cases: Array<[string, number | null]> = [
  ['Can we meet for an hour on Tuesday?', 60],
  ['Need a 1 hour call', 60],
  ['60 minute meeting please', 60],
  ['quick 15 min chat', 15],
  ['half an hour works', 30],
  ['90 minutes would be great', 90],
  ['1.5 hours', 90],
  ['two hour workshop', 120],
  ['see you Tuesday at 2pm', null],
  ['60min slot', 60],
];

let failed = 0;
for (const [text, expected] of cases) {
  const got = parseMeetingDurationMinutes(text);
  try {
    assert.equal(got, expected, text);
    console.log(`ok  ${JSON.stringify(text)} → ${got}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${JSON.stringify(text)} → ${got} (expected ${expected})`);
    console.error(e);
  }
}

assert.equal(
  inferMeetingDurationMinutes('Tuesday 2pm', 'Re: hour meeting', 'Client wants an hour'),
  60,
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${cases.length + 1} passed`);
