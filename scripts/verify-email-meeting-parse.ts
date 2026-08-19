/**
 * Guard: inbound mail must not become a meeting from a date-only deadline,
 * an IP octet, or a street number. Clock time has to be in the email.
 * Run: npm run check:email-meeting
 */
import assert from 'node:assert/strict';
import {
  inboundHasClockTime,
  looksLikeMeetingIntent,
  parseAllClockTimes,
  parseExplicitMeetingDateTime,
  proposedMeetingTimeMatchesSource,
  resolveProposedMeetingStart,
  sanitizeInboundMeetingProposal,
} from '../src/lib/emailMeetingParse.ts';

const TELNYX_SUBJECT =
  'Correction: Updated Telnyx Voice Media IP Subnet — Action Required by August 29';

const TELNYX_BODY = `
We're reaching out with an important correction to our previous notification regarding the new media IP range for Telnyx Voice services.

Correct subnet: 103.115.247.0/24
Previously communicated: 103.115.247.128/25

We've scheduled a soft-launch phase.
On 26th August 2026, Telnyx will initiate a soft launch of the new range. During this time, approximately 10% of calls may be routed through the new range for a duration of 24 hours.
Starting 29th August 2026, the new IP range will be fully available for traffic.

Please complete these updates before 29th August 2026 to ensure uninterrupted service.

Team Telnyx
600 Congress Avenue 14th Floor Austin, TX 78701 USA
`;

const evidence = `${TELNYX_SUBJECT}\n${TELNYX_BODY}`;
const ref = new Date('2026-08-19T14:00:00.000Z');

assert.equal(parseAllClockTimes(TELNYX_BODY).length, 0, 'IP / street / 24 hours are not clock times');
assert.equal(inboundHasClockTime(evidence), false);
assert.equal(looksLikeMeetingIntent(evidence), false, '"scheduled a soft-launch" is not a meeting');
assert.equal(parseExplicitMeetingDateTime(TELNYX_BODY, ref), null);
assert.equal(
  resolveProposedMeetingStart({
    bodyText: TELNYX_BODY,
    summary: 'Telnyx corrected the media IP subnet to 103.115.247.0/24. Update firewalls before August 29, 2026.',
    receivedAt: ref.toISOString(),
  }),
  null,
  'deadline + IP in the same blob must not become a meeting datetime',
);

const invented = '2026-08-29T10:00:00.000Z'; // 6:00 AM Eastern
assert.equal(proposedMeetingTimeMatchesSource(invented, evidence), false);

const skipped = sanitizeInboundMeetingProposal({
  category: 'alert',
  proposedMeetingStart: invented,
  schedulingNote: 'August 29 at 6:00 AM',
  subject: TELNYX_SUBJECT,
  bodyText: TELNYX_BODY,
  receivedAt: ref.toISOString(),
});
assert.equal(skipped.proposedMeetingStart, null);
assert.ok(skipped.discardedReason);

const noIntent = sanitizeInboundMeetingProposal({
  category: 'client',
  proposedMeetingStart: invented,
  schedulingNote: 'August 29 at 6:00 AM',
  subject: TELNYX_SUBJECT,
  bodyText: TELNYX_BODY,
  receivedAt: ref.toISOString(),
});
assert.equal(noIntent.proposedMeetingStart, null);

assert.equal(
  looksLikeMeetingIntent(evidence) && inboundHasClockTime(evidence),
  false,
  'dashboard meeting banner requires intent AND a clock time in the email',
);

assert.equal(looksLikeMeetingIntent('Can we meet Tuesday at 2:00 PM?'), true);
assert.ok(inboundHasClockTime('Can we meet Tuesday at 2:00 PM?'));

const real = sanitizeInboundMeetingProposal({
  category: 'client',
  proposedMeetingStart: null,
  subject: 'Quick intro',
  bodyText: 'Can we meet Tuesday, August 25, 2026 at 2:00 PM?',
  receivedAt: ref.toISOString(),
});
assert.ok(real.proposedMeetingStart, 'real meeting with date + 2:00 PM should parse');
assert.equal(proposedMeetingTimeMatchesSource(real.proposedMeetingStart!, 'Can we meet Tuesday, August 25, 2026 at 2:00 PM?'), true);

const july = parseExplicitMeetingDateTime('Wednesday, July 22, 2026 at 2:00 PM', new Date('2026-07-01T12:00:00Z'));
assert.ok(july);

console.log('ok: email meeting parse does not invent times from alerts');
