/**
 * Guard: shared Resend accounts must not ingest another install's inbound mail.
 * Run: npm run check:inbound-install
 */
import assert from 'node:assert/strict';
import {
  addressBelongsToInstall,
  inboundBelongsToInstall,
  inboundMailboxExample,
  installEmailDomains,
  normalizeEmailHostname,
  recipientList,
} from '../src/lib/inboundEmailInstall.ts';

assert.equal(normalizeEmailHostname('https://www.TonyBarlettaJr.com/'), 'tonybarlettajr.com');
assert.equal(inboundMailboxExample('tonybarlettajr.com'), 'inbox@inbound.tonybarlettajr.com');

const tony = installEmailDomains({
  COMPANY_DOMAIN: 'tonybarlettajr.com',
  PUBLIC_SITE_DOMAIN: 'tonybarlettajr.com',
});
assert.deepEqual(tony, ['tonybarlettajr.com']);

assert.equal(addressBelongsToInstall('inbox@inbound.tonybarlettajr.com', tony), true);
assert.equal(addressBelongsToInstall('Tony Barletta <tony@tonybarlettajr.com>', tony), true);
assert.equal(addressBelongsToInstall('inbox@inbound.reave.app', tony), false);
assert.equal(addressBelongsToInstall('thomas@reave.app', tony), false);

assert.equal(
  inboundBelongsToInstall(['inbox@inbound.reave.app'], { domains: tony, requireRecipient: true }),
  false,
);
assert.equal(
  inboundBelongsToInstall(['inbox@inbound.tonybarlettajr.com'], { domains: tony }),
  true,
);
assert.equal(inboundBelongsToInstall([], { domains: tony, requireRecipient: false }), true);
assert.equal(inboundBelongsToInstall([], { domains: tony, requireRecipient: true }), false);
assert.equal(inboundBelongsToInstall(['inbox@inbound.reave.app'], { domains: [] }), true);
assert.equal(
  inboundBelongsToInstall(['inbox@inbound.reave.app'], {
    domains: [],
    env: { RAILWAY_ENVIRONMENT: 'production' },
  }),
  false,
);

const reaveFromFallback = installEmailDomains({
  INSTALL_CONFIG: 'reave',
  PUBLIC_SITE_URL: 'https://reave.app',
  RAILWAY_PUBLIC_DOMAIN: 'reave.app',
});
assert.deepEqual(reaveFromFallback, ['reave.app']);
assert.equal(
  inboundBelongsToInstall(['inbox@inbound.tonybarlettajr.com'], { domains: reaveFromFallback }),
  false,
);
assert.deepEqual(
  installEmailDomains({
    RAILWAY_PUBLIC_DOMAIN: 'astro.up.railway.app',
    INSTALL_CONFIG: 'reave',
  }),
  ['reave.app'],
);

assert.deepEqual(
  recipientList(['a@x.com'], 'b@x.com', undefined, ['c@x.com']),
  ['a@x.com', 'b@x.com', 'c@x.com'],
);

console.log('verify-inbound-install: ok');
