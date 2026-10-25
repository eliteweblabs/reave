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

const grandOpening = readFileSync('src/components/grand-opening/GrandOpeningPage.astro', 'utf8');
assert.match(
  grandOpening,
  /fullBleed=\{false\}/,
  'GrandOpeningPage must opt out of homepage fullBleed so / gets header clearance (site-page pad)',
);

const cardFan = readFileSync('src/components/grand-opening/CardFanVisual.astro', 'utf8');
assert.match(
  cardFan,
  /grand-opening-card-fan\.js/,
  'CardFanVisual must load grand-opening-card-fan.js',
);
assert.doesNotMatch(
  cardFan,
  /grand-opening-card-fan\.js[^"\n]*\sdefer/,
  'card-fan script must not use defer — it runs after Astro module bundles and blocks swipe for seconds',
);

const header = readFileSync('src/components/Header.astro', 'utf8');
assert.match(
  header,
  /!showMarketingNav && \(adminShell \|\| !userId\) && \(\s*\n\s*<SignInSheet/,
  'SignInSheet mounts for admin shell or signed-out chrome only — not marketing nav pages',
);

const menu = readFileSync('src/components/MarketingMenu.astro', 'utf8');
assert.doesNotMatch(
  menu,
  /data-ios-sheet-open="sign-in-sheet"/,
  'marketing sign-in should link to /sign-in, not open the Clerk sheet on /',
);

console.log('verify-homepage-perf: ok');
