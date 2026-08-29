import { brandingEtag, renderCompanyBrandIconPng } from './brandImageRender';
import { getStoredCompanyConfig } from './companyConfigStore';

const ICON_CACHE = 'public, max-age=3600';

/** Rasterize the admin mark (or letter fallback) as a PNG response. */
export async function brandIconPngResponse(
  request: Request,
  size: number,
  opts?: { transparent?: boolean },
): Promise<Response> {
  const stored = await getStoredCompanyConfig();
  const body = await renderCompanyBrandIconPng(stored, size, opts);
  const etag = `"${brandingEtag(stored, size, 'icon', opts)}"`;

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': ICON_CACHE,
      ETag: etag,
    },
  });
}
