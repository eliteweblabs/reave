/**
 * Guard: an inbound appointment/meeting email must reach the owner on both
 * surfaces (dashboard banner + phone push) no matter which triage path ran,
 * and confirming it must archive the message.
 *
 * The Apple "carry-in appointment scheduled" case: no keyword rule matched, so
 * the AI branches that used to be the only place a meeting time was parsed
 * never ran. The row landed in the inbox with a meeting card but no
 * notification anywhere.
 *
 * Run: npm run check:email-meeting-notify
 */
import assert from 'node:assert/strict';
import {
  archiveEmailInboxPatch,
  isEmailInboxActive,
  isEmailInboxRouted,
  type EmailInboxRecord,
} from '../src/lib/emailInboxStore.ts';
import {
  isMeetingAutomationKind,
  isMeetingRequestPendingReview,
  isPendingReviewNotification,
} from '../src/lib/emailReviewPending.ts';
import {
  inboundStatesMeetingDate,
  looksLikeConfirmedAppointment,
  sanitizeInboundMeetingProposal,
} from '../src/lib/emailMeetingParse.ts';
import { shouldSendInboxPush } from '../src/lib/emailNotifyPolicy.ts';

const RECEIVED_AT = '2026-08-29T15:17:22.000Z';

const APPLE_SUBJECT = 'Your carry-in appointment at Best Buy - Danvers has been scheduled.';
const APPLE_BODY = `Appointment scheduled

Your appointment is confirmed. Please arrive a few minutes early and bring your device.

Sunday, August 30, 2026 at 2:30 PM
Best Buy - Danvers
230 Independence Way, Danvers, MA

Need to make a change? Reschedule or cancel from the link in this email.`;

function inboxRecord(patch: Partial<EmailInboxRecord> = {}): EmailInboxRecord {
  return {
    id: 'em_apple_1',
    receivedAt: RECEIVED_AT,
    from: 'Apple Support <AppleSupport@email.apple.com>',
    subject: APPLE_SUBJECT,
    bodySnippet: APPLE_BODY.slice(0, 200),
    bodyText: APPLE_BODY,
    bodyHtml: '',
    to: ['apple@reave.app'],
    cc: [],
    bcc: [],
    replyTo: [],
    headers: {},
    messageId: '<apple-1@email.apple.com>',
    resendEmailId: '',
    attachments: [],
    status: 'UNMATCHED',
    action: 'classified',
    notified: false,
    summary: 'Apple scheduled a carry-in appointment at Best Buy - Danvers.',
    category: 'review',
    contactUid: null,
    contactName: null,
    jobSlug: null,
    jobTitle: null,
    routeNote: '',
    classificationAudit: [],
    proposedMeetingStart: null,
    schedulingNote: '',
    bookingUid: null,
    bookingStart: null,
    seenAt: null,
    automationAckAt: null,
    automationTriageAt: null,
    automationTriageAction: null,
    automationTriageRuleId: null,
    automationKind: null,
    verificationCode: null,
    actionUrl: null,
    deleteAfterAt: null,
    ...patch,
  };
}

// 1. The appointment time is in the body — recover it without any AI proposal.
const recovered = sanitizeInboundMeetingProposal({
  category: 'review',
  proposedMeetingStart: null,
  schedulingNote: '',
  subject: APPLE_SUBJECT,
  bodyText: APPLE_BODY,
  receivedAt: RECEIVED_AT,
});
assert.ok(
  recovered.proposedMeetingStart,
  'appointment language + "2:30 PM" on a stated date must resolve a meeting time',
);
assert.equal(
  inboundStatesMeetingDate(`${APPLE_SUBJECT}\n${APPLE_BODY}`),
  true,
  'the recovery path requires a named day — this email has one',
);
assert.equal(
  inboundStatesMeetingDate('Join our product Zoom at 2pm ET — seats are limited.'),
  false,
  'a bare clock time in a promo blast must not become an appointment',
);

// 2. The unnotified shape from before the fix: no stored time, no automation.
const silent = inboxRecord();
assert.equal(
  isMeetingRequestPendingReview(silent),
  false,
  'without a stored meeting time there is nothing for the dashboard to render',
);
assert.equal(
  shouldSendInboxPush({
    category: silent.category,
    action: silent.action,
    ruleNotify: false,
    ruleStatus: silent.status,
    automationKind: silent.automationKind,
  }),
  false,
  'unmatched mail with no automation stays silent — that was the bug',
);

// 3. After the fix the row carries the recovered time plus a meeting automation.
const notified = inboxRecord({
  action: 'review',
  automationKind: 'meeting_request',
  proposedMeetingStart: recovered.proposedMeetingStart,
  routeNote: 'Meeting request needs your review',
});

assert.equal(isMeetingRequestPendingReview(notified), true, 'dashboard banner must be pending');
assert.equal(isPendingReviewNotification(notified), true, 'and must count toward the badge');

assert.equal(
  shouldSendInboxPush({
    category: notified.category,
    action: notified.action,
    ruleNotify: false,
    ruleStatus: notified.status,
    automationKind: notified.automationKind,
  }),
  true,
  'a meeting automation always earns a push',
);
assert.equal(
  isMeetingAutomationKind(notified.automationKind),
  true,
  'meeting kinds force the notify channel open when no rule matched',
);
for (const kind of ['meeting_booked', 'meeting_conflict', 'meeting_followup']) {
  assert.equal(isMeetingAutomationKind(kind), true, `${kind} must notify`);
}
for (const kind of [null, '', 'project_created', 'project_match_suggested']) {
  assert.equal(isMeetingAutomationKind(kind), false, `${String(kind)} is not a meeting kind`);
}

// 4. Junk / DELETE still wins over the meeting push — notifications stay silent.
assert.equal(
  shouldSendInboxPush({
    category: 'junk',
    action: 'junk',
    ruleNotify: true,
    ruleStatus: 'JUNK',
    automationKind: 'meeting_request',
  }),
  false,
  'junk must never notify, meeting automation or not',
);

// 5. Confirming archives: filed + FILED, out of Review, off the dashboard.
const patch = archiveEmailInboxPatch(notified.category);
assert.equal(patch.action, 'filed');
assert.equal(patch.status, 'FILED');
assert.equal(patch.category, 'internal', 'review mail must leave the Review bucket on archive');
assert.equal(archiveEmailInboxPatch('junk').category, 'internal');
assert.equal(archiveEmailInboxPatch('client').category, undefined, 'client mail keeps its category');

const confirmed = inboxRecord({
  ...notified,
  ...patch,
  category: 'internal',
  automationAckAt: '2026-08-29T18:30:00.000Z',
  automationTriageAt: '2026-08-29T18:30:00.000Z',
  automationTriageAction: 'accepted',
  bookingUid: 'bk_123',
  bookingStart: recovered.proposedMeetingStart,
});
assert.equal(isEmailInboxRouted(confirmed), true, 'confirmed meeting mail belongs in Archive');
assert.equal(isEmailInboxActive(confirmed), false, 'and must be gone from the open inbox');
assert.equal(
  isPendingReviewNotification(confirmed),
  false,
  'confirmed meeting must clear the dashboard banner',
);

// 7. An uncertain classification keeps the single Explain card — no Confirm.
assert.equal(
  isMeetingRequestPendingReview(inboxRecord({ ...notified, action: 'needs_explain' })),
  false,
  'needs_explain owns the dashboard slot',
);

// 6. Regression: a vendor deadline notice is still not a meeting.
const telnyx = sanitizeInboundMeetingProposal({
  category: 'alert',
  proposedMeetingStart: null,
  schedulingNote: '',
  subject: 'Updated Telnyx Voice Media IP Subnet — Action Required by August 29',
  bodyText:
    'We have scheduled a soft-launch phase. Correct subnet: 103.115.247.0/24. ' +
    'Please complete these updates before 29th August 2026.\n600 Congress Avenue, Austin, TX',
  receivedAt: RECEIVED_AT,
});
assert.equal(telnyx.proposedMeetingStart, null, 'deadlines and IP octets are not appointments');

// 8. Best Buy-style confirmation — appointment language but no parseable date/time in body.
const BESTBUY_SUBJECT = 'Your appointment is scheduled.';
const BESTBUY_BODY = `We're all set for your 20-minute appointment. Check in at the Geek Squad Service Desk five minutes early.

Confirmation Number: VQS327W2H`;

const bestBuy = sanitizeInboundMeetingProposal({
  category: 'review',
  proposedMeetingStart: null,
  schedulingNote: '',
  subject: BESTBUY_SUBJECT,
  bodyText: BESTBUY_BODY,
  receivedAt: RECEIVED_AT,
});
assert.equal(
  looksLikeConfirmedAppointment(`${BESTBUY_SUBJECT}\n${BESTBUY_BODY}`),
  true,
  'Best Buy "your appointment is scheduled" must read as confirmed',
);
assert.equal(
  bestBuy.proposedMeetingStart,
  null,
  'no invented time when the vendor omits date/time from the body',
);
assert.ok(
  bestBuy.schedulingNote.includes('Best Buy'),
  'confirmed appointment without time still earns a scheduling note',
);

const bestBuyNotified = inboxRecord({
  from: 'BestBuyInfo@emailinfo.bestbuy.com',
  subject: BESTBUY_SUBJECT,
  bodyText: BESTBUY_BODY,
  bodySnippet: BESTBUY_BODY.slice(0, 200),
  summary: 'Best Buy Geek Squad appointment scheduled.',
  action: 'review',
  automationKind: 'meeting_request',
  proposedMeetingStart: null,
  schedulingNote: bestBuy.schedulingNote,
  routeNote: 'Meeting request needs your review',
});
assert.equal(
  isMeetingRequestPendingReview(bestBuyNotified),
  true,
  'Best Buy confirmation must surface a dashboard meeting card',
);
assert.equal(
  shouldSendInboxPush({
    category: bestBuyNotified.category,
    action: bestBuyNotified.action,
    ruleNotify: false,
    ruleStatus: bestBuyNotified.status,
    automationKind: bestBuyNotified.automationKind,
  }),
  true,
  'confirmed appointment must notify even when no keyword rule matched',
);

console.log('ok: inbound meetings notify the dashboard and phone, and archive on confirm');
