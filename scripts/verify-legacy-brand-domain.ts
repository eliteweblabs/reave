import assert from 'node:assert/strict';
import {
  CANONICAL_PUBLIC_BRAND_DOMAIN,
  clerkProxyApexHost,
  isLegacyReavePublicHost,
  mapLegacyReaveHostToRekko,
} from '../src/lib/legacyBrandDomain.ts';
import { isReaveMarketingHost } from '../src/lib/requestHost.ts';

assert.equal(mapLegacyReaveHostToRekko('reave.app'), CANONICAL_PUBLIC_BRAND_DOMAIN);
assert.equal(mapLegacyReaveHostToRekko('www.reave.app'), 'www.rekko.studio');
assert.equal(mapLegacyReaveHostToRekko('demo.reave.app'), 'demo.rekko.studio');
assert.equal(mapLegacyReaveHostToRekko('reave.app.'), CANONICAL_PUBLIC_BRAND_DOMAIN);
assert.equal(mapLegacyReaveHostToRekko('rekko.studio'), null);
assert.equal(mapLegacyReaveHostToRekko('thebarbersedge.com'), null);

assert.equal(isLegacyReavePublicHost('reave.app'), true);
assert.equal(isLegacyReavePublicHost('cal.reave.app'), true);
assert.equal(isLegacyReavePublicHost('rekko.studio'), false);

assert.equal(isReaveMarketingHost('rekko.studio'), true);
assert.equal(clerkProxyApexHost('reave.app'), 'rekko.studio');
assert.equal(clerkProxyApexHost('www.reave.app'), 'rekko.studio');
assert.equal(clerkProxyApexHost('life-saving.reave.app'), 'life-saving.reave.app');
assert.equal(clerkProxyApexHost('rekko.studio'), 'rekko.studio');
assert.equal(isReaveMarketingHost('reave.app'), true);
assert.equal(isReaveMarketingHost('thebarbersedge.com'), false);

console.log('verify-legacy-brand-domain: ok');
