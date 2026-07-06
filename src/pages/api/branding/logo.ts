import type { APIRoute } from 'astro';
import { getStoredCompanyLogo } from '../../../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const logo = await getStoredCompanyLogo();
  if (!logo) {
    return new Response('Not found', { status: 404 });
  }

  const bytes = Buffer.from(logo.dataBase64, 'base64');
  const etag = logo.updatedAt ? `"${logo.updatedAt}"` : undefined;
  if (etag && request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers: Record<string, string> = {
    'Content-Type': logo.mediaType,
    'Cache-Control': 'public, max-age=3600',
  };
  if (etag) headers.ETag = etag;

  return new Response(bytes, { headers });
};
