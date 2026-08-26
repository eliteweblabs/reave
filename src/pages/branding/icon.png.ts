import type { APIRoute } from 'astro';
import { BRAND_ICON_SIZES } from '../../lib/brandIconRaster';
import { brandingEtag, collectBrandMarkSources, renderCompanyBrandIconPng } from '../../lib/brandImageRender';
import { getStoredCompanyConfig } from '../../lib/companyConfigStore';
import { readPublicBrandingFile } from '../../lib/publicBranding';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const stored = await getStoredCompanyConfig();
  const hasMark = collectBrandMarkSources(stored).length > 0;
  const disk = hasMark ? null : readPublicBrandingFile('icon.png');
  const body = disk?.data ?? (await renderCompanyBrandIconPng(stored, BRAND_ICON_SIZES.png192));
  const etag = `"${brandingEtag(stored, BRAND_ICON_SIZES.png192, 'icon')}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  });
};
