import assert from 'node:assert/strict';
import {
  CANONICAL_PUBLIC_BRAND_DOMAIN,
  isLegacyReavePublicHost,
  mapLegacyReaveHostToRekko,
} from '../src/lib/legacyBrandDomain.ts';

assert.equal(mapLegacyReaveHostToRekko('reave.app'), CANONICAL_PUBLIC_BRAND_DOMAIN);
assert.equal(mapLegacyReaveHostToRekko('www.reave.app'), 'www.rekko.studio');
assert.equal(mapLegacyReaveHostToRekko('demo.reave.app'), 'demo.rekko.studio');
assert.equal(mapLegacyReaveHostToRekko('reave.app.'), CANONICAL_PUBLIC_BRAND_DOMAIN);
assert.equal(mapLegacyReaveHostToRekko('rekko.studio'), null);
assert.equal(mapLegacyReaveHostToRekko('thebarbersedge.com'), null);

assert.equal(isLegacyReavePublicHost('reave.app'), true);
assert.equal(isLegacyReavePublicHost('cal.reave.app'), true);
assert.equal(isLegacyReavePublicHost('rekko.studio'), false);

console.log('verify-legacy-brand-domain: ok');
