/**
 * Root /favicon.ico — browsers auto-request this path.
 * Serves a 32×32 PNG generated from admin branding (PNG/SVG) or first letter.
 */
import type { APIRoute } from 'astro';
import { BRAND_ICON_SIZES } from '../lib/brandIconRaster';
import { brandIconPngResponse } from '../lib/brandIconResponse';

export const prerender = false;

export const GET: APIRoute = async ({ request }) =>
  brandIconPngResponse(request, BRAND_ICON_SIZES.png32);
