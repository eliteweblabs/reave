import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { readPublicBrandingFile } from '../../lib/publicBranding';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const file = readPublicBrandingFile('logo.alt.png');
  if (!file) {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${createHash('sha256').update(file.data).digest('base64url').slice(0, 16)}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mediaType,
      'Cache-Control': 'public, max-age=3600',
      ETag: etag,
    },
  });
};
