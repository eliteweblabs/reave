import { BRAND_SVG_MAX_CHARS, sanitizeInlineSvg } from './brandSvg';

/** Public URL for uploaded company logos (served from Postgres / local config). */
export const BRANDING_LOGO_PATH = '/api/branding/logo';

/** Static OG fallback when a GIF URL is unsuitable for link previews. */
export const LOGO_ICON_OG_PATH = '/logo-icon-og.png';

/** Runtime OG image — admin icon/logo PNG or SVG, or first letter of company name. */
export const BRANDING_OG_PATH = '/api/branding/og.png';

/** Transparent AV mark for header profile icon and staff comment avatars. */
export const LOGO_ICON_AVATAR_PATH = '/logo-icon-avatar.png';

/** Public URL for uploaded square brand icons (favicons, avatars, PWA). */
export const BRANDING_ICON_PATH = '/api/branding/icon';

export const LOGO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export const LOGO_UPLOAD_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function isLogoUploadMediaType(type: string): boolean {
  return LOGO_UPLOAD_MEDIA_TYPES.has(type.trim().toLowerCase());
}

/** Some browsers omit file.type — infer from extension before rejecting uploads. */
export function inferLogoUploadMediaType(file: Pick<File, 'type' | 'name'>): string | null {
  const type = file.type.trim().toLowerCase();
  if (isLogoUploadMediaType(type)) return type;
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return null;
}

export function isBrandSvgUploadFile(file: Pick<File, 'type' | 'name'>): boolean {
  const type = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  return (
    type === 'image/svg+xml' ||
    type === 'text/xml' ||
    type === 'application/xml' ||
    name.endsWith('.svg')
  );
}

export type ParsedCompanyBrandUpload =
  | { ok: true; kind: 'raster'; mediaType: string; dataBase64: string }
  | { ok: true; kind: 'svg'; svg: string }
  | { ok: false; error: string };

/** Accept PNG/JPEG/WebP (max 2 MB) or SVG markup (max 200 KB) for logo/icon slots. */
export async function parseCompanyBrandUpload(
  file: Pick<File, 'type' | 'name' | 'size' | 'text' | 'arrayBuffer'>,
): Promise<ParsedCompanyBrandUpload> {
  if (isBrandSvgUploadFile(file)) {
    if (file.size > BRAND_SVG_MAX_CHARS) {
      return { ok: false, error: 'SVG too large (max 200 KB).' };
    }
    const svg = sanitizeInlineSvg((await file.text()).trim());
    if (!svg) {
      return { ok: false, error: 'File must contain valid <svg> markup (max 200 KB).' };
    }
    return { ok: true, kind: 'svg', svg };
  }

  const mediaType = inferLogoUploadMediaType(file);
  if (!mediaType) {
    return { ok: false, error: 'File must be PNG, JPEG, WebP, or SVG' };
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return { ok: false, error: 'Image too large (max 2 MB)' };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, kind: 'raster', mediaType, dataBase64: buffer.toString('base64') };
}

/** Static logo paths removed from /public but still stored in company config. */
const LEGACY_PUBLIC_LOGO_PATHS: Record<string, string> = {
  '/logo.png': '/reave-logo.png',
  '/reave-logo-1.png': '/reave-logo.png',
};

/** Map stale admin logo paths to current public assets (path only, no query). */
export function normalizePublicLogoPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  const base = trimmed.split('?')[0] ?? trimmed;
  return LEGACY_PUBLIC_LOGO_PATHS[base] ?? trimmed;
}
