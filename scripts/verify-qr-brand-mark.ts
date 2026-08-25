/**
 * QR center mark: SVG icon → icon image → initials, same overlay box.
 * Run: npm run check:qr-brand
 */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  brandMarkInitials,
  brandMarkLetter,
  collectCompanyIconSources,
} from '../src/lib/brandImageRender.ts';
import {
  QR_ICON_FRACTION,
  QR_QUIET_PAD_FRACTION,
  qrBrandSourceKind,
  qrCenterBox,
  qrCodeDataUrl,
} from '../src/lib/qrCode.ts';

function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',');
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

async function solidPng(
  width: number,
  height: number,
  fill: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: fill },
  })
    .png()
    .toBuffer();
}

async function samplePixel(
  buf: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

{
  assert.equal(brandMarkInitials('Acme Corp'), 'AC');
  assert.equal(brandMarkInitials('Business OS'), 'BO');
  assert.equal(brandMarkInitials('reΛVe.app'), 'RA');
  assert.equal(brandMarkInitials('Acme'), 'AC');
  assert.equal(brandMarkInitials('A'), 'A');
  assert.equal(brandMarkLetter('Acme Corp'), 'A');
}

{
  const svgFirst = collectCompanyIconSources({
    name: 'Acme',
    iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#0c6"/></svg>',
    iconData: 'aaaa',
    iconMediaType: 'image/png',
  });
  assert.equal(svgFirst[0]?.kind, 'svg');
  assert.equal(
    qrBrandSourceKind({
      iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>',
      iconData: 'aaaa',
      iconMediaType: 'image/png',
    }),
    'svg',
  );

  const imageOnly = collectCompanyIconSources({
    name: 'Acme',
    iconData: 'aaaa',
    iconMediaType: 'image/png',
  });
  assert.equal(imageOnly[0]?.kind, 'raster');
  assert.equal(qrBrandSourceKind({ iconData: 'aaaa', iconMediaType: 'image/png' }), 'image');
  assert.equal(qrBrandSourceKind({ name: 'Acme' }), 'initials');
  assert.equal(qrBrandSourceKind(null), 'initials');
}

{
  assert.equal(QR_ICON_FRACTION, 0.28);
  assert.equal(QR_QUIET_PAD_FRACTION, 0.06);

  const s160 = qrCenterBox(160);
  assert.deepEqual(s160, { iconSize: 45, pad: 10, box: 65, left: 48, top: 48 });

  const s168 = qrCenterBox(168);
  assert.deepEqual(s168, { iconSize: 47, pad: 10, box: 67, left: 51, top: 51 });

  const s200 = qrCenterBox(200);
  assert.deepEqual(s200, { iconSize: 56, pad: 12, box: 80, left: 60, top: 60 });
}

const limeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#00cc66"/></svg>';
const red = await solidPng(64, 64, { r: 220, g: 20, b: 20 });

async function assertQrSize(dataUrl: string, size: number): Promise<Buffer> {
  const buf = decodeDataUrl(dataUrl);
  const meta = await sharp(buf).metadata();
  assert.equal(meta.width, size);
  assert.equal(meta.height, size);
  return buf;
}

{
  const size = 160;
  const box = qrCenterBox(size);
  const svgQr = await qrCodeDataUrl('https://example.com/svg', size, {
    name: 'Acme Corp',
    iconSvg: limeSvg,
    iconData: red.toString('base64'),
    iconMediaType: 'image/png',
  });
  const svgBuf = await assertQrSize(svgQr, size);
  const [sr, sg, sb] = await samplePixel(svgBuf, Math.floor(size / 2), Math.floor(size / 2));
  assert.ok(sg > sr + 40 && sg > sb + 40, `SVG should win over image, got rgb(${sr},${sg},${sb})`);

  const imgQr = await qrCodeDataUrl('https://example.com/img', size, {
    name: 'Acme Corp',
    iconData: red.toString('base64'),
    iconMediaType: 'image/png',
  });
  const imgBuf = await assertQrSize(imgQr, size);
  const [ir, ig, ib] = await samplePixel(imgBuf, Math.floor(size / 2), Math.floor(size / 2));
  assert.ok(ir > 160 && ig < 80 && ib < 80, `image fallback should be red, got rgb(${ir},${ig},${ib})`);

  const initialsQr = await qrCodeDataUrl('https://example.com/ini', size, {
    name: 'Acme Corp',
  });
  const initialsBuf = await assertQrSize(initialsQr, size);
  const [nr, ng, nb] = await samplePixel(initialsBuf, box.left + 1, box.top + 1);
  assert.ok(nr > 240 && ng > 240 && nb > 240, `quiet pad should stay white, got rgb(${nr},${ng},${nb})`);

  // Same overlay footprint for every source — pad pixel just inside the white box.
  for (const buf of [svgBuf, imgBuf, initialsBuf]) {
    const [pr, pg, pb] = await samplePixel(buf, box.left + 1, box.top + 1);
    assert.ok(pr > 240 && pg > 240 && pb > 240, `pad mismatch rgb(${pr},${pg},${pb})`);
    const [tr, tg, tb] = await samplePixel(buf, box.left + box.pad + 2, box.top + box.pad + 2);
    assert.ok(!(tr > 240 && tg > 240 && tb > 240), 'icon tile should not be the white pad');
  }
}

console.log('verify-qr-brand-mark: ok');
