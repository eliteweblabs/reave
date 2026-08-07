/**
 * QR code generation for project portal / tracked share links.
 * Centers the current Reave app icon with a white quiet zone (high ECC).
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import QRCode from 'qrcode';
import sharp from 'sharp';

const QR_DARK = '#111111';
const QR_LIGHT = '#ffffff';

/** App icon used as the QR center mark (`public/reave-icon.png`). */
const REAVE_ICON_PATH = join(process.cwd(), 'public', 'reave-icon.png');

/**
 * Icon footprint as a fraction of QR width.
 * The PNG is square with generous internal padding around the AV mark, so this
 * is a bit larger than the old inline-SVG mark (~0.22) to keep the triangles
 * readable without covering so many modules that H-level ECC can't recover.
 */
const ICON_FRACTION = 0.28;
/** White pad around the icon so its black background doesn't melt into modules. */
const QUIET_PAD_FRACTION = 0.06;

let _iconBuffer: Buffer | null = null;

async function loadReaveIcon(): Promise<Buffer> {
  if (_iconBuffer) return _iconBuffer;
  _iconBuffer = await readFile(REAVE_ICON_PATH);
  return _iconBuffer;
}

async function reaveIconOverlay(size: number): Promise<{ input: Buffer; left: number; top: number }> {
  const iconSize = Math.max(24, Math.round(size * ICON_FRACTION));
  const pad = Math.max(3, Math.round(size * QUIET_PAD_FRACTION));
  const box = iconSize + pad * 2;

  const icon = await sharp(await loadReaveIcon())
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();

  const overlay = await sharp({
    create: {
      width: box,
      height: box,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png()
    .toBuffer();

  return {
    input: overlay,
    left: Math.round((size - box) / 2),
    top: Math.round((size - box) / 2),
  };
}

export async function qrCodeDataUrl(text: string, size = 160): Promise<string> {
  const url = text.trim();
  if (!url) return '';

  const qrBuffer = await QRCode.toBuffer(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: QR_DARK, light: QR_LIGHT },
    type: 'png',
  });

  const logo = await reaveIconOverlay(size);
  const composed = await sharp(qrBuffer)
    .composite([logo])
    .png()
    .toBuffer();

  return `data:image/png;base64,${composed.toString('base64')}`;
}
