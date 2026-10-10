import { PUBLIC_STATIC_IMMUTABLE } from './edgeCacheHeaders';
import { getCachedBrandingPng, setCachedBrandingPng } from './brandingPngCache';

const BRANDING_CACHE_VERSIONED = PUBLIC_STATIC_IMMUTABLE;
const BRANDING_CACHE_DEFAULT =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export function cacheControlForBrandingRequestUrl(url: string | URL): string {
  const href = typeof url === 'string' ? url : url.href;
  if (href.includes('v=')) return BRANDING_CACHE_VERSIONED;
  return BRANDING_CACHE_DEFAULT;
}

export async function resolveCachedBrandingPng(
  cacheKey: string,
  render: () => Promise<Buffer | null>,
): Promise<Buffer | null> {
  const hit = getCachedBrandingPng(cacheKey);
  if (hit) return hit;
  const body = await render();
  if (body?.length) setCachedBrandingPng(cacheKey, body);
  return body;
}

export function brandingPngHttpResponse(
  request: Request,
  requestUrl: URL,
  etagInner: string,
  body: Buffer,
): Response {
  const etag = `"${etagInner}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': cacheControlForBrandingRequestUrl(requestUrl),
      ETag: etag,
    },
  });
}
