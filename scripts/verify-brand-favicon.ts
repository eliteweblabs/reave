/**
 * Favicons must show the brand mark — unfilled SVG (default black) cannot
 * collapse to a solid tile, and browser tabs keep the display name as-is.
 * Run: npm run check:brand-favicon
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { BRAND_ICON_RENDER } from '../src/lib/brandIconRaster.ts';
import {
  brandMarkInk,
  brandingEtag,
  companyFaviconSvgMarkup,
  isSolidNeutralField,
  renderCompanyBrandIconPng,
  wrapFaviconSvg,
} from '../src/lib/brandImageRender.ts';
import { svgSpecifiesFill, withSvgFill } from '../src/lib/brandSvg.ts';
import { analyzeLogoContrast } from '../src/lib/logoContrastAdapt.ts';

const UNFILLED_AV = readFileSync('scripts/fixtures/reave-app-icon.svg', 'utf8').trim();

{
  assert.equal(svgSpecifiesFill(UNFILLED_AV), false);
  assert.ok(svgSpecifiesFill(withSvgFill(UNFILLED_AV, '#ffffff')));
  assert.equal(svgSpecifiesFill('<svg fill="none"><path/></svg>'), false);
  assert.equal(withSvgFill('<svg fill="none"><path/></svg>', '#ffffff'), '<svg fill="#ffffff"><path/></svg>');
  assert.ok(svgSpecifiesFill('<svg fill="#111"><path/></svg>'));
}

{
  const png = await renderCompanyBrandIconPng({ name: 'reave.app', iconSvg: UNFILLED_AV }, 32);
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 32);
  assert.equal(meta.height, 32);
  const analysis = await analyzeLogoContrast(png);
  assert.equal(isSolidNeutralField(analysis, 32 * 32), false, 'favicon must not be a solid tile');
  assert.ok(analysis.whiteRatio > 0.04, `expected a light mark, whiteRatio=${analysis.whiteRatio}`);
}

{
  const png = await renderCompanyBrandIconPng(
    { name: 'reave.app', iconSvg: UNFILLED_AV },
    32,
    { transparent: true },
  );
  const analysis = await analyzeLogoContrast(png);
  assert.equal(isSolidNeutralField(analysis, 32 * 32), false, 'avatar must not be a solid tile');
  assert.ok(analysis.blackRatio > 0.5, `transparent avatar must keep black ink, blackRatio=${analysis.blackRatio}`);
  assert.ok(analysis.whiteRatio < 0.15, `transparent avatar must not flip to white, whiteRatio=${analysis.whiteRatio}`);
}

{
  const etag = brandingEtag({ name: 'reave.app', iconSvg: UNFILLED_AV, brandPrimary: '#000000' }, 32);
  assert.match(etag, new RegExp(`:${BRAND_ICON_RENDER}:`));
  assert.match(etag, /#000000/);
  const other = brandingEtag({ name: 'reave.app', iconSvg: UNFILLED_AV }, 32);
  assert.notEqual(etag, other);
}

{
  const admin = brandMarkInk({ brandPrimary: '#22c55e', brandSecondary: '#16a34a' }, 'dark');
  assert.equal(admin.from, '#22c55e');
  const darkAdmin = brandMarkInk({ brandPrimary: '#000000', brandSecondary: '#505050' }, 'dark');
  assert.equal(darkAdmin.from, '#ffffff');
  const unset = brandMarkInk({ name: 'reave.app' }, 'dark');
  assert.equal(unset.from, '#ffffff');
  assert.doesNotMatch(unset.from + unset.to, /#f472b6|#c026d3|#6366f1|#a855f7/i);
}

{
  const png = await renderCompanyBrandIconPng({ name: 'reave.app' }, 32);
  const analysis = await analyzeLogoContrast(png);
  assert.equal(isSolidNeutralField(analysis, 32 * 32), false, 'letter fallback must not be a solid tile');
}

{
  const wrapped = wrapFaviconSvg(UNFILLED_AV, '#ffffff');
  assert.ok(wrapped, 'wrapFaviconSvg must return markup');
  assert.match(wrapped!, /<rect\b[^>]*fill="#09090b"/);
  assert.match(wrapped!, /<g fill="#ffffff">/);
  assert.match(wrapped!, /1128\.692 153\.833/);
  const fromAdmin = companyFaviconSvgMarkup({ name: 'reave.app', iconSvg: UNFILLED_AV, brandPrimary: '#000000' });
  assert.ok(fromAdmin);
  assert.match(fromAdmin!, /<g fill="#ffffff">/);
  const customBg = wrapFaviconSvg(UNFILLED_AV, '#ffffff', '#1e3a5f');
  assert.match(customBg!, /<rect\b[^>]*fill="#1e3a5f"/);
  const lightTile = await renderCompanyBrandIconPng(
    { name: 'reave.app', iconSvg: UNFILLED_AV, iconBackground: '#f5f5f5', brandPrimary: '#111111' },
    32,
  );
  const lightMeta = await sharp(lightTile).metadata();
  assert.equal(lightMeta.width, 32);
  const lightAnalysis = await analyzeLogoContrast(lightTile);
  assert.ok(lightAnalysis.whiteRatio > 0.5, `light tile should be mostly white bg, whiteRatio=${lightAnalysis.whiteRatio}`);
}

console.log('verify-brand-favicon: ok');
