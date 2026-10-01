/**
 * Run: npm run check:email-from-format
 */
import assert from 'node:assert/strict';
import { formatSenderEmail, normalizeResendFromHeader, parseSenderEmail } from '../src/lib/emailAddress.ts';

assert.equal(
  formatSenderEmail('re>I<o studio', 'noreply@inbound.rekko.studio'),
  '"re>I<o studio" <noreply@inbound.rekko.studio>',
);
assert.equal(parseSenderEmail('"re>I<o studio" <noreply@inbound.rekko.studio>'), 'noreply@inbound.rekko.studio');
assert.equal(
  normalizeResendFromHeader('re>I<o studio <noreply@inbound.rekko.studio>'),
  '"re>I<o studio" <noreply@inbound.rekko.studio>',
);
assert.equal(normalizeResendFromHeader('Plain Co <hello@example.com>'), 'Plain Co <hello@example.com>');

console.log('verify-email-from-format: ok');
