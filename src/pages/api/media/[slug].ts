/**
 * GET /api/media/[slug] — public bytes for a library item (slug or UUID).
 * Used by marketing pages so company images are not committed to git.
 */

import type { APIContext } from 'astro';
import { projectFileResponseHeaders, storeGetMediaByRef } from '../../../lib/mediaLibrary';
import { mediaLibraryThumbnail } from '../../../lib/mediaThumbnail';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const slug = (context.params.slug ?? '').trim();
  if (!slug) return new Response('Not found', { status: 404 });

  const record = await storeGetMediaByRef(slug);
  if (!record) return new Response('Not found', { status: 404 });

  const thumb = context.url.searchParams.get('thumb') === '1';
  const { body, mediaType } = await mediaLibraryThumbnail(record, thumb);

  const etag = `"${record.slug || record.id}:${record.sizeBytes}:${thumb ? 't2' : 'f'}"`;
  if (context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers = projectFileResponseHeaders(mediaType, record.filename, body.length);
  headers.ETag = etag;
  headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=604800';
  headers['Content-Length'] = String(body.length);

  return new Response(new Uint8Array(body), { headers });
}
