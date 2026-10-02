/**
 * Official public mailbox is get@rekko.studio (legacy reave.app aliases fold here).
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
  migrateOfficialOutboundFromEmail,
  REAVE_PUBLIC_EMAIL,
} from '../src/lib/reavePublicEmail.ts';

assert.equal(REAVE_PUBLIC_EMAIL, 'get@rekko.studio');
assert.equal(isReaveAppHost('reave.app'), true);
assert.equal(isReaveAppHost('rekko.studio'), true);
assert.equal(isReaveAppHost('https://www.reave.app/'), true);
assert.equal(isReaveAppHost('demo.reave.app'), false);
assert.equal(isReaveAppHost('tonybarlettajr.com'), false);

assert.equal(canonicalizeReaveBrandEmail('hello@reave.app'), 'get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('Support@reave.app'), 'get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('reave.app <info@reave.app>'), 'reave.app <get@rekko.studio>');
assert.equal(canonicalizeReaveBrandEmail('mailto:contact@reave.app'), 'mailto:get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('hi@reave.app'), 'get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('team@reave.app'), 'get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('thomas@reave.app'), 'thomas@reave.app');
assert.equal(canonicalizeReaveBrandEmail('noreply@reave.app'), 'noreply@reave.app');
assert.equal(canonicalizeReaveBrandEmail('get@reave.app'), 'get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('get@rekko.studio'), 'get@rekko.studio');
assert.equal(canonicalizeReaveBrandEmail('hello@tonybarlettajr.com'), 'hello@tonybarlettajr.com');
assert.equal(canonicalizeReaveBrandEmail('sms-opt-in@reave.app'), 'sms-opt-in@reave.app');

assert.equal(defaultPublicEmailForDomain('reave.app'), 'get@rekko.studio');
assert.equal(defaultPublicEmailForDomain('rekko.studio'), 'get@rekko.studio');
assert.equal(defaultPublicEmailForDomain('reave.app', 'support'), 'get@rekko.studio');
assert.equal(defaultPublicEmailForDomain('tonybarlettajr.com'), 'hello@tonybarlettajr.com');
assert.equal(defaultPublicEmailForDomain('tonybarlettajr.com', 'support'), 'support@tonybarlettajr.com');

assert.equal(companyPublicEmail({ supportEmail: 'hello@reave.app', domain: 'reave.app' }), 'get@rekko.studio');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'reave.app' }), 'get@rekko.studio');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'rekko.studio' }), 'get@rekko.studio');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'reave.app' }, 'support'), 'get@rekko.studio');
assert.equal(
  companyPublicEmail({ supportEmail: 'service@shop.com', domain: 'shop.com' }),
  'service@shop.com',
);
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'shop.com' }), 'hello@shop.com');
assert.equal(companyPublicEmail({ supportEmail: '', domain: 'shop.com' }, 'support'), 'support@shop.com');

assert.equal(isLegacyReavePublicEmail('hello@reave.app'), true);
assert.equal(isLegacyReavePublicEmail('get@reave.app'), true);
assert.equal(isLegacyReavePublicEmail('get@rekko.studio'), false);
assert.equal(isLegacyReavePublicEmail('thomas@reave.app'), false);
assert.equal(isLegacyReavePublicEmail(''), false);

assert.deepEqual(officialReavePublicEmailPatch({ supportEmail: 'hello@reave.app', fromEmail: 'noreply@reave.app' }), {
  supportEmail: 'get@rekko.studio',
  fromEmail: 'noreply@rekko.studio',
});
assert.deepEqual(officialReavePublicEmailPatch({ supportEmail: '', fromEmail: 'support@reave.app' }), {
  supportEmail: 'get@rekko.studio',
  fromEmail: 'get@rekko.studio',
});
assert.deepEqual(officialReavePublicEmailPatch({ supportEmail: 'get@reave.app', fromEmail: 'noreply@reave.app' }), {
  supportEmail: 'get@rekko.studio',
  fromEmail: 'noreply@rekko.studio',
});

assert.equal(
  migrateOfficialOutboundFromEmail('noreply@inbound.reave.app'),
  'noreply@inbound.rekko.studio',
);
assert.equal(
  migrateOfficialOutboundFromEmail('REΛVE Automation <noreply@inbound.reave.app>'),
  'REΛVE Automation <noreply@inbound.rekko.studio>',
);
assert.deepEqual(officialReavePublicEmailPatch({ supportEmail: 'get@rekko.studio', fromEmail: 'noreply@inbound.reave.app' }), {
  fromEmail: 'noreply@inbound.rekko.studio',
});
assert.deepEqual(
  officialReavePublicEmailPatch({
    domain: 'reave.app',
    supportEmail: 'get@rekko.studio',
    fromEmail: 'noreply@inbound.rekko.studio',
  }),
  { domain: 'rekko.studio' },
);

console.log('verify-reave-public-email: ok');
