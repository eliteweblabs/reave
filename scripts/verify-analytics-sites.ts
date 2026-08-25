/**
 * Guard: Plausible site hostname + tracker HTML detection.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-analytics-sites.ts
 */
import assert from 'node:assert/strict';
import { hostnameFromWebsite, htmlHasPlausibleScript } from '../src/lib/plausibleClient.ts';

assert.equal(hostnameFromWebsite('https://www.thebarbersedge.com/barbers'), 'thebarbersedge.com');
assert.equal(hostnameFromWebsite('thebarbersedge.com'), 'thebarbersedge.com');
assert.equal(hostnameFromWebsite('https://reave.app'), 'reave.app');
assert.equal(hostnameFromWebsite(''), '');

const beScript =
  '<script defer data-domain="thebarbersedge.com" src="https://plausible-analytics-ce-production-6fd8.up.railway.app/js/script.file-downloads.hash.outbound-links.js"></script>';
assert.equal(htmlHasPlausibleScript(beScript, 'thebarbersedge.com'), true);
assert.equal(htmlHasPlausibleScript(beScript, 'www.thebarbersedge.com'), true);
assert.equal(htmlHasPlausibleScript('<html></html>', 'thebarbersedge.com'), false);
assert.equal(
  htmlHasPlausibleScript(
    '<script data-domain="reave.app" src="https://example.com/js/script.js"></script>',
    'thebarbersedge.com',
  ),
  false,
);

console.log('verify-analytics-sites: ok');
