/**
 * Quick checks for portal Overview HTML rendering + vendor fragmentation.
 */
import assert from 'node:assert/strict';
import { portalRichText, stripPortalHtml } from '../src/lib/portalRichText.ts';
import { analyzeVendorFragmentation } from '../src/lib/vendorFragmentation.ts';

const htmlBody =
  "The ownership group, consisting of <strong>Finbar Griffin and Mick Morgan</strong>, now owns three locations. Proprietor of <strong>Mick Morgan</strong>&#x27;s pub.";

const rendered = portalRichText(htmlBody);
assert.match(rendered, /<strong>Finbar Griffin and Mick Morgan<\/strong>/);
assert.doesNotMatch(rendered, /&lt;strong&gt;/);
assert.match(rendered, /&#x27;s pub/);
assert.doesNotMatch(rendered, /&amp;#x27;/);

const plain = portalRichText('Visit https://example.com today.');
assert.match(plain, /<a href="https:\/\/example.com"/);

assert.equal(
  stripPortalHtml('<strong>Mick</strong>&#x27;s'),
  "Mick's",
);

const frag = analyzeVendorFragmentation(
  [
    { text: 'DoorDash', href: 'https://www.doordash.com/store/x' },
    { text: 'Uber Eats', href: 'https://www.ubereats.com/store/x' },
    { text: 'Grubhub', href: 'https://www.grubhub.com/restaurant/x' },
    { text: 'Pick-up order', href: 'https://www.restaurantsignin.com/ordering/?restaurant_uid=abc' },
    { text: 'Shop', href: 'https://mickmorgans.myshopify.com/' },
  ],
  'https://mickmorganssharon.com',
);
assert.equal(frag.fragmentedOrdering, true);
assert.equal(frag.score, 'fail');
assert.ok(frag.deliveryMarketplaces.includes('DoorDash'));
assert.ok(frag.hasPickupVendor);
assert.ok(frag.hasShopify);

console.log('verify-portal-rich-text: ok');
