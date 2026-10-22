/**
 * Run: npm run check:email-from-format
 */
import assert from 'node:assert/strict';
import {
  formatSenderEmail,
  normalizeResendFromHeader,
  parseSenderEmail,
  resendSafeDisplayName,
} from '../src/lib/emailAddress.ts';

assert.equal(resendSafeDisplayName('re>I<o studio'), 'Rekko Studio');
assert.equal(resendSafeDisplayName('Rekko Studio'), 'Rekko Studio');
assert.equal(
  formatSenderEmail('Rekko Studio', 'noreply@inbound.rekko.studio'),
  'Rekko Studio <noreply@inbound.rekko.studio>',
);
assert.equal(parseSenderEmail('Rekko Studio <noreply@inbound.rekko.studio>'), 'noreply@inbound.rekko.studio');
assert.equal(
  normalizeResendFromHeader('re>I<o studio <noreply@inbound.rekko.studio>'),
  'Rekko Studio <noreply@inbound.rekko.studio>',
);
assert.equal(normalizeResendFromHeader('Plain Co <hello@example.com>'), 'Plain Co <hello@example.com>');

console.log('verify-email-from-format: ok');
