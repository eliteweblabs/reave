import assert from 'node:assert/strict';
import {
  isImmediateScheduledAt,
  parseComposeScheduledAt,
} from '../src/lib/emailComposeSchedule.ts';

assert.equal(parseComposeScheduledAt(null), null);
assert.equal(parseComposeScheduledAt(''), null);

const soon = new Date(Date.now() + 60 * 60 * 1000);
const parsed = parseComposeScheduledAt(soon.toISOString());
assert.ok(parsed);
assert.equal(Math.abs(parsed.getTime() - soon.getTime()) < 1000, true);
assert.equal(isImmediateScheduledAt(parsed), false);

const immediate = new Date(Date.now() + 5_000);
assert.equal(isImmediateScheduledAt(immediate), true);

assert.throws(() => parseComposeScheduledAt('not-a-date'), /Invalid scheduled time/);
assert.throws(() => parseComposeScheduledAt(new Date(Date.now() - 5 * 60 * 1000).toISOString()), /past/);
assert.throws(
  () => parseComposeScheduledAt(new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString()),
  /one year/,
);

console.log('verify-email-scheduled: ok');
