/**
 * Official reΛVe.app public mailbox is get@reave.app.
 * Run: npm run check:reave-public-email
 */
import assert from 'node:assert/strict';
import {
  canonicalizeReaveBrandEmail,
  companyPublicEmail,
  defaultPublicEmailForDomain,
  isLegacyReavePublicEmail,
  isReaveAppHost,
  officialReavePublicEmailPatch,
  REAVE_PUBLIC_EMAIL,
} from '../src/lib/reavePublicEmail.ts';

assert.equal(REAVE_PUBLIC_EMAIL, 'get@reave.app');
assert.equal(isReaveAppHost('reave.app'), true);
assert.equal(isReaveAppHost('https://www.reave.app/'), true);
assert.equal(isReaveAppHost('demo.reave.app'), false);
assert.equal(isReaveAppHost('tonybarlettajr.com'), false);

assert.equal(canonicalizeReaveBrandEmail('hello@reave.app'), 'get@reave.app');
assert.equal(canonicalizeReaveBrandEmail('Support@reave.app'), 'get@reave.app');
assert.equal(canonicalizeReaveBrandEmail('reΛVe.app <info@reave.app>'), 'reΛVe.app <get@reave.app>');
assert.equal(canonicalizeReaveBrandEmail('mailto:contact@reave.app'), 'mailto:get@reave.app');
assert.equal(canonicalizeReaveBrandEmail('hi@reave.app'), 'get@reave.app');
assert.equal(canonicalizeReaveBrandEmail('team@reave.app'), 'get@reave.app');
assert.equal(canonicalizeReaveBrandEmail('thomas@reave.app'), 'thomas@reave.app');
assert.equal(canonicalizeReaveBrandEmail('noreply@reave.app'), 'noreply@reave.app');
assert.equal(canonicalizeReaveBrandEmail('get@reave.app'), 'get@reave.app');
assert.equal(canonicalizeReaveBrandEmail('hello@tonybarlettajr.com'), 'hello@tonybarlettajr.com');
assert.equal(canonicalizeReaveBrandEmail('sms-opt-in@reave.app'), 'sms-opt-in@reave.app');

assert.equal(defaultPublicEmailForDomain('reave.app'), 'get@reave.app');
assert.equal(defaultPublicEmailForDomain('reave.app', 'support'), 'get@reave.app');
assert.equal(defaultPublicEmailForDomain('tonybarlettajr.com'), 'hello@tonybarlettajr.com');
assert.equal(defaultPublicEmailForDomain('tonybarlettajr.com', 'support'), 'support@tonybarlettajr.com');

assert.equal(companyPublicEmail({ supportEmail: 'hello@reave.app', domain: 'reave.app' }), 'get@reave.app');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'reave.app' }), 'get@reave.app');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'reave.app' }, 'support'), 'get@reave.app');
assert.equal(
  companyPublicEmail({ supportEmail: 'service@shop.com', domain: 'shop.com' }),
  'service@shop.com',
);
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'shop.com' }), 'hello@shop.com');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'shop.com' }, 'support'), 'support@shop.com');

assert.equal(isLegacyReavePublicEmail('hello@reave.app'), true);
assert.equal(isLegacyReavePublicEmail('get@reave.app'), false);
assert.equal(isLegacyReavePublicEmail('thomas@reave.app'), false);
assert.equal(isLegacyReavePublicEmail(''), false);

assert.deepEqual(officialReavePublicEmailPatch({ supportEmail: 'hello@reave.app', fromEmail: 'noreply@reave.app' }), {
  supportEmail: 'get@reave.app',
});
assert.deepEqual(officialReavePublicEmailPatch({ supportEmail: '', fromEmail: 'support@reave.app' }), {
  supportEmail: 'get@reave.app',
  fromEmail: 'get@reave.app',
});
assert.equal(officialReavePublicEmailPatch({ supportEmail: 'get@reave.app', fromEmail: 'noreply@reave.app' }), null);

console.log('verify-reave-public-email: ok');
