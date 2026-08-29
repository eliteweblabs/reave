/**
 * Shared GET handler for company logo wordmark PNG routes.
 * Used by /branding/logo.png and /api/branding/logo (legacy alias).
 */
import type { APIContext } from 'astro';
import { brandingEtag, renderCompanyLogoWordmarkPng } from './brandImageRender';
import { getStoredCompanyConfig } from './companyConfigStore';

export async function brandingLogoPngGet(context: APIContext): Promise<Response> {
  const { request } = context;
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
