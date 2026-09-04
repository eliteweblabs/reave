/**
 * Guard: Sites fleet search indexing helpers.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-site-search-indexing.ts
 */
import assert from 'node:assert/strict';
import {
  inferSearchEnginesBlockedFromHealth,
  normalizeSiteSearchIndexingSiteId,
  searchEnginesBlockedFromSeoProbe,
} from '../src/lib/siteSearchIndexing.ts';
import type { SiteHealthSummary } from '../src/lib/siteHealthScore.ts';

assert.equal(normalizeSiteSearchIndexingSiteId('https://www.example.com/'), 'example.com');

assert.equal(
  searchEnginesBlockedFromSeoProbe({
    robots_txt: { blocks_all: false },
    page: { meta_robots: 'noindex, nofollow' },
  }),
  true,
);

assert.equal(
  searchEnginesBlockedFromSeoProbe({
    robots_txt: { blocks_all: true },
    page: { meta_robots: '' },
  }),
  true,
);

const health: SiteHealthSummary = {
  grade: 'B',
  score: 82,
  criticalCount: 0,
  issues: [],
  checkedAt: Date.now(),
  searchEnginesBlocked: false,
  wpConnectAvailable: true,
};
assert.equal(inferSearchEnginesBlockedFromHealth(health), false);

console.log('ok — site search indexing helpers');
