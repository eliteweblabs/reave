/**
 * Adapt scraped/uploaded logos for dark (or light) surfaces.
 *
 * If more than half of the visible (non-transparent) pixels are near-black,
 * flip those black pixels to white — leaving colored accents alone. The
 * inverse (near-white → black) is available for light backgrounds.
 */
import sharp from 'sharp';

export type LogoBackgroundTone = 'dark' | 'light';

export type LogoContrastAnalysis = {
  visible: number;
  black: number;
  white: number;
  blackRatio: number;
  whiteRatio: number;
  /** True when black share exceeds the threshold (candidate for dark-bg flip). */
  mostlyBlack: boolean;
  /** True when white share exceeds the threshold (candidate for light-bg flip). */
  mostlyWhite: boolean;
};

export type LogoContrastAdaptResult = {
  buffer: Buffer;
  mediaType: string;
  changed: boolean;
  analysis: LogoContrastAnalysis;
};

/** Share of visible pixels that must be black/white before we rewrite. */
export const LOGO_CONTRAST_FLIP_THRESHOLD = 0.5;

/** Alpha below this is treated as transparent / ignored. */
const ALPHA_VISIBLE = 120;

/**
 * Near-black / near-white: dark or light *and* low saturation so brand accent
 * colors (e.g. the blue counters in brand.networks) are never rewritten.
 */
const NEUTRAL_SAT_MAX = 0.22;
const BLACK_LUM_MAX = 0.2;
const WHITE_LUM_MIN = 0.8;

type Rgb = { r: number; g: number; b: number };

function luminance({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max + min) / (2 * 255);
}

function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function isNearBlack(rgb: Rgb): boolean {
  return luminance(rgb) <= BLACK_LUM_MAX && saturation(rgb) < NEUTRAL_SAT_MAX;
}

export function isNearWhite(rgb: Rgb): boolean {
  return luminance(rgb) >= WHITE_LUM_MIN && saturation(rgb) < NEUTRAL_SAT_MAX;
}

function emptyAnalysis(): LogoContrastAnalysis {
  return {
    visible: 0,
    black: 0,
    white: 0,
    blackRatio: 0,
    whiteRatio: 0,
    mostlyBlack: false,
    mostlyWhite: false,
  };
}

export function analyzeLogoRgba(
  data: Buffer | Uint8Array,
  channels: number,
): LogoContrastAnalysis {
  const analysis = emptyAnalysis();
  if (channels < 3) return analysis;

  for (let i = 0; i < data.length; i += channels) {
    const alpha = channels >= 4 ? data[i + 3]! : 255;
    if (alpha < ALPHA_VISIBLE) continue;
    analysis.visible += 1;
    const rgb = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
    if (isNearBlack(rgb)) analysis.black += 1;
    else if (isNearWhite(rgb)) analysis.white += 1;
  }

  if (analysis.visible > 0) {
    analysis.blackRatio = analysis.black / analysis.visible;
    analysis.whiteRatio = analysis.white / analysis.visible;
  }
  analysis.mostlyBlack = analysis.blackRatio > LOGO_CONTRAST_FLIP_THRESHOLD;
  analysis.mostlyWhite = analysis.whiteRatio > LOGO_CONTRAST_FLIP_THRESHOLD;
  return analysis;
}

export async function analyzeLogoContrast(buf: Buffer): Promise<LogoContrastAnalysis> {
  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return analyzeLogoRgba(data, info.channels);
  } catch {
    return emptyAnalysis();
  }
}

/**
 * Rewrite near-black ↔ near-white neutrals for the given surface tone.
 * Colored pixels are left untouched. Returns the original buffer when no flip
 * is warranted or the image cannot be decoded.
 */
export async function adaptLogoContrast(
  buf: Buffer,
  background: LogoBackgroundTone = 'dark',
): Promise<LogoContrastAdaptResult> {
  const fallback: LogoContrastAdaptResult = {
    buffer: buf,
    mediaType: 'application/octet-stream',
    changed: false,
    analysis: emptyAnalysis(),
  };

  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const analysis = analyzeLogoRgba(data, info.channels);
    const shouldFlipBlack = background === 'dark' && analysis.mostlyBlack;
    const shouldFlipWhite = background === 'light' && analysis.mostlyWhite;
    if (!shouldFlipBlack && !shouldFlipWhite) {
      return { buffer: buf, mediaType: 'application/octet-stream', changed: false, analysis };
    }

    const out = Buffer.from(data);
    const channels = info.channels;
    for (let i = 0; i < out.length; i += channels) {
      const alpha = channels >= 4 ? out[i + 3]! : 255;
      if (alpha < ALPHA_VISIBLE) continue;
      const rgb = { r: out[i]!, g: out[i + 1]!, b: out[i + 2]! };
      if (shouldFlipBlack && isNearBlack(rgb)) {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
      } else if (shouldFlipWhite && isNearWhite(rgb)) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
      }
    }

    const png = await sharp(out, {
      raw: {
        width: info.width,
        height: info.height,
        channels: channels as 3 | 4,
      },
    })
      .png()
      .toBuffer();

    return {
      buffer: png,
      mediaType: 'image/png',
      changed: true,
      analysis,
    };
  } catch {
    return fallback;
  }
}

/**
 * Knock out a solid near-black or near-white field so a colorful mark can sit
 * on a CSS theme background (header profile icon, staff avatars).
 *
 * Only runs when all four corners agree on a neutral tone — photos and
 * full-bleed brand-color tiles are left alone. Returns the original buffer
 * when there is no field to punch or the mark would disappear.
 */
export async function punchSolidNeutralBackground(buf: Buffer): Promise<Buffer> {
  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    if (channels < 4 || width < 2 || height < 2) return buf;

    const cornerAt = (x: number, y: number): Rgb & { a: number } => {
      const i = (y * width + x) * channels;
      return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
    };
    const corners = [
      cornerAt(0, 0),
      cornerAt(width - 1, 0),
      cornerAt(0, height - 1),
      cornerAt(width - 1, height - 1),
    ];
    if (corners.some((c) => c.a < ALPHA_VISIBLE)) return buf;

    const allBlack = corners.every((c) => isNearBlack(c));
    const allWhite = corners.every((c) => isNearWhite(c));
    if (!allBlack && !allWhite) return buf;

    const out = Buffer.from(data);
    let kept = 0;
    for (let i = 0; i < out.length; i += channels) {
      const alpha = out[i + 3]!;
      if (alpha < ALPHA_VISIBLE) continue;
      const rgb = { r: out[i]!, g: out[i + 1]!, b: out[i + 2]! };
      if ((allBlack && isNearBlack(rgb)) || (allWhite && isNearWhite(rgb))) {
        out[i + 3] = 0;
      } else {
        kept += 1;
      }
    }
    if (kept < 8) return buf;

    return sharp(out, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();
  } catch {
    return buf;
  }
}
