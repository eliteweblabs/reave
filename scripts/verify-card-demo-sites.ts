/**
 * Run: npm run check:card-demo-sites
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isApexPublicWebsiteHost } from '../src/lib/publicUrl.ts';

assert.equal(isApexPublicWebsiteHost('lux.cleaning'), true);
assert.equal(isApexPublicWebsiteHost('maddythebarber-site-production.up.railway.app'), false);

const cardPage = readFileSync('src/pages/card.astro', 'utf8');
const cardPortfolio = readFileSync('src/client/cardDemoPortfolio.ts', 'utf8');
assert.match(cardPortfolio, /\/api\/card\/demo-sites/);
assert.doesNotMatch(cardPage, /karlacassidy-site-production/);

const lib = readFileSync('src/lib/cardDemoSites.ts', 'utf8');
assert.match(lib, /isCardDemoPortfolioEnabled/);
assert.match(lib, /isCanonicalReaveInstall/);
assert.match(cardPage, /showDemoPortfolio/);
assert.match(cardPage, /isCardDemoPortfolioEnabled/);
assert.match(lib, /railwayCollectCardDemoSites/);
assert.match(lib, /serviceHasLiveApexCustom/);
assert.match(lib, /hydrateCardDemoCache/);
assert.match(readFileSync('src/lib/cardDemoSitesStore.ts', 'utf8'), /card_demo_sites_cache/);

console.log('verify-card-demo-sites: ok');
