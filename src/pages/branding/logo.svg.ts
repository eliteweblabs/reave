import type { APIRoute } from 'astro';
import { brandingEtag, companyLogoSvgMarkup } from '../../lib/brandImageRender';
import { getStoredCompanyConfig } from '../../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const stored = await getStoredCompanyConfig();
  const svg = companyLogoSvgMarkup(stored);
  if (!svg) {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${brandingEtag(stored, 0, 'logo')}-svg"`;
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
