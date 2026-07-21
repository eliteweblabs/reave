import type { APIRoute } from 'astro';
import { getStoredCompanyIcon } from '../../../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const icon = await getStoredCompanyIcon();
  if (!icon) {
    return new Response('Not found', { status: 404 });
  }

  const bytes = Buffer.from(icon.dataBase64, 'base64');
  const etag = icon.updatedAt ? `"${icon.updatedAt}"` : undefined;
  if (etag && request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers: Record<string, string> = {
    'Content-Type': icon.mediaType,
    'Cache-Control': 'public, max-age=3600',
  };
  if (etag) headers.ETag = etag;

  return new Response(bytes, { headers });
};
