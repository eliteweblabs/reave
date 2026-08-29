/**
 * /favicon.svg — tab icon from the admin mark (dark tile + ink).
 * New well-known path so browsers drop a cached /favicon.ico letter tile.
 */
import type { APIRoute } from 'astro';
import { brandingEtag, companyFaviconSvgMarkup } from '../lib/brandImageRender';
import { getStoredCompanyConfig } from '../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const stored = await getStoredCompanyConfig();
  const svg = companyFaviconSvgMarkup(stored);
  if (!svg) {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${brandingEtag(stored, 0, 'icon')}-favicon-svg"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  });
};
