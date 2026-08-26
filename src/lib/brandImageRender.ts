/**
 * Resolve admin branding (PNG uploads + pasted SVG) into raster PNGs for
 * favicons, PWA icons, OG cards, and avatars. Falls back to the first letter
 * of the company display name when no mark is configured.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { SITE } from '../config/site';
import { sanitizeInlineSvg, resolveSvgAssetUrls } from './brandSvg';
import { rasterizeBrandIcon } from './brandIconRaster';
import type { StoredCompanyConfig } from './companyConfigStore';
import { OG_IMAGE_HEIGHT as PORTAL_OG_HEIGHT, OG_IMAGE_WIDTH as PORTAL_OG_WIDTH } from './ogImageSize';
import { punchSolidNeutralBackground } from './logoContrastAdapt';
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

/** Icon PNG → icon SVG → logo PNG → logo SVG. */
export function collectBrandMarkSources(stored: StoredCompanyConfig | null): BrandMarkSource[] {
  const sources: BrandMarkSource[] = [];
  if (!stored) return sources;
  pushRaster(sources, stored.iconData, stored.iconMediaType);
  pushSvg(sources, stored.iconSvg);
  pushRaster(sources, stored.logoData, stored.logoMediaType);
  pushSvg(sources, stored.logoSvg);
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

function buildLetterSvg(letter: string, size: number, transparent: boolean): string {
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
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e4e4e7"/>
    </linearGradient>
  </defs>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="url(#brand-letter)" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="${fontSize}" font-weight="700"${tracking}>${safe}</text>
</svg>`;
}

function buildLetterOgSvg(letter: string): string {
  const safe = escapeXml(letter);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" viewBox="0 0 ${PORTAL_OG_WIDTH} ${PORTAL_OG_HEIGHT}">
  <rect width="${PORTAL_OG_WIDTH}" height="${PORTAL_OG_HEIGHT}" fill="#0a0a0a"/>
  <defs>
    <linearGradient id="brand-letter-og" x1="0" y1="${PORTAL_OG_HEIGHT}" x2="${PORTAL_OG_WIDTH}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e4e4e7"/>
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
  opts?: { transparent?: boolean; fit?: 'cover' | 'contain' },
): Promise<Buffer> {
  const fit = opts?.fit ?? 'cover';
  const transparent = opts?.transparent ?? false;
  for (const source of sources) {
    const png = await rasterizeSource(source, size, fit);
    if (png) return transparent ? punchSolidNeutralBackground(png) : png;
  }
  const svg = buildLetterSvg(letter, size, transparent);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderCompanyBrandIconPng(
  stored: StoredCompanyConfig | null,
  size: number,
  opts?: { transparent?: boolean },
): Promise<Buffer> {
  const letter = brandMarkLetter(stored?.name ?? '');
  const sources = collectBrandMarkSources(stored);
  return renderBrandMarkSquarePng(sources, letter, size, opts);
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

  return sharp(Buffer.from(buildLetterOgSvg(letter)))
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
  return `${updated}:${flags}:${nameTag}:${kind}:${size}`;
}
