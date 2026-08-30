/**
 * QR code generation for project portal / tracked share links.
 * Centers the company icon (SVG → image → initials) on a white quiet zone (high ECC).
 * Default module style is dots (circular data modules + rounded finder eyes).
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
import { adaptLogoContrast } from './logoContrastAdapt';

const QR_DARK = '#111111';
const QR_LIGHT = '#ffffff';

/** Module drawing style. `dots` = circular data modules + rounded finder eyes. */
export type QrModuleStyle = 'square' | 'dots';

export type QrCodeRenderOptions = {
  style?: QrModuleStyle;
};

/**
 * Icon footprint as a fraction of QR width.
 * Kept identical across SVG / image / initials so the white pad and mark box
 * stay the same size as the previous PNG overlay (high-ECC recoverable).
 */
export const QR_ICON_FRACTION = 0.28;
/** White pad around the icon so a dark mark doesn't melt into modules. */
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

  // Sit the glyph on the white quiet zone. Dark marks (the AV triangles)
  // stay dark; white/gray marks flip so they don't vanish on white.
  // Flattening onto a black tile hid those dark icons as a solid square.
  const adapted = await adaptLogoContrast(mark, 'light');
  const tile = await sharp(adapted.buffer)
    .resize(iconSize, iconSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
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

function isFinderModule(row: number, col: number, n: number): boolean {
  if (row < 7 && col < 7) return true;
  if (row < 7 && col >= n - 7) return true;
  if (row >= n - 7 && col < 7) return true;
  return false;
}

function finderOrigins(n: number): Array<{ row: number; col: number }> {
  return [
    { row: 0, col: 0 },
    { row: 0, col: n - 7 },
    { row: n - 7, col: 0 },
  ];
}

/** Escape for SVG attribute text (fill colors are constants; url is never embedded). */
function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Build an SVG QR. `dots` draws circular data modules and rounded finder eyes;
 * `square` matches the classic block look from `qrcode` PNG output.
 */
export function qrCodeSvg(
  text: string,
  size: number,
  style: QrModuleStyle = 'dots',
): string {
  const url = text.trim();
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const modules = qr.modules;
  const n = modules.size;
  const margin = 1;
  const total = n + margin * 2;
  const cell = size / total;
  const dark = escAttr(QR_DARK);
  const light = escAttr(QR_LIGHT);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">`,
    `<rect width="${size}" height="${size}" fill="${light}"/>`,
  ];

  const modX = (col: number) => (col + margin) * cell;
  const modY = (row: number) => (row + margin) * cell;

  if (style === 'dots') {
    for (const { row, col } of finderOrigins(n)) {
      const x = modX(col);
      const y = modY(row);
      const outerR = cell * 1.15;
      const midR = cell * 0.85;
      const pupilR = cell * 1.35;
      parts.push(
        `<rect x="${x}" y="${y}" width="${7 * cell}" height="${7 * cell}" rx="${outerR}" ry="${outerR}" fill="${dark}"/>`,
        `<rect x="${x + cell}" y="${y + cell}" width="${5 * cell}" height="${5 * cell}" rx="${midR}" ry="${midR}" fill="${light}"/>`,
        `<circle cx="${x + 3.5 * cell}" cy="${y + 3.5 * cell}" r="${pupilR}" fill="${dark}"/>`,
      );
    }

    const r = cell * 0.42;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!modules.get(row, col) || isFinderModule(row, col, n)) continue;
        const cx = modX(col) + cell / 2;
        const cy = modY(row) + cell / 2;
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>`);
      }
    }
  } else {
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!modules.get(row, col)) continue;
        parts.push(
          `<rect x="${modX(col)}" y="${modY(row)}" width="${cell}" height="${cell}" fill="${dark}"/>`,
        );
      }
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

async function qrMatrixPng(
  text: string,
  size: number,
  style: QrModuleStyle,
): Promise<Buffer> {
  if (style === 'square') {
    return QRCode.toBuffer(text.trim(), {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: QR_DARK, light: QR_LIGHT },
      type: 'png',
    });
  }

  const svg = qrCodeSvg(text, size, 'dots');
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function qrCodeDataUrl(
  text: string,
  size = 160,
  stored?: StoredCompanyConfig | null,
  opts?: QrCodeRenderOptions,
): Promise<string> {
  const url = text.trim();
  if (!url) return '';

  const style: QrModuleStyle = opts?.style ?? 'dots';
  const qrBuffer = await qrMatrixPng(url, size, style);

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
