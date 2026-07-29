/**
 * Rasterize uploaded brand icons into square PNGs for favicons, PWA, and share sheets.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

/** Sizes referenced by Favicon.astro, manifests, and service workers. */
export const BRAND_ICON_SIZES = {
  png16: 16,
  png32: 32,
  appleTouchIcon: 180,
  png192: 192,
  png512: 512,
} as const;

export type BrandIconSizeKey = keyof typeof BRAND_ICON_SIZES;

const SIZE_VALUES = new Set<number>(Object.values(BRAND_ICON_SIZES));

export function isBrandIconSize(size: number): boolean {
  return SIZE_VALUES.has(size);
}

function defaultIconPath(size: number): string {
  switch (size) {
    case 16:
      return 'favicon-16x16.png';
    case 32:
      return 'favicon-32x32.png';
    case 180:
      return 'apple-touch-icon.png';
    case 512:
      return 'favicon-512.png';
    case 192:
    default:
      return 'favicon-192.png';
  }
}

/** Resize any uploaded raster into a centered square PNG. */
export async function rasterizeBrandIcon(input: Buffer, size: number): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

/** Built-in AV mark PNGs from /public — used when no admin icon is uploaded. */
export async function readDefaultBrandIcon(size: number): Promise<Buffer> {
  const safeSize = isBrandIconSize(size) ? size : BRAND_ICON_SIZES.png192;
  const path = `${PUBLIC_DIR}${defaultIconPath(safeSize)}`;
  const raw = await readFile(path);
  if (safeSize === 16 || safeSize === 32 || safeSize === 180 || safeSize === 192 || safeSize === 512) {
    const meta = await sharp(raw).metadata();
    if (meta.width === safeSize && meta.height === safeSize) return raw;
  }
  return rasterizeBrandIcon(raw, safeSize);
}
