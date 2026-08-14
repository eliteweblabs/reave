/**
 * Guard: scheduled-email titles and template aliases stay human-readable.
 * Run: npm run check:newsletter-schedule
 */
import assert from 'node:assert/strict';
import {
  formatScheduledWhen,
  formatScheduledEmailTitle,
  groupScheduledSends,
  resolveNewsletterTemplateId,
} from '../src/lib/newsletterScheduleView.ts';
import type { ScheduledSendInput } from '../src/lib/newsletterScheduleView.ts';

function send(partial: Partial<ScheduledSendInput> & Pick<ScheduledSendInput, 'id' | 'templateId'>): ScheduledSendInput {
  return {
    source: 'manual',
    trigger: 'manual',
    contactUid: null,
    toEmail: 'abc@example.com',
    firstName: 'ABC',
    subject: '',
    status: 'pending',
    dueAt: '2026-08-16T14:00:00.000Z',
    jobSlug: null,
    context: {},
    campaignId: null,
    createdAt: '2026-08-14T12:00:00.000Z',
    ...partial,
  };
}

assert.equal(resolveNewsletterTemplateId('we value your opinion'), 'value_your_opinion');
assert.equal(resolveNewsletterTemplateId("We value your opinion"), 'value_your_opinion');
assert.equal(resolveNewsletterTemplateId('fall newsletter'), 'newsletter_update');
assert.equal(resolveNewsletterTemplateId('review_request'), 'review_request');

const now = new Date('2026-08-14T15:00:00.000Z');
const tomorrow = formatScheduledWhen('2026-08-15T14:00:00.000Z', now);
assert.match(tomorrow, /tomorrow|in /i);

const twoWeeks = formatScheduledWhen('2026-08-28T14:00:00.000Z', now);
assert.match(twoWeeks, /two weeks|14 days|in /i);

const opinion = formatScheduledEmailTitle({
  id: '1',
  kind: 'single',
  campaignId: null,
  sendIds: ['1'],
  templateId: 'value_your_opinion',
  templateLabel: 'We value your opinion',
  source: 'manual',
  subject: 'We value your opinion',
  toLabel: 'ABC',
  toEmail: 'abc@example.com',
  contactUid: 'uid',
  firstName: 'ABC',
  recipientCount: 1,
  dueAt: '2026-08-15T14:00:00.000Z',
  jobSlug: null,
  jobTitle: null,
}, now);
assert.match(opinion.title, /We value your opinion/i);
assert.match(opinion.title, /ABC/);

const complete = formatScheduledEmailTitle({
  id: '2',
  kind: 'single',
  campaignId: null,
  sendIds: ['2'],
  templateId: 'project_complete',
  templateLabel: 'Project complete follow-up',
  source: 'project_complete',
  subject: '',
  toLabel: 'Pat',
  toEmail: 'pat@example.com',
  contactUid: 'uid',
  firstName: 'Pat',
  recipientCount: 1,
  dueAt: '2026-08-28T14:00:00.000Z',
  jobSlug: 'abc',
  jobTitle: 'Project ABC',
}, now);
assert.match(complete.title, /Project ABC has been marked completed/i);
assert.match(complete.title, /follow-up email will be sent/i);

const broadcast = formatScheduledEmailTitle({
  id: 'camp-1',
  kind: 'broadcast',
  campaignId: 'camp-1',
  sendIds: ['a', 'b'],
  templateId: 'newsletter_update',
  templateLabel: 'Newsletter / roundup',
  source: 'broadcast',
  subject: 'Fall Newsletter',
  toLabel: '2 contacts',
  toEmail: null,
  contactUid: null,
  firstName: '',
  recipientCount: 2,
  dueAt: '2026-08-16T14:00:00.000Z',
  jobSlug: null,
  jobTitle: null,
}, now);
assert.match(broadcast.title, /Newsletter/i);
assert.equal(broadcast.reviewPrompt, true);

const grouped = groupScheduledSends(
  [
    send({
      id: 'a',
      templateId: 'newsletter_update',
      source: 'broadcast',
      trigger: 'broadcast',
      campaignId: 'fall-1',
      firstName: 'Pat',
      toEmail: 'pat@example.com',
    }),
    send({
      id: 'b',
      templateId: 'newsletter_update',
      source: 'broadcast',
      trigger: 'broadcast',
      campaignId: 'fall-1',
      firstName: 'Sam',
      toEmail: 'sam@example.com',
    }),
    send({
      id: 'c',
      templateId: 'value_your_opinion',
      source: 'manual',
      firstName: 'ABC',
    }),
  ],
  now,
);
assert.equal(grouped.length, 2);
const bcast = grouped.find((g) => g.kind === 'broadcast');
assert.ok(bcast);
assert.equal(bcast?.recipientCount, 2);
assert.deepEqual(bcast?.sendIds.sort(), ['a', 'b']);

console.log('verify-newsletter-schedule: ok');
