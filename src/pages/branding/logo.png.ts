import type { APIRoute } from 'astro';
import { brandingEtag, renderCompanyLogoWordmarkPng } from '../../lib/brandImageRender';
import { getStoredCompanyConfig } from '../../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const stored = await getStoredCompanyConfig();
  const body = await renderCompanyLogoWordmarkPng(stored);
  if (!body) {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${brandingEtag(stored, 256, 'logo')}"`;
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
