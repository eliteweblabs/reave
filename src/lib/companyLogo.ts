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
