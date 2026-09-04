/**
 * Rasterize uploaded brand icons into square PNGs for favicons, PWA, and share sheets.
 */
import sharp from 'sharp';

/** Bump when favicon rasterization changes so browsers/CDNs drop a stale tile. */
export const BRAND_ICON_RENDER = 'av4';

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

/** Resize any uploaded raster into a centered square PNG. */
export async function rasterizeBrandIcon(input: Buffer, size: number): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}
