/** Public URL for uploaded company logos (served from Postgres / local config). */
export const BRANDING_LOGO_PATH = '/api/branding/logo';

export const LOGO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export const LOGO_UPLOAD_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function isLogoUploadMediaType(type: string): boolean {
  return LOGO_UPLOAD_MEDIA_TYPES.has(type.trim().toLowerCase());
}
