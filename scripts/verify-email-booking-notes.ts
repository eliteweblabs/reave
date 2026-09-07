/**
 * Booking notes from inbox emails must retain the full message body for reference
 * after the inbox item is archived.
 */
import assert from 'node:assert/strict';
import {
  buildBookingNotesFromEmail,
  MAX_BOOKING_EMAIL_NOTES,
} from '../src/lib/emailBookingNotes.ts';

const BESTBUY_BODY = `View as a Web page:
================================================================================
BEST BUY
================================================================================
View full message:
================================================================================
We're all set for your 20-minute appointment. Check in at the Geek Squad Service Desk five minutes early.

Confirmation Number: VQS327W2H

230 Independence Way, Danvers, MA 01923-3692`;

const notes = buildBookingNotesFromEmail({
  from: 'BestBuyInfo@emailinfo.bestbuy.com',
  subject: 'Your appointment is scheduled.',
  receivedAt: '2026-09-07T17:05:00.000Z',
  schedulingNote: 'Best Buy Geek Squad appointment',
  bodyText: BESTBUY_BODY,
  vendorLabel: 'BestBuyInfo',
  durationMinutes: 15,
});

assert.ok(notes.includes('Vendor appointment (BestBuyInfo)'), 'vendor tag');
assert.ok(notes.includes('From: BestBuyInfo@emailinfo.bestbuy.com'), 'from line');
assert.ok(notes.includes('Subject: Your appointment is scheduled.'), 'subject line');
assert.ok(notes.includes('Requested: Best Buy Geek Squad appointment'), 'scheduling note');
assert.ok(notes.includes('Duration: 15 minutes'), 'duration when non-default');
assert.ok(notes.includes('--- Email ---'), 'email section marker');
assert.ok(notes.includes('Confirmation Number: VQS327W2H'), 'full body preserved');
assert.ok(notes.includes('230 Independence Way, Danvers, MA 01923-3692'), 'address in body');
assert.ok(notes.length > 500, 'must exceed legacy 500-char cap');

const huge = 'x'.repeat(MAX_BOOKING_EMAIL_NOTES + 500);
const capped = buildBookingNotesFromEmail({ subject: 'Big', bodyText: huge });
assert.ok(capped.length <= MAX_BOOKING_EMAIL_NOTES + 80, 'caps extremely long bodies');
assert.ok(capped.includes('truncated at'), 'truncation marker when over max');

console.log('verify-email-booking-notes: ok');
