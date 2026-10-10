/**
 * Homepage perf guardrails — avoid regressions that feel slow in the browser
 * while edge analytics still look fine.
 *
 * Run: npx tsx scripts/verify-homepage-perf.ts
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const index = readFileSync('src/pages/index.astro', 'utf8');

assert.doesNotMatch(
  index,
  /Astro\.rewrite\s*\(\s*["']\/grand-opening["']\s*\)/,
  'index / must render GrandOpeningPage directly — rewrite double-mounts Clerk client payloads',
);

assert.match(index, /GrandOpeningPage/, 'index / should import GrandOpeningPage');

const header = readFileSync('src/components/Header.astro', 'utf8');
assert.match(
  header,
  /!userId && !showMarketingNav && \(\s*\n\s*<SignInSheet/,
  'marketing pages must not mount SignInSheet (defer Clerk to /sign-in)',
);

const menu = readFileSync('src/components/MarketingMenu.astro', 'utf8');
assert.doesNotMatch(
  menu,
  /data-ios-sheet-open="sign-in-sheet"/,
  'marketing sign-in should link to /sign-in, not open the Clerk sheet on /',
);

console.log('verify-homepage-perf: ok');
