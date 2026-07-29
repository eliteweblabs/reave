/**
 * Root /favicon.ico — browsers auto-request this path.
 * Serves a 32×32 PNG generated from the admin icon (or default AV mark).
 */
import type { APIRoute } from 'astro';
import { BRAND_ICON_SIZES, rasterizeBrandIcon, readDefaultBrandIcon } from '../lib/brandIconRaster';
import { getStoredCompanyIcon } from '../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const size = BRAND_ICON_SIZES.png32;
  const icon = await getStoredCompanyIcon();

  let body: Buffer;
  let etagSource: string;

  if (icon) {
    const source = Buffer.from(icon.dataBase64, 'base64');
    body = await rasterizeBrandIcon(source, size);
    etagSource = `${icon.updatedAt ?? '0'}:ico`;
  } else {
    body = await readDefaultBrandIcon(size);
    etagSource = 'default:ico';
  }

  const etag = `"${etagSource}"`;
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
