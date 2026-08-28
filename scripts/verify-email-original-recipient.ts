/**
 * Original mailbox display for forwarded inbound mail.
 * Run: npm run check:email-original-recipient
 */
import assert from 'node:assert/strict';
import {
  displayInboxRecipients,
  hasOriginalRecipientHeaders,
  isGenericInboundMailbox,
  isInboundReceivingHost,
} from '../src/lib/emailOriginalRecipient.ts';
import {
  attachClassificationRuleLinks,
  extractForwardedToFromAudit,
  primaryClassificationRule,
  resolveForwardedTo,
} from '../src/lib/emailClassificationAudit.ts';

assert.equal(isInboundReceivingHost('inbound.reave.app'), true);
assert.equal(isInboundReceivingHost('inbound.tonybarlettajr.com'), true);
assert.equal(isInboundReceivingHost('reave.app'), false);
assert.equal(isGenericInboundMailbox('thomas@inbound.reave.app'), true);
assert.equal(isGenericInboundMailbox('inbox@inbound.reave.app'), true);
assert.equal(isGenericInboundMailbox('thomas+gmail@inbound.reave.app'), false);
assert.equal(isGenericInboundMailbox('thomas@reave.app'), false);

assert.deepEqual(
  displayInboxRecipients(['thomas@inbound.reave.app'], {
    'X-Forwarded-For': 'thomas@reave.app',
    'X-Forwarded-To': 'thomas@inbound.reave.app',
  }),
  ['thomas@reave.app'],
);

assert.deepEqual(
  displayInboxRecipients(['thomas@inbound.reave.app'], {
    'X-Forwarded-For': '10.1.2.3',
    To: 'Thomas <hello@reave.app>',
  }),
  ['hello@reave.app'],
);

assert.deepEqual(
  displayInboxRecipients(['thomas@inbound.reave.app'], {
    'X-Original-To': 'personal@gmail.com',
  }),
  ['personal@gmail.com'],
);

assert.deepEqual(
  displayInboxRecipients(['thomas@inbound.reave.app'], {
    'Original-Recipient': 'rfc822;work@proton.me',
  }),
  ['work@proton.me'],
);

assert.deepEqual(
  displayInboxRecipients(['thomas+gmail@inbound.reave.app'], {}),
  ['thomas+gmail@inbound.reave.app'],
);

assert.deepEqual(
  displayInboxRecipients(['thomas@inbound.reave.app'], {}),
  ['thomas@inbound.reave.app'],
);

assert.equal(
  hasOriginalRecipientHeaders({ 'X-Forwarded-For': 'thomas@reave.app' }),
  true,
);
assert.equal(hasOriginalRecipientHeaders({ 'X-Forwarded-For': '10.0.0.1' }), false);

const shipmentRule = {
  id: 'ship-1',
  status: 'AUTO_ARCHIVED',
  title: 'Shipment tracked',
  phrases: ['shipment tracking', 'shipment tracked'],
  description: 'Shipment tracked — package/order shipping notices.',
};
const linked = attachClassificationRuleLinks(
  [
    { step: 'contact', decision: 'Unknown sender', detail: 'Not in Contacts' },
    {
      step: 'ai',
      decision: 'Trusted AI label: junk',
      detail: '95% confidence · Delivery update',
    },
  ],
  [shipmentRule],
  { routeNote: 'Shipment tracking / delivery update — classified as junk per rules (never receipt for shipping notices).' },
);
assert.equal(linked[0].ruleId, undefined);
assert.equal(linked[1].ruleId, 'ship-1');
assert.deepEqual(primaryClassificationRule(linked), {
  ruleId: 'ship-1',
  ruleTitle: 'Shipment tracked',
});

assert.equal(
  extractForwardedToFromAudit([
    { step: 'forward', decision: 'Forwarded to jk@capcofire.com', detail: 'Relayed via Resend' },
  ]),
  'jk@capcofire.com',
);
assert.equal(
  extractForwardedToFromAudit([
    { step: 'forward', decision: 'Would forward to ops@example.com', detail: 'Dry-run' },
  ]),
  'ops@example.com',
);
assert.equal(
  extractForwardedToFromAudit([
    { step: 'forward', decision: 'Forward to broken@example.com failed', detail: 'Resend forward failed' },
  ]),
  null,
);
assert.equal(
  resolveForwardedTo({
    steps: [{ step: 'rules', decision: 'Matched DELETE rule' }],
    rules: [{ id: 'flex-1', title: 'Flexcar marketing emails', forwardTo: 'who@where.com' }],
    matchedRuleId: 'flex-1',
  }),
  'who@where.com',
);
assert.equal(
  resolveForwardedTo({
    steps: [{ step: 'forward', decision: 'Forwarded to audit@example.com' }],
    rules: [{ id: 'flex-1', forwardTo: 'rule@example.com' }],
    matchedRuleId: 'flex-1',
  }),
  'audit@example.com',
);

console.log('verify-email-original-recipient: ok');
