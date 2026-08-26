/**
 * Paper-white replaced-app marks must invert on the light marketing canvas.
 * Source-only — does not import the media library.
 * Run: npm run check:replaced-logo-invert
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EXPECTED_WHITE = [
  'Notion',
  'Typeform',
  'Zendesk',
  'Square',
  'Buffer',
] as const;

const EXPECTED_SLUGS = [
  'replaced-notion',
  'replaced-typeform',
  'replaced-zendesk',
  'replaced-square',
  'replaced-buffer',
] as const;

const catalog = readFileSync('src/lib/brandLogos.ts', 'utf8');
assert.match(catalog, /PAPER_WHITE_REPLACED_APP_IMAGES/);
assert.match(catalog, /invertOnLight/);
for (const slug of EXPECTED_SLUGS) {
  assert.match(catalog, new RegExp(`'${slug}'`));
}

const bake = readFileSync('scripts/fetch-replaced-app-logos.mjs', 'utf8');
const whiteBake = [...bake.matchAll(/name: "([^"]+)", color: "#FFFFFF"/g)].map((m) => m[1]);
assert.deepEqual(whiteBake.sort(), [...EXPECTED_WHITE].sort());

const marquee = readFileSync('src/components/BrandLogoMarquee.astro', 'utf8');
assert.match(marquee, /blm-tile--invert/);
assert.match(marquee, /logo\.invertOnLight/);
assert.match(marquee, /filter:\s*invert\(1\)/);

const brandCss = readFileSync('src/styles/brand.css', 'utf8');
assert.match(brandCss, /html\.site-marketing \.blm-tile--invert img/);
assert.match(brandCss, /filter:\s*invert\(1\)/);
assert.match(brandCss, /html\.site-marketing\[data-theme="dark"\] \.blm-tile--invert img/);

console.log('replaced-app logo invert checks passed');
