import type { APIRoute } from 'astro';
import { buildCompanyOgPng, brandingEtag } from '../../../lib/brandImageRender';
import { getStoredCompanyConfig } from '../../../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const stored = await getStoredCompanyConfig();
  const body = await buildCompanyOgPng(stored);
  const etag = `"${brandingEtag(stored, 0, 'og')}"`;

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
