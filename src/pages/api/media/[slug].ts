/**
 * GET /api/media/[slug] — public bytes for a library item (slug or UUID).
 * Used by marketing pages so company images are not committed to git.
 */

import type { APIContext } from 'astro';
import sharp from 'sharp';
import {
  isMediaLibraryImageType,
  projectFileResponseHeaders,
  storeGetMediaByRef,
} from '../../../lib/mediaLibrary';

export const prerender = false;

const THUMB_SIZE = 256;

async function maybeThumbnail(
  record: { mediaType: string; dataBase64: string },
  thumb: boolean,
): Promise<Buffer> {
  const bytes = Buffer.from(record.dataBase64, 'base64');
  if (!thumb || !isMediaLibraryImageType(record.mediaType)) return bytes;
  if (record.mediaType === 'image/svg+xml') return bytes;
  try {
    return await sharp(bytes)
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return bytes;
  }
}

export async function GET(context: APIContext): Promise<Response> {
  const slug = (context.params.slug ?? '').trim();
  if (!slug) return new Response('Not found', { status: 404 });

  const record = await storeGetMediaByRef(slug);
  if (!record) return new Response('Not found', { status: 404 });

  const thumb = context.url.searchParams.get('thumb') === '1';
  const body = await maybeThumbnail(record, thumb);
  const mediaType =
    thumb && isMediaLibraryImageType(record.mediaType) && record.mediaType !== 'image/svg+xml'
      ? 'image/jpeg'
      : record.mediaType;

  const etag = `"${record.slug || record.id}:${record.sizeBytes}:${thumb ? 't' : 'f'}"`;
  if (context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers = projectFileResponseHeaders(mediaType, record.filename, body.length);
  headers.ETag = etag;
  headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=604800';
  headers['Content-Length'] = String(body.length);

  return new Response(new Uint8Array(body), { headers });
}
