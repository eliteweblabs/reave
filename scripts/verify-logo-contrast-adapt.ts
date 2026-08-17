/**
 * Synthetic checks for mostly-black / mostly-white logo contrast adaptation.
 * Run: npm run check:logo-contrast
 */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  adaptLogoContrast,
  analyzeLogoContrast,
  isNearBlack,
  isNearWhite,
  punchSolidNeutralBackground,
  LOGO_CONTRAST_FLIP_THRESHOLD,
} from '../src/lib/logoContrastAdapt.ts';

function rgba(r: number, g: number, b: number, a = 255): Buffer {
  return Buffer.from([r, g, b, a]);
}

async function solidPng(
  width: number,
  height: number,
  fill: { r: number; g: number; b: number; alpha?: number },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: fill.r, g: fill.g, b: fill.b, alpha: fill.alpha ?? 1 },
    },
  })
    .png()
    .toBuffer();
}

/** Mostly black wordmark with two blue accent pixels (brand.networks-style). */
async function mostlyBlackWithBlueAccents(): Promise<Buffer> {
  const width = 40;
  const height = 10;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Transparent padding on the edges.
      if (x < 2 || x >= width - 2 || y < 1 || y >= height - 1) {
        raw[i + 3] = 0;
        continue;
      }
      // Two blue counters.
      if ((x === 8 && y === 4) || (x === 28 && y === 4)) {
        raw[i] = 37;
        raw[i + 1] = 99;
        raw[i + 2] = 235;
        raw[i + 3] = 255;
        continue;
      }
      // Near-black ink.
      raw[i] = 8;
      raw[i + 1] = 8;
      raw[i + 2] = 8;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function samplePixel(buf: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

assert.equal(isNearBlack({ r: 0, g: 0, b: 0 }), true);
assert.equal(isNearBlack({ r: 37, g: 99, b: 235 }), false, 'blue accent is not black');
assert.equal(isNearWhite({ r: 255, g: 255, b: 255 }), true);
assert.equal(isNearWhite({ r: 37, g: 99, b: 235 }), false);

{
  const black = await solidPng(16, 16, { r: 0, g: 0, b: 0 });
  const analysis = await analyzeLogoContrast(black);
  assert.ok(analysis.mostlyBlack);
  assert.ok(analysis.blackRatio > LOGO_CONTRAST_FLIP_THRESHOLD);
  const adapted = await adaptLogoContrast(black, 'dark');
  assert.equal(adapted.changed, true);
  const [r, g, b, a] = await samplePixel(adapted.buffer, 0, 0);
  assert.equal(r, 255);
  assert.equal(g, 255);
  assert.equal(b, 255);
  assert.equal(a, 255);
}

{
  const white = await solidPng(16, 16, { r: 255, g: 255, b: 255 });
  const analysis = await analyzeLogoContrast(white);
  assert.ok(analysis.mostlyWhite);
  const darkPass = await adaptLogoContrast(white, 'dark');
  assert.equal(darkPass.changed, false, 'white logos stay white on dark backgrounds');
  const lightPass = await adaptLogoContrast(white, 'light');
  assert.equal(lightPass.changed, true);
  const [r, g, b] = await samplePixel(lightPass.buffer, 0, 0);
  assert.equal(r, 0);
  assert.equal(g, 0);
  assert.equal(b, 0);
}

{
  const colored = await solidPng(16, 16, { r: 37, g: 99, b: 235 });
  const adapted = await adaptLogoContrast(colored, 'dark');
  assert.equal(adapted.changed, false, 'fully colored logos are untouched');
}

{
  const logo = await mostlyBlackWithBlueAccents();
  const analysis = await analyzeLogoContrast(logo);
  assert.ok(analysis.mostlyBlack, 'synthetic brand.networks-style mark should be mostly black');
  const adapted = await adaptLogoContrast(logo, 'dark');
  assert.equal(adapted.changed, true);

  const ink = await samplePixel(adapted.buffer, 4, 4);
  assert.deepEqual(ink.slice(0, 3), [255, 255, 255], 'black ink becomes white');

  const blueA = await samplePixel(adapted.buffer, 8, 4);
  assert.deepEqual(blueA.slice(0, 3), [37, 99, 235], 'blue accent in a stays blue');

  const blueE = await samplePixel(adapted.buffer, 28, 4);
  assert.deepEqual(blueE.slice(0, 3), [37, 99, 235], 'blue accent in e stays blue');

  const clear = await samplePixel(adapted.buffer, 0, 0);
  assert.equal(clear[3], 0, 'transparent padding stays transparent');
}

{
  // Majority color with a few black pixels — should not flip.
  const width = 10;
  const height = 10;
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (i < 3) {
      raw.set(rgba(0, 0, 0), o);
    } else {
      raw.set(rgba(220, 40, 40), o);
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const adapted = await adaptLogoContrast(png, 'dark');
  assert.equal(adapted.changed, false, 'black minority must not trigger a flip');
}

{
  const width = 24;
  const height = 24;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const mark = x >= 8 && x < 16 && y >= 8 && y < 16;
      raw.set(mark ? rgba(192, 38, 211) : rgba(0, 0, 0), o);
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const punched = await punchSolidNeutralBackground(png);
  const corner = await samplePixel(punched, 0, 0);
  assert.equal(corner[3], 0, 'black field becomes transparent');
  const mark = await samplePixel(punched, 12, 12);
  assert.deepEqual(mark.slice(0, 3), [192, 38, 211], 'colored mark is kept');
  assert.equal(mark[3], 255, 'colored mark stays opaque');
}

{
  const colored = await solidPng(16, 16, { r: 37, g: 99, b: 235 });
  const punched = await punchSolidNeutralBackground(colored);
  const pixel = await samplePixel(punched, 0, 0);
  assert.deepEqual(pixel.slice(0, 3), [37, 99, 235], 'brand-color tiles are not punched');
  assert.equal(pixel[3], 255);
}

console.log('logo contrast adapt checks passed');
