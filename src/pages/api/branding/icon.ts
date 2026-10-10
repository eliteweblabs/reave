import type { APIRoute } from 'astro';
import {
  BRAND_ICON_SIZES,
  isBrandIconSize,
} from '../../../lib/brandIconRaster';
import { brandIconPngResponse } from '../../../lib/brandIconResponse';

export const prerender = false;

function parseSize(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (isBrandIconSize(n)) return n;
  return BRAND_ICON_SIZES.png192;
}

export const GET: APIRoute = async ({ request, url }) => {
  const size = parseSize(url.searchParams.get('size'));
  const transparent = url.searchParams.get('transparent') === '1';
  return brandIconPngResponse(request, size, { transparent, requestUrl: url });
};
