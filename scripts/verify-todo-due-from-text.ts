/**
 * Guard: spoken to-do titles yield the right due date/time (Siri add_todo).
 * Run: npm run check:todo-due-text
 */
import assert from 'node:assert/strict';
import {
  extractTodoDueFromText,
  formatSiriTodoDue,
  isStructuredTodoDue,
  todayYmdInTimeZone,
  zonedLocalToIso,
} from '../src/lib/todoDueFromText.ts';

const TZ = 'America/New_York';
/** Friday Aug 14, 2026, 10:00 AM Eastern (EDT, UTC-4). */
const NOW = new Date('2026-08-14T14:00:00.000Z');

function extract(text: string) {
  return extractTodoDueFromText(text, { now: NOW, timeZone: TZ });
}

function at(y: number, m: number, d: number, h: number, min = 0) {
  return zonedLocalToIso(TZ, y, m, d, h, min);
}

{
  const r = extract('Call the plumber tomorrow');
  assert.equal(r.matched, true);
  assert.equal(r.hasTime, false);
  assert.equal(r.title, 'Call the plumber');
  assert.equal(r.due_date, '2026-08-15');
}

{
  const r = extract('Call the plumber tomorrow at 3');
  assert.equal(r.title, 'Call the plumber');
  assert.equal(r.hasTime, true);
  assert.equal(r.due_date, at(2026, 8, 15, 15));
}

{
  const r = extract('Call the plumber tomorrow at 3 p.m.');
  assert.equal(r.title, 'Call the plumber');
  assert.equal(r.due_date, at(2026, 8, 15, 15));
}

{
  const r = extract('Pick up milk today');
  assert.equal(r.title, 'Pick up milk');
  assert.equal(r.due_date, '2026-08-14');
}

{
  const r = extract('Take out the trash tonight');
  assert.equal(r.title, 'Take out the trash');
  assert.equal(r.due_date, at(2026, 8, 14, 20));
}

{
  const r = extract('Oil change next Tuesday');
  assert.equal(r.title, 'Oil change');
  assert.equal(r.due_date, '2026-08-18');
}

{
  const r = extract('Pay rent on August 15');
  assert.equal(r.title, 'Pay rent');
  assert.equal(r.due_date, '2026-08-15');
}

{
  const r = extract('Dentist at 3');
  assert.equal(r.title, 'Dentist');
  assert.equal(r.due_date, at(2026, 8, 14, 15));
}

{
  const r = extract('Meeting at 9');
  // 9 AM already passed at 10 AM — roll to tomorrow 9 AM.
  assert.equal(r.title, 'Meeting');
  assert.equal(r.due_date, at(2026, 8, 15, 9));
}

{
  const r = extract('Review Q2 taxes');
  assert.equal(r.matched, false);
  assert.equal(r.due_date, null);
  assert.equal(r.title, 'Review Q2 taxes');
}

{
  const r = extract('Call May about the invoice');
  assert.equal(r.matched, false);
  assert.equal(r.due_date, null);
}

{
  const r = extract('Meeting May 20');
  assert.equal(r.title, 'Meeting');
  assert.equal(r.due_date, '2027-05-20');
}

{
  const r = extract('8/15 call accountant');
  assert.equal(r.title, 'call accountant');
  assert.equal(r.due_date, '2026-08-15');
}

{
  const r = extract('tomorrow');
  assert.equal(r.matched, true);
  assert.equal(r.due_date, '2026-08-15');
  assert.equal(r.title, 'tomorrow');
}

{
  const r = extract('Remind me tomorrow to call John');
  assert.equal(r.title, 'Remind me to call John');
  assert.equal(r.due_date, '2026-08-15');
}

{
  const r = extract('Call John due tomorrow');
  assert.equal(r.title, 'Call John');
  assert.equal(r.due_date, '2026-08-15');
}

{
  const r = extract('Friday morning walk the dog');
  assert.equal(r.matched, false);
}

{
  const r = extract('Walk the dog Friday morning');
  assert.equal(r.title, 'Walk the dog');
  assert.equal(r.due_date, at(2026, 8, 14, 9));
}

{
  const r = extract('Walk the dog next Friday');
  assert.equal(r.title, 'Walk the dog');
  assert.equal(r.due_date, '2026-08-21');
}

{
  const r = extract('Submit report in 2 days');
  assert.equal(r.title, 'Submit report');
  assert.equal(r.due_date, '2026-08-16');
}

{
  const r = extract('Call John in 2 hours');
  assert.equal(r.title, 'Call John');
  assert.equal(r.hasTime, true);
  assert.equal(r.due_date, new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString());
}

{
  const r = extract("Meet at noon tomorrow");
  assert.equal(r.title, 'Meet');
  assert.equal(r.due_date, at(2026, 8, 15, 12));
}

{
  const r = extract('Friday numbers review');
  assert.equal(r.matched, false);
}

assert.equal(isStructuredTodoDue('2026-08-15'), true);
assert.equal(isStructuredTodoDue('2026-08-15T15:00:00.000Z'), true);
assert.equal(isStructuredTodoDue('tomorrow'), false);

assert.equal(todayYmdInTimeZone(TZ, NOW), '2026-08-14');

assert.equal(
  formatSiriTodoDue('2026-08-15', { now: NOW, timeZone: TZ }),
  'due tomorrow',
);
assert.equal(
  formatSiriTodoDue(at(2026, 8, 15, 15), { now: NOW, timeZone: TZ }),
  'due tomorrow at 3 PM',
);
assert.equal(
  formatSiriTodoDue('2026-08-14', { now: NOW, timeZone: TZ }),
  'due today',
);

console.log('ok: todo due-from-text');
