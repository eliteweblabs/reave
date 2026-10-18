/**
 * Search keyword merge — company aliases prepend per-page lists.
 * Run: npx tsx scripts/verify-search-keywords.ts
 */
import assert from 'node:assert/strict';
import {
  deriveAutoPageSearchKeywords,
  mergeSearchKeywordLists,
  parseSearchKeywordLines,
  resolvePageSearchKeywords,
} from '../src/lib/searchKeywords.ts';
import type { SiteLandingConfig } from '../src/lib/siteContent.ts';

assert.deepEqual(parseSearchKeywordLines('House Cleaning\nmaid service\n'), [
  'House Cleaning',
  'maid service',
]);

assert.deepEqual(
  mergeSearchKeywordLists(['maid service'], ['house cleaning', 'maid service']),
  ['maid service', 'house cleaning'],
);

const landing: SiteLandingConfig = {
  name: 'lux cleaning',
  heroHeadline: 'Book premium home cleaning online.',
  services: {
    heading: 'Services',
    items: [{ label: 'Deep clean' }, 'Move-out clean'],
  },
  areas: { heading: 'Area', cities: ['Worcester'] },
};

const company = {
  name: 'lux cleaning',
  searchKeywords: ['house cleaning', 'maid service'],
};

const merged = resolvePageSearchKeywords({ company, landing, pathname: '/' });
assert.ok(merged[0] === 'house cleaning');
assert.ok(merged.includes('maid service'));
assert.ok(merged.some((k) => /deep clean/i.test(k)));

const auto = deriveAutoPageSearchKeywords('/', landing);
assert.ok(auto.some((k) => /deep clean/i.test(k)));

console.log('verify-search-keywords: ok');
