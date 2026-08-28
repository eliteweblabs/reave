/**
 * Resolve admin branding (PNG uploads + pasted SVG) into raster PNGs for
 * favicons, PWA icons, OG cards, and avatars. Falls back to the first letter
 * of the company display name when no mark is configured.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { SITE } from '../config/site';
import { sanitizeInlineSvg, resolveSvgAssetUrls, withSvgFill } from './brandSvg';
import { BRAND_ICON_RENDER, rasterizeBrandIcon } from './brandIconRaster';
import type { StoredCompanyConfig } from './companyConfigStore';
import { OG_IMAGE_HEIGHT as PORTAL_OG_HEIGHT, OG_IMAGE_WIDTH as PORTAL_OG_WIDTH } from './ogImageSize';
import {
  adaptLogoContrast,
  analyzeLogoContrast,
  punchSolidNeutralBackground,
  type LogoContrastAnalysis,
} from './logoContrastAdapt';
import { readPublicBrandingFile } from './publicBranding';

export type BrandMarkSource =
  | { kind: 'raster'; buffer: Buffer }
  | { kind: 'svg'; svg: string };

const OG_BG = { r: 10, g: 10, b: 10 };
const OG_LOGO_INSET = 0.15;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function firstAlnum(value: string): string {
  const match = value.match(/\p{L}|\p{N}/u);
  return match?.[0] ?? '';
}

/** First letter or digit from the display name — used for icon fallbacks. */
export function brandMarkLetter(name: string): string {
  const trimmed = (name || SITE.name).trim();
  if (!trimmed) return 'B';
  return (firstAlnum(trimmed) || trimmed[0] || 'B').toUpperCase();
}

/**
 * One or two initials from the display name.
 * Two words → first letter of each; one token → first two letters (or one).
 */
export function brandMarkInitials(name: string): string {
  const trimmed = (name || SITE.name).trim();
  if (!trimmed) return 'B';
  const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length >= 2) {
    const a = firstAlnum(words[0] ?? '');
    const b = firstAlnum(words[1] ?? '');
    if (a && b) return (a + b).toUpperCase();
  }
  const chars = [...trimmed].filter((c) => /\p{L}|\p{N}/u.test(c));
  if (chars.length >= 2) return `${chars[0]}${chars[1]}`.toUpperCase();
  if (chars.length === 1) return chars[0]!.toUpperCase();
  return 'B';
}

function pushRaster(
  sources: BrandMarkSource[],
  dataBase64?: string | null,
  mediaType?: string | null,
): void {
  if (!dataBase64?.trim() || !mediaType?.trim()) return;
  sources.push({ kind: 'raster', buffer: Buffer.from(dataBase64, 'base64') });
}

function pushSvg(sources: BrandMarkSource[], raw?: string | null): void {
  const svg = raw?.trim() ? sanitizeInlineSvg(resolveSvgAssetUrls(raw.trim())) : null;
  if (svg) sources.push({ kind: 'svg', svg });
}

function pushDiskBranding(sources: BrandMarkSource[]): void {
  const iconSvg = readPublicBrandingFile('icon.svg');
  if (iconSvg) pushSvg(sources, iconSvg.data.toString('utf8'));
  const iconPng = readPublicBrandingFile('icon.png');
  if (iconPng) sources.push({ kind: 'raster', buffer: iconPng.data });
  const logoSvg = readPublicBrandingFile('logo.svg');
  if (logoSvg) pushSvg(sources, logoSvg.data.toString('utf8'));
  const logoPng = readPublicBrandingFile('logo.png');
  if (logoPng) sources.push({ kind: 'raster', buffer: logoPng.data });
}

/** Icon PNG → icon SVG → logo PNG → logo SVG, then disk branding files. */
export function collectBrandMarkSources(stored: StoredCompanyConfig | null): BrandMarkSource[] {
  const sources: BrandMarkSource[] = [];
  if (stored) {
    pushRaster(sources, stored.iconData, stored.iconMediaType);
    pushSvg(sources, stored.iconSvg);
    pushRaster(sources, stored.logoData, stored.logoMediaType);
    pushSvg(sources, stored.logoSvg);
  }
  if (sources.length === 0) pushDiskBranding(sources);
  return sources;
}

/** Icon SVG → icon PNG. No logo fallback — caller supplies initials. */
export function collectCompanyIconSources(stored: StoredCompanyConfig | null): BrandMarkSource[] {
  const sources: BrandMarkSource[] = [];
  if (!stored) return sources;
  pushSvg(sources, stored.iconSvg);
  pushRaster(sources, stored.iconData, stored.iconMediaType);
  return sources;
}

/** Uploaded wordmark PNG → pasted wordmark SVG. No icon fallback. */
export function collectLogoWordmarkSources(stored: StoredCompanyConfig | null): BrandMarkSource[] {
  const sources: BrandMarkSource[] = [];
  if (!stored) return sources;
  pushRaster(sources, stored.logoData, stored.logoMediaType);
  pushSvg(sources, stored.logoSvg);
  return sources;
}

const LOGO_WORDMARK_MAX_HEIGHT = 256;

async function rasterizeWordmark(source: BrandMarkSource, maxHeight: number): Promise<Buffer | null> {
  try {
    if (source.kind === 'raster') {
      return sharp(source.buffer)
        .rotate()
        .resize({ height: maxHeight, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    }
    const input = Buffer.from(source.svg, 'utf8');
    const meta = await sharp(input).metadata();
    const height = meta.height || maxHeight;
    const density = Math.round(72 * Math.max(1, maxHeight / height));
    return sharp(input, { density })
      .resize({ height: maxHeight, fit: 'inside' })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Wide wordmark PNG for email headers and generic /branding/logo.png.
 * Company config first, then public/branding/logo.png. No letter-tile fallback.
 */
export async function renderCompanyLogoWordmarkPng(
  stored: StoredCompanyConfig | null,
): Promise<Buffer | null> {
  for (const source of collectLogoWordmarkSources(stored)) {
    const png = await rasterizeWordmark(source, LOGO_WORDMARK_MAX_HEIGHT);
    if (png) return png;
  }
  return readPublicBrandingFile('logo.png')?.data ?? null;
}

export function companyLogoSvgMarkup(stored: StoredCompanyConfig | null): string | null {
  const svg = stored?.logoSvg?.trim();
  if (svg) return svg;
  const disk = readPublicBrandingFile('logo.svg');
  return disk ? disk.data.toString('utf8') : null;
}

export function companyIconSvgMarkup(stored: StoredCompanyConfig | null): string | null {
  const svg = stored?.iconSvg?.trim();
  if (svg) return svg;
  const disk = readPublicBrandingFile('icon.svg');
  return disk ? disk.data.toString('utf8') : null;
}

/** Solid black/white tile — the mark was lost (unfilled SVG on a black canvas). */
export function isSolidNeutralField(analysis: LogoContrastAnalysis, pixelCount: number): boolean {
  if (pixelCount <= 0) return true;
  if (analysis.visible < pixelCount * 0.92) return false;
  return Math.max(analysis.blackRatio, analysis.whiteRatio) > 0.96;
}

async function compositeOnBlack(png: Buffer, size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([{ input: png, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function prepareFaviconMark(png: Buffer, size: number, transparent: boolean): Promise<Buffer | null> {
  const analysis = await analyzeLogoContrast(png);
  if (isSolidNeutralField(analysis, size * size)) return null;

  let mark = png;
  const inkOnClearField = analysis.visible < size * size * 0.85;

  if (transparent) {
    // Header / email / print sit on a light theme canvas — keep dark ink.
    // A mostly-white mark would vanish the same way a black mark vanishes on
    // a dark favicon; flip that case only.
    if (analysis.mostlyWhite && inkOnClearField) {
      mark = (await adaptLogoContrast(mark, 'light')).buffer;
    }
    return punchSolidNeutralBackground(mark);
  }

  // Black ink on a clear field — flip for dark favicons. Skip when the
  // canvas is already a dark tile (flipping would wash out the background).
  if (analysis.mostlyBlack && inkOnClearField) {
    mark = (await adaptLogoContrast(mark, 'dark')).buffer;
  }
  return compositeOnBlack(mark, size);
}

async function rasterizeSvgSource(
  svg: string,
  size: number,
  fit: 'cover' | 'contain' = 'cover',
): Promise<Buffer | null> {
  try {
    const input = Buffer.from(svg, 'utf8');
    const meta = await sharp(input).metadata();
    const longest = Math.max(meta.width || size, meta.height || size, 1);
    const density = Math.round(72 * Math.max(1, size / longest));
    const png = await sharp(input, { density }).png().toBuffer();
    if (fit === 'contain') {
      return sharp(png)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    }
    return rasterizeBrandIcon(png, size);
  } catch {
    return null;
  }
}

async function rasterizeSource(
  source: BrandMarkSource,
  size: number,
  fit: 'cover' | 'contain' = 'cover',
): Promise<Buffer | null> {
  try {
    if (source.kind === 'raster') {
      if (fit === 'contain') {
        return sharp(source.buffer)
          .rotate()
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();
      }
      return rasterizeBrandIcon(source.buffer, size);
    }
    return rasterizeSvgSource(source.svg, size, fit);
  } catch {
    return null;
  }
}

type BrandMarkInk = { from: string; to: string };

function brandHex(raw?: string | null): string | null {
  const t = (raw ?? '').trim();
  const m = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1]!;
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
}

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/**
 * Ink for favicon tiles. Uses admin Company colors when they contrast on the
 * canvas. Never falls through to the pink/magenta site defaults.
 */
export function brandMarkInk(stored: StoredCompanyConfig | null, surface: 'dark' | 'light' = 'dark'): BrandMarkInk {
  const primary = brandHex(stored?.brandPrimary);
  const secondary = brandHex(stored?.brandSecondary) ?? primary;
  if (primary) {
    const lum = hexLuminance(primary);
    if (surface === 'dark' ? lum > 0.45 : lum < 0.55) {
      return { from: primary, to: secondary ?? primary };
    }
  }
  return surface === 'dark'
    ? { from: '#ffffff', to: '#e4e4e7' }
    : { from: '#09090b', to: '#3f3f46' };
}

function buildLetterSvg(letter: string, size: number, transparent: boolean, ink: BrandMarkInk): string {
  const safe = escapeXml(letter);
  const two = [...letter].length > 1;
  const fontSize = Math.round(size * (two ? 0.4 : 0.52));
  const tracking = two ? ' letter-spacing="-0.06em"' : '';
  const background = transparent
    ? ''
    : `<rect width="${size}" height="${size}" fill="#09090b"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${background}
  <defs>
    <linearGradient id="brand-letter" x1="0" y1="${size}" x2="${size}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${ink.from}"/>
      <stop offset="100%" stop-color="${ink.to}"/>
    </linearGradient>
  </defs>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="url(#brand-letter)" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="${fontSize}" font-weight="700"${tracking}>${safe}</text>
</svg>`;
}

function buildLetterOgSvg(letter: string, ink: BrandMarkInk): string {
  const safe = escapeXml(letter);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" viewBox="0 0 ${PORTAL_OG_WIDTH} ${PORTAL_OG_HEIGHT}">
  <rect width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" fill="#0a0a0a"/>
  <defs>
    <linearGradient id="brand-letter-og" x1="0" y1="${PORTAL_OG_HEIGHT}" x2="${PORTAL_OG_WIDTH}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${ink.from}"/>
      <stop offset="100%" stop-color="${ink.to}"/>
    </linearGradient>
  </defs>
  <text x="600" y="340" text-anchor="middle" dominant-baseline="middle" fill="url(#brand-letter-og)" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="280" font-weight="700">${safe}</text>
</svg>`;
}

async function composeSquareOnOgCanvas(markBuf: Buffer): Promise<Buffer> {
  const innerW = Math.round(PORTAL_OG_WIDTH * (1 - OG_LOGO_INSET * 2));
  const innerH = Math.round(PORTAL_OG_HEIGHT * (1 - OG_LOGO_INSET * 2));

  const logo = await sharp(markBuf)
    .rotate()
    .resize(innerW, innerH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const { width = innerW, height = innerH } = await sharp(logo).metadata();
  const left = Math.round((PORTAL_OG_WIDTH - width) / 2);
  const top = Math.round((PORTAL_OG_HEIGHT - height) / 2);

  return sharp({
    create: {
      width: PORTAL_OG_WIDTH,
      height: PORTAL_OG_HEIGHT,
      channels: 3,
      background: OG_BG,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer();
}

export async function renderBrandMarkSquarePng(
  sources: BrandMarkSource[],
  letter: string,
  size: number,
  opts?: { transparent?: boolean; fit?: 'cover' | 'contain'; stored?: StoredCompanyConfig | null },
): Promise<Buffer> {
  const fit = opts?.fit ?? 'cover';
  const transparent = opts?.transparent ?? false;
  const ink = brandMarkInk(opts?.stored ?? null, transparent ? 'light' : 'dark');
  for (const source of sources) {
    const prepared =
      source.kind === 'svg' && !transparent
        ? { ...source, svg: withSvgFill(source.svg, ink.from) }
        : source;
    const png = await rasterizeSource(prepared, size, fit);
    if (!png) continue;
    const usable = await prepareFaviconMark(png, size, transparent);
    if (usable) return usable;
  }
  const svg = buildLetterSvg(letter, size, transparent, ink);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderCompanyBrandIconPng(
  stored: StoredCompanyConfig | null,
  size: number,
  opts?: { transparent?: boolean },
): Promise<Buffer> {
  const letter = brandMarkLetter(stored?.name ?? '');
  const sources = collectBrandMarkSources(stored);
  return renderBrandMarkSquarePng(sources, letter, size, { ...opts, stored });
}

/** Square icon for QR / compact marks: SVG → uploaded icon → initials. */
export async function renderCompanyIconMarkPng(
  stored: StoredCompanyConfig | null,
  size: number,
  opts?: { transparent?: boolean; fit?: 'cover' | 'contain' },
): Promise<Buffer> {
  const initials = brandMarkInitials(stored?.name ?? '');
  return renderBrandMarkSquarePng(collectCompanyIconSources(stored), initials, size, {
    fit: opts?.fit ?? 'contain',
    transparent: opts?.transparent ?? false,
    stored,
  });
}

async function renderUploadedOgPng(dataBase64: string): Promise<Buffer | null> {
  try {
    return await sharp(Buffer.from(dataBase64, 'base64'))
      .rotate()
      .resize(PORTAL_OG_WIDTH, PORTAL_OG_HEIGHT, {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

export async function buildCompanyOgPng(stored: StoredCompanyConfig | null): Promise<Buffer> {
  if (stored?.ogData) {
    const uploaded = await renderUploadedOgPng(stored.ogData);
    if (uploaded) return uploaded;
  }

  const letter = brandMarkLetter(stored?.name ?? '');
  const sources = collectBrandMarkSources(stored);
  const markSize = 512;

  for (const source of sources) {
    const png = await rasterizeSource(source, markSize, 'contain');
    if (png) return composeSquareOnOgCanvas(png);
  }

  return sharp(Buffer.from(buildLetterOgSvg(letter, brandMarkInk(stored, 'dark'))))
    .resize(PORTAL_OG_WIDTH, PORTAL_OG_HEIGHT)
    .png()
    .toBuffer();
}

/** HTTP ETag values must be ASCII — hash display names that may contain Unicode (e.g. reΛVe.app). */
function brandingNameTag(name: string): string {
  return createHash('sha256').update(name, 'utf8').digest('base64url').slice(0, 12);
}

export function brandingEtag(
  stored: StoredCompanyConfig | null,
  size: number,
  kind: 'icon' | 'og' | 'logo' = 'icon',
  opts?: { transparent?: boolean },
): string {
  const updated = stored?.updatedAt ?? '0';
  const flags = [
    stored?.iconData ? 'i' : '',
    stored?.iconSvg?.trim() ? 'I' : '',
    stored?.logoData ? 'l' : '',
    stored?.logoSvg?.trim() ? 'L' : '',
    stored?.ogData ? 'o' : '',
    opts?.transparent ? 't' : '',
  ].join('');
  const nameTag = brandingNameTag(stored?.name ?? '');
  const colors = [brandHex(stored?.brandPrimary) ?? '', brandHex(stored?.brandSecondary) ?? ''].join(':');
  return `${updated}:${flags}:${nameTag}:${kind}:${size}:${BRAND_ICON_RENDER}:${colors}`;
}
