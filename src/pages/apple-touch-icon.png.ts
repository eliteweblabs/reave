/**
 * Root /apple-touch-icon.png — Safari auto-requests this for favorites / Home Screen.
 * Serves a 180×180 PNG generated from admin branding (PNG/SVG) or first letter.
 */
import type { APIRoute } from 'astro';
import { BRAND_ICON_SIZES } from '../lib/brandIconRaster';
import { brandingEtag, renderCompanyBrandIconPng } from '../lib/brandImageRender';
import { getStoredCompanyConfig } from '../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const size = BRAND_ICON_SIZES.appleTouchIcon;
  const stored = await getStoredCompanyConfig();
  const body = await renderCompanyBrandIconPng(stored, size);
  const etag = `"${brandingEtag(stored, size, 'icon')}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  });
};
