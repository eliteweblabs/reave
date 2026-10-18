import type { APIRoute } from 'astro';
import { buildCompanyShareLogoOgPng, brandingEtag } from '../../../lib/brandImageRender';
import { getStoredCompanyConfig } from '../../../lib/companyConfigStore';

export const prerender = false;

/** 1200×630 OG card from admin Company wordmark — used by Galene meet.* on boot. */
export const GET: APIRoute = async ({ request }) => {
  const stored = await getStoredCompanyConfig();
  const body = await buildCompanyShareLogoOgPng(stored);
  const etag = `"${brandingEtag(stored, 0, 'share-logo')}"`;

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
