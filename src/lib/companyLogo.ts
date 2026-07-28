/** Public URL for uploaded company logos (served from Postgres / local config). */
export const BRANDING_LOGO_PATH = '/api/branding/logo';

/** Square brand mark for Open Graph / Twitter cards — safe to replace without touching favicons or the header logo. */
export const LOGO_ICON_OG_PATH = '/logo-icon-og.png';

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
