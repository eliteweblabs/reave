/**
 * Guard: audit-ready notification excerpts must not dump chat button JSON.
 * Run: npm run check:notif-format
 */
import assert from 'node:assert/strict';
import {
  cleanNotificationExcerpt,
  formatAuditReadyNotification,
  normalizePushAlertCopy,
} from '../src/lib/notificationFormat.ts';

const buttonDump = [
  'Four Points needs a full site rebuild and listing cleanup.',
  '',
  '```json',
  '{ "type": "button", "label": "View Project", "href": "https://reave.app/admin?tab=work&slug=auditing-four-points-property-management" }',
  '```',
  '',
  '```json',
  '{ "type": "button", "label": "Client Portal", "href": "https://reave.app/c/f1259446-aaaa-bbbb-cccc-ddddeeeeffff" }',
  '```',
].join('\n');

const cleaned = cleanNotificationExcerpt(buttonDump);
assert.equal(cleaned.includes('```'), false);
assert.equal(cleaned.toLowerCase().includes('"type": "button"'), false);
assert.equal(cleaned.includes('View Project'), false);
assert.match(cleaned, /Four Points needs a full site rebuild/);

const formatted = formatAuditReadyNotification({
  tier: 'full',
  displayName: 'Four points Property Management',
  excerpt: buttonDump,
});
assert.equal(formatted.title, 'Full Audit Ready > Four points Property Management');
assert.equal(formatted.detail.includes('```'), false);
assert.equal(formatted.detail.includes('{'), false);
assert.match(formatted.detail, /Four Points needs a full site rebuild/);

const jsonOnly = formatAuditReadyNotification({
  tier: 'full',
  displayName: 'Four points Property Management',
  excerpt: '```json\n{ "type": "button", "label": "View Project", "href": "https://reave.app/admin?tab=work" }\n```',
});
assert.equal(jsonOnly.detail.includes('```'), false);
assert.equal(jsonOnly.detail.includes('View Project'), false);
assert.match(jsonOnly.detail, /Research finished/);

const stored = normalizePushAlertCopy({
  tag: 'siri-proposal-auditing-four-points-property-management',
  title: 'Full Audit Ready > Four points Property Management',
  detail: buttonDump,
  url: '/admin?tab=work&slug=auditing-four-points-property-management',
});
assert.equal(stored.detail.includes('```'), false);
assert.equal(stored.detail.includes('"type"'), false);
assert.match(stored.detail, /Four Points needs a full site rebuild/);

const truncatedFence = cleanNotificationExcerpt(
  '```json { "type": "button", "label": "View Project", "href": "https://reave.app/admin?tab=work&slug=auditing-four-points"',
);
assert.equal(truncatedFence.includes('```'), false);
assert.equal(truncatedFence.includes('View Project'), false);

console.log('ok: notification format strips chat button JSON');
