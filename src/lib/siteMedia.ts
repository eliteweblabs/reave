/**
 * Resolve site-config image refs to public URLs.
 * A bare slug (about-office) becomes /api/media/about-office.
 * Absolute paths and http(s) URLs pass through.
 */
import { mediaPublicUrl, normalizeMediaSlug } from './mediaLibrary';

export function siteMediaSrc(ref?: string | null): string {
  const value = (ref ?? '').trim();
  if (!value) return '';
  if (
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:')
  ) {
    return value;
  }
  const slug = normalizeMediaSlug(value);
  return slug ? mediaPublicUrl(slug) : '';
}
