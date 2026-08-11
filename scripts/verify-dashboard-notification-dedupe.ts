/**
 * Guard: one emailId must never yield two dashboard review banners.
 * Run: npm run check:notif-dedupe
 */
import assert from 'node:assert/strict';
import {
  dashboardNotificationRank,
  dedupeDashboardNotificationsByEmail,
} from '../src/lib/dashboardNotificationDedupe.ts';

const emailId = '11111111-1111-1111-1111-111111111111';

const triage = {
  id: 'alert-1',
  type: 'push_alert',
  alertKind: 'triage',
  tag: `triage-${emailId}`,
  emailId,
  title: 'Uncertain email — ask agent',
  receivedAt: '2026-08-10T12:00:00.000Z',
};

const meeting = {
  id: emailId,
  type: 'meeting_request',
  emailId,
  title: 'tom requested a meeting for August 11 at 1:00 AM.',
  receivedAt: '2026-08-10T12:00:00.000Z',
};

assert.ok(dashboardNotificationRank(triage) > dashboardNotificationRank(meeting));

const deduped = dedupeDashboardNotificationsByEmail([
  meeting,
  triage,
  { id: 'other', type: 'comment', emailId: undefined as string | undefined },
]);
assert.equal(deduped.length, 2);
assert.equal(
  deduped.find((n) => 'emailId' in n && n.emailId === emailId)?.type,
  'push_alert',
);
assert.ok(deduped.some((n) => n.type === 'comment'));

const meetingOnly = dedupeDashboardNotificationsByEmail([
  meeting,
  {
    id: 'alert-2',
    type: 'push_alert',
    alertKind: 'email',
    tag: emailId,
    emailId,
    title: 'Meeting request',
    receivedAt: '2026-08-10T12:00:00.000Z',
  },
]);
assert.equal(meetingOnly.length, 1);
assert.equal(meetingOnly[0]?.type, 'meeting_request');

console.log('ok: dashboard notification dedupe');
