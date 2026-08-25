/**
 * Default social-share image: uploaded raster wins, else generated logo/letter card.
 * Run: npm run check:company-og
 */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { brandingEtag, buildCompanyOgPng } from '../src/lib/brandImageRender.ts';
import { OG_IMAGE_HEIGHT as PORTAL_OG_HEIGHT, OG_IMAGE_WIDTH as PORTAL_OG_WIDTH } from '../src/lib/ogImageSize.ts';
import { BRANDING_OG_PATH } from '../src/lib/companyLogo.ts';

async function solidPng(
  width: number,
  height: number,
  fill: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: fill,
    },
  })
    .png()
    .toBuffer();
}

async function sampleCenter(buf: Buffer): Promise<[number, number, number]> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  const y = Math.floor(info.height / 2);
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

{
  const generated = await buildCompanyOgPng({ name: 'Acme' });
  const meta = await sharp(generated).metadata();
  assert.equal(meta.width, PORTAL_OG_WIDTH);
  assert.equal(meta.height, PORTAL_OG_HEIGHT);
}

{
  const red = await solidPng(80, 80, { r: 220, g: 20, b: 20 });
  const uploaded = await buildCompanyOgPng({
    name: 'Acme',
    ogData: red.toString('base64'),
    ogMediaType: 'image/png',
  });
  const meta = await sharp(uploaded).metadata();
  assert.equal(meta.width, PORTAL_OG_WIDTH);
  assert.equal(meta.height, PORTAL_OG_HEIGHT);
  const [r, g, b] = await sampleCenter(uploaded);
  assert.ok(r > 180 && g < 80 && b < 80, `expected uploaded red card, got rgb(${r},${g},${b})`);
}

{
  const without = brandingEtag({ name: 'Acme' }, 0, 'og');
  const withOg = brandingEtag({ name: 'Acme', ogData: 'abc' }, 0, 'og');
  assert.notEqual(without, withOg);
  assert.match(withOg, /o/);
}

assert.equal(BRANDING_OG_PATH, '/api/branding/og.png');

console.log('verify-company-og-image: ok');
