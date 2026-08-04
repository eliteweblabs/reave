/**
 * GET    /api/admin/media/[id] — serve bytes (optional ?thumb=1 for images)
 * DELETE /api/admin/media/[id] — remove from library
 */

import type { APIContext } from 'astro';
import sharp from 'sharp';
import {
  isMediaLibraryImageType,
  projectFileResponseHeaders,
  storeDeleteMedia,
  storeGetMedia,
} from '../../../../lib/mediaLibrary';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

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
  const id = (context.params.id ?? '').trim();
  if (!id) return new Response('Not found', { status: 404 });

  const record = await storeGetMedia(id);
  if (!record) return new Response('Not found', { status: 404 });

  const thumb = context.url.searchParams.get('thumb') === '1';
  const body = await maybeThumbnail(record, thumb);
  const mediaType =
    thumb && isMediaLibraryImageType(record.mediaType) && record.mediaType !== 'image/svg+xml'
      ? 'image/jpeg'
      : record.mediaType;

  const etag = `"${record.createdAt}:${record.sizeBytes}:${thumb ? 't' : 'f'}"`;
  if (context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers = projectFileResponseHeaders(mediaType, record.filename, body.length);
  headers.ETag = etag;
  headers['Cache-Control'] = 'private, max-age=3600';
  headers['Content-Length'] = String(body.length);

  return new Response(new Uint8Array(body), { headers });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = (context.params.id ?? '').trim();
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  const ok = await storeDeleteMedia(id);
  if (!ok) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true });
}
