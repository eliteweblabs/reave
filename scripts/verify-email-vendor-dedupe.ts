/**
 * Guard: vendor appointment confirmations already tracked must auto-archive.
 * Run: npm run check:email-vendor-dedupe
 */
import assert from 'node:assert/strict';
import {
  calendarAlreadyHasVendorAppointmentTime,
  extractAppointmentConfirmationNumber,
  priorVendorAppointmentWasHandled,
  shouldSuppressDuplicateVendorAppointment,
  vendorAppointmentSenderKey,
} from '../src/lib/emailVendorAppointmentDedup.ts';
import type { EmailInboxRecord } from '../src/lib/emailInboxStore.ts';
import { isMeetingRequestPendingReview } from '../src/lib/emailReviewPending.ts';

const RECEIVED_AT = '2026-09-06T18:00:00.000Z';
const PRIOR_RECEIVED_AT = '2026-09-06T14:00:00.000Z';

const BESTBUY_FROM = 'BestBuyInfo@emailinfo.bestbuy.com';
const BESTBUY_SUBJECT = 'Your appointment is scheduled.';
const BESTBUY_BODY = `We're all set for your 20-minute appointment. Check in at the Geek Squad Service Desk five minutes early.

Confirmation Number: VQS327W2H`;

function inboxRecord(patch: Partial<EmailInboxRecord> = {}): EmailInboxRecord {
  return {
    id: 'em_vendor_1',
    receivedAt: RECEIVED_AT,
    from: BESTBUY_FROM,
    subject: BESTBUY_SUBJECT,
    bodySnippet: BESTBUY_BODY.slice(0, 200),
    bodyText: BESTBUY_BODY,
    bodyHtml: '',
    to: ['owner@reave.app'],
    cc: [],
    bcc: [],
    replyTo: [],
    headers: {},
    messageId: '<bestbuy-2@emailinfo.bestbuy.com>',
    resendEmailId: '',
    attachments: [],
    status: 'UNMATCHED',
    action: 'review',
    notified: false,
    summary: 'Best Buy Geek Squad appointment scheduled.',
    category: 'review',
    contactUid: null,
    contactName: null,
    jobSlug: null,
    jobTitle: null,
    routeNote: '',
    classificationAudit: [],
    proposedMeetingStart: null,
    schedulingNote: 'Best Buy 20-minute appointment — check email for date/time',
    bookingUid: null,
    bookingStart: null,
    seenAt: null,
    automationAckAt: null,
    automationTriageAt: null,
    automationTriageAction: null,
    automationTriageRuleId: null,
    automationKind: 'meeting_request',
    verificationCode: null,
    actionUrl: null,
    deleteAfterAt: null,
    ...patch,
  };
}

assert.equal(vendorAppointmentSenderKey(BESTBUY_FROM), 'bestbuy');
assert.equal(
  extractAppointmentConfirmationNumber(BESTBUY_BODY),
  'VQS327W2H',
  'confirmation numbers must normalize for dedupe',
);

const priorHandled = inboxRecord({
  id: 'em_vendor_prior',
  receivedAt: PRIOR_RECEIVED_AT,
  messageId: '<bestbuy-1@emailinfo.bestbuy.com>',
  bookingUid: 'bk_bestbuy_1',
  bookingStart: '2026-09-07T18:30:00.000Z',
  automationAckAt: '2026-09-06T15:00:00.000Z',
  action: 'filed',
  status: 'FILED',
  category: 'internal',
});

assert.equal(priorVendorAppointmentWasHandled(priorHandled), true);

assert.equal(
  shouldSuppressDuplicateVendorAppointment({
    from: BESTBUY_FROM,
    subject: BESTBUY_SUBJECT,
    bodyText: BESTBUY_BODY,
    proposedMeetingStart: null,
    schedulingNote: 'Best Buy 20-minute appointment — check email for date/time',
    prior: priorHandled,
  }),
  true,
  'repeat Best Buy confirmation without a new time must dedupe against a handled prior row',
);

const duplicateConfirmOnly = inboxRecord({
  bodyText: `We're all set for your 20-minute appointment.

Confirmation Number: VQS327W2H`,
});
assert.equal(
  shouldSuppressDuplicateVendorAppointment({
    from: BESTBUY_FROM,
    subject: BESTBUY_SUBJECT,
    bodyText: duplicateConfirmOnly.bodyText,
    proposedMeetingStart: null,
    schedulingNote: duplicateConfirmOnly.schedulingNote,
    prior: priorHandled,
  }),
  true,
  'matching confirmation numbers must dedupe even when vendor keys differ in formatting',
);

const freshVendorRequest = inboxRecord({
  from: 'BestBuyInfo@emailinfo.bestbuy.com',
  bodyText: `We're all set for your 20-minute appointment.

Confirmation Number: NEW123456`,
});
assert.equal(
  shouldSuppressDuplicateVendorAppointment({
    from: freshVendorRequest.from,
    subject: freshVendorRequest.subject,
    bodyText: freshVendorRequest.bodyText,
    proposedMeetingStart: null,
    schedulingNote: freshVendorRequest.schedulingNote,
    prior: priorHandled,
  }),
  false,
  'a different confirmation number is a new appointment',
);

const pendingDuplicate = inboxRecord({
  id: 'em_vendor_pending',
  receivedAt: PRIOR_RECEIVED_AT,
  automationKind: 'meeting_request',
  automationAckAt: null,
  bookingUid: null,
});
assert.equal(
  shouldSuppressDuplicateVendorAppointment({
    from: BESTBUY_FROM,
    subject: BESTBUY_SUBJECT,
    bodyText: BESTBUY_BODY,
    proposedMeetingStart: null,
    schedulingNote: pendingDuplicate.schedulingNote,
    prior: pendingDuplicate,
  }),
  false,
  'still-pending prior rows stay on the dashboard for thread dedupe to handle',
);

assert.equal(
  isMeetingRequestPendingReview(inboxRecord()),
  true,
  'first vendor confirmation still needs review',
);
assert.equal(
  isMeetingRequestPendingReview(
    inboxRecord({
      automationAckAt: '2026-09-06T19:00:00.000Z',
    }),
  ),
  false,
  'acked vendor duplicates must leave the review queue',
);

assert.equal(
  await calendarAlreadyHasVendorAppointmentTime(null),
  false,
  'calendar dedupe requires a concrete proposed time',
);

console.log('ok: vendor appointment duplicate dedupe');
