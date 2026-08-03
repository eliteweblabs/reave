import type { APIRoute } from 'astro';
import {
  BRAND_ICON_SIZES,
  isBrandIconSize,
} from '../../../lib/brandIconRaster';
import { brandingEtag, renderCompanyBrandIconPng } from '../../../lib/brandImageRender';
import { getStoredCompanyConfig } from '../../../lib/companyConfigStore';

export const prerender = false;

function parseSize(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (isBrandIconSize(n)) return n;
  return BRAND_ICON_SIZES.png192;
}

export const GET: APIRoute = async ({ request, url }) => {
  const size = parseSize(url.searchParams.get('size'));
  const transparent = url.searchParams.get('transparent') === '1';
  const stored = await getStoredCompanyConfig();
  const body = await renderCompanyBrandIconPng(stored, size, { transparent });
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
