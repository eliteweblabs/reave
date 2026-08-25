/**
 * QR code generation for project portal / tracked share links.
 * Centers the company icon (SVG → image → initials) on a white quiet zone (high ECC).
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {
  brandingEtag,
  collectCompanyIconSources,
  renderCompanyIconMarkPng,
} from './brandImageRender';
import { BRANDING_ICON_PATH } from './companyLogo';
import {
  getStoredCompanyConfig,
  type StoredCompanyConfig,
} from './companyConfigStore';

const QR_DARK = '#111111';
const QR_LIGHT = '#ffffff';

/**
 * Icon footprint as a fraction of QR width.
 * Kept identical across SVG / image / initials so the white pad and mark box
 * stay the same size as the previous PNG overlay (high-ECC recoverable).
 */
export const QR_ICON_FRACTION = 0.28;
/** White pad around the icon so a dark tile doesn't melt into modules. */
export const QR_QUIET_PAD_FRACTION = 0.06;

export type QrCenterBox = {
  iconSize: number;
  pad: number;
  box: number;
  left: number;
  top: number;
};

/** Pixel box for the centered mark — same math for every brand source. */
export function qrCenterBox(size: number): QrCenterBox {
  const iconSize = Math.max(24, Math.round(size * QR_ICON_FRACTION));
  const pad = Math.max(3, Math.round(size * QR_QUIET_PAD_FRACTION));
  const box = iconSize + pad * 2;
  return {
    iconSize,
    pad,
    box,
    left: Math.round((size - box) / 2),
    top: Math.round((size - box) / 2),
  };
}

let _tileCache: { key: string; tile: Buffer } | null = null;

function publicIconFile(iconPath: string): string | null {
  const p = iconPath.trim();
  if (!p || p === BRANDING_ICON_PATH || /^https?:\/\//i.test(p) || p.startsWith('/api/')) {
    return null;
  }
  const rel = p.replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return null;
  return join(process.cwd(), 'public', rel);
}

async function withPublicIconFile(
  stored: StoredCompanyConfig | null,
): Promise<StoredCompanyConfig | null> {
  if (!stored || stored.iconData || stored.iconSvg?.trim()) return stored;
  const file = stored.iconPath ? publicIconFile(stored.iconPath) : null;
  if (!file) return stored;
  try {
    const buf = await readFile(file);
    return {
      ...stored,
      iconData: buf.toString('base64'),
      iconMediaType: stored.iconMediaType || 'image/png',
    };
  } catch {
    return stored;
  }
}

async function loadQrBrand(stored?: StoredCompanyConfig | null): Promise<StoredCompanyConfig | null> {
  const resolved = stored === undefined ? await getStoredCompanyConfig() : stored;
  return withPublicIconFile(resolved);
}

async function iconTilePng(stored: StoredCompanyConfig | null, iconSize: number): Promise<Buffer> {
  const key = `${brandingEtag(stored, iconSize, 'icon')}:qr`;
  if (_tileCache?.key === key) return _tileCache.tile;

  const mark = await renderCompanyIconMarkPng(stored, iconSize, {
    fit: 'contain',
    transparent: true,
  });

  // Flatten onto the same dark tile the previous PNG used so light SVGs
  // (white/gray marks) stay visible inside the white quiet zone.
  const tile = await sharp(mark)
    .resize(iconSize, iconSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png()
    .toBuffer();

  _tileCache = { key, tile };
  return tile;
}

async function brandIconOverlay(
  size: number,
  stored?: StoredCompanyConfig | null,
): Promise<{ input: Buffer; left: number; top: number }> {
  const { iconSize, pad, box, left, top } = qrCenterBox(size);
  const brand = await loadQrBrand(stored);
  const icon = await iconTilePng(brand, iconSize);

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

  return { input: overlay, left, top };
}

export async function qrCodeDataUrl(
  text: string,
  size = 160,
  stored?: StoredCompanyConfig | null,
): Promise<string> {
  const url = text.trim();
  if (!url) return '';

  const qrBuffer = await QRCode.toBuffer(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: QR_DARK, light: QR_LIGHT },
    type: 'png',
  });

  const logo = await brandIconOverlay(size, stored);
  const composed = await sharp(qrBuffer)
    .composite([logo])
    .png()
    .toBuffer();

  return `data:image/png;base64,${composed.toString('base64')}`;
}

/** Test helper — which brand source the QR mark will use. */
export function qrBrandSourceKind(
  stored: StoredCompanyConfig | null,
): 'svg' | 'image' | 'initials' {
  const sources = collectCompanyIconSources(stored);
  if (sources[0]?.kind === 'svg') return 'svg';
  if (sources[0]?.kind === 'raster') return 'image';
  return 'initials';
}
