/**
 * Favicons must show the brand mark — unfilled SVG (default black) cannot
 * collapse to a solid tile, and browser tabs keep the display name as-is.
 * Run: npm run check:brand-favicon
 */
import assert from 'node:assert/strict';
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

const UNFILLED_AV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M80.43,366.111c-5.462,0-9.608-2.29-12.432-6.874-2.828-4.58-3.172-9.604-1.024-15.064l79.274-196.287c2.925-6.821,7.701-10.237,14.334-10.237,7.02,0,11.796,3.416,14.332,10.237l79.566,196.871c2.144,5.464,1.801,10.385-1.024,14.772-2.828,4.387-7.069,6.582-12.724,6.582-2.925,0-5.704-.827-8.336-2.487-2.633-1.653-4.535-3.947-5.704-6.874l-69.62-180.195h8.19l-70.79,180.195c-1.17,3.124-3.12,5.464-5.85,7.022-2.732,1.562-5.462,2.339-8.19,2.339Z"/>
  <path d="M344.29,366.111c-6.245,0-10.825-3.219-13.752-9.653l-85.708-195.991c-2.732-6.628-3.026-12.091-.876-16.383,2.142-4.284,6.239-6.434,12.285-6.434,6.825,0,11.505,3.026,14.042,9.069l75.177,180.487h-3.219l76.642-180.487c1.558-3.511,3.363-5.896,5.411-7.166,2.047-1.266,4.827-1.903,8.338-1.903,5.85,0,9.896,2.097,12.141,6.29,2.241,4.193,2.195,8.827-.148,13.896l-86.584,198.622c-1.369,3.12-3.174,5.513-5.414,7.166-2.245,1.661-5.02,2.487-8.334,2.487Z"/>
</svg>`;

{
  assert.equal(svgSpecifiesFill(UNFILLED_AV), false);
  assert.ok(svgSpecifiesFill(withSvgFill(UNFILLED_AV, '#ffffff')));
  assert.equal(svgSpecifiesFill('<svg fill="none"><path/></svg>'), false);
  assert.equal(withSvgFill('<svg fill="none"><path/></svg>', '#ffffff'), '<svg fill="#ffffff"><path/></svg>');
  assert.ok(svgSpecifiesFill('<svg fill="#111"><path/></svg>'));
}

{
  const png = await renderCompanyBrandIconPng({ name: 'reΛVe.app', iconSvg: UNFILLED_AV }, 32);
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 32);
  assert.equal(meta.height, 32);
  const analysis = await analyzeLogoContrast(png);
  assert.equal(isSolidNeutralField(analysis, 32 * 32), false, 'favicon must not be a solid tile');
  assert.ok(analysis.whiteRatio > 0.04, `expected a light mark, whiteRatio=${analysis.whiteRatio}`);
}

{
  const png = await renderCompanyBrandIconPng(
    { name: 'reΛVe.app', iconSvg: UNFILLED_AV },
    32,
    { transparent: true },
  );
  const analysis = await analyzeLogoContrast(png);
  assert.equal(isSolidNeutralField(analysis, 32 * 32), false, 'avatar must not be a solid tile');
  assert.ok(analysis.blackRatio > 0.5, `transparent avatar must keep black ink, blackRatio=${analysis.blackRatio}`);
  assert.ok(analysis.whiteRatio < 0.15, `transparent avatar must not flip to white, whiteRatio=${analysis.whiteRatio}`);
}

{
  const etag = brandingEtag({ name: 'reΛVe.app', iconSvg: UNFILLED_AV, brandPrimary: '#000000' }, 32);
  assert.match(etag, new RegExp(`:${BRAND_ICON_RENDER}:`));
  assert.match(etag, /#000000/);
  const other = brandingEtag({ name: 'reΛVe.app', iconSvg: UNFILLED_AV }, 32);
  assert.notEqual(etag, other);
}

{
  const admin = brandMarkInk({ brandPrimary: '#22c55e', brandSecondary: '#16a34a' }, 'dark');
  assert.equal(admin.from, '#22c55e');
  const darkAdmin = brandMarkInk({ brandPrimary: '#000000', brandSecondary: '#505050' }, 'dark');
  assert.equal(darkAdmin.from, '#ffffff');
  const unset = brandMarkInk({ name: 'reΛVe.app' }, 'dark');
  assert.equal(unset.from, '#ffffff');
  assert.doesNotMatch(unset.from + unset.to, /#f472b6|#c026d3|#6366f1|#a855f7/i);
}

{
  const png = await renderCompanyBrandIconPng({ name: 'reΛVe.app' }, 32);
  const analysis = await analyzeLogoContrast(png);
  assert.equal(isSolidNeutralField(analysis, 32 * 32), false, 'letter fallback must not be a solid tile');
}

{
  const wrapped = wrapFaviconSvg(UNFILLED_AV, '#ffffff');
  assert.ok(wrapped, 'wrapFaviconSvg must return markup');
  assert.match(wrapped!, /<rect\b[^>]*fill="#09090b"/);
  assert.match(wrapped!, /<g fill="#ffffff">/);
  assert.match(wrapped!, /M80\.43,366\.111/);
  const fromAdmin = companyFaviconSvgMarkup({ name: 'reΛVe.app', iconSvg: UNFILLED_AV, brandPrimary: '#000000' });
  assert.ok(fromAdmin);
  assert.match(fromAdmin!, /<g fill="#ffffff">/);
}

console.log('verify-brand-favicon: ok');
