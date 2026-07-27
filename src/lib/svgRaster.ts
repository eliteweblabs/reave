/**
 * Rasterize SVG source to PNG so it can be sent as an Anthropic vision `image`
 * block (Claude's image blocks only accept jpeg/png/gif/webp — not svg+xml).
 * We still send the raw SVG source alongside as text so the model can read
 * and edit the actual markup, not just look at a picture of it.
 */
import sharp from 'sharp';

export interface SvgRasterResult {
  pngBase64: string;
  width: number;
  height: number;
}

/** Target long-edge in pixels for the rasterized PNG. */
const TARGET_MAX_DIMENSION = 1200;
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const DEFAULT_INTRINSIC_SIZE = 300;

export async function rasterizeSvgToPng(svgSource: string): Promise<SvgRasterResult> {
  const input = Buffer.from(svgSource, 'utf8');

  const baseMeta = await sharp(input).metadata();
  const baseWidth = baseMeta.width || DEFAULT_INTRINSIC_SIZE;
  const baseHeight = baseMeta.height || DEFAULT_INTRINSIC_SIZE;
  const longestEdge = Math.max(baseWidth, baseHeight) || DEFAULT_INTRINSIC_SIZE;

  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, TARGET_MAX_DIMENSION / longestEdge));
  const density = Math.round(72 * scale);

  const png = await sharp(input, { density }).png().toBuffer();
  const finalMeta = await sharp(png).metadata();

  return {
    pngBase64: png.toString('base64'),
    width: finalMeta.width ?? Math.round(baseWidth * scale),
    height: finalMeta.height ?? Math.round(baseHeight * scale),
  };
}
