import type { APIRoute } from 'astro';
import { BRAND_ICON_SIZES } from '../lib/brandIconRaster';
import { brandIconPngResponse } from '../lib/brandIconResponse';

export const prerender = false;

export const GET: APIRoute = async ({ request }) =>
  brandIconPngResponse(request, BRAND_ICON_SIZES.appleTouchIcon);
