/**
 * GET    /api/admin/media/[id] — serve bytes (optional ?thumb=1 for images/PDFs)
 * PUT    /api/admin/media/[id] — replace bytes (multipart form field: file)
 * DELETE /api/admin/media/[id] — remove from library
 */

import type { APIContext } from 'astro';
import {
  inferMediaLibraryType,
  MEDIA_LIBRARY_MAX_BYTES,
  projectFileResponseHeaders,
  storeDeleteMedia,
  storeGetMediaByRef,
  storeUpdateMedia,
} from '../../../../lib/mediaLibrary';
import { mediaLibraryThumbnail } from '../../../../lib/mediaThumbnail';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const id = (context.params.id ?? '').trim();
  if (!id) return new Response('Not found', { status: 404 });

  const record = await storeGetMediaByRef(id);
  if (!record) return new Response('Not found', { status: 404 });

  const thumb = context.url.searchParams.get('thumb') === '1';
  const { body, mediaType } = await mediaLibraryThumbnail(record, thumb);

  const etag = `"${record.createdAt}:${record.sizeBytes}:${thumb ? 't2' : 'f'}"`;
  if (context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers = projectFileResponseHeaders(mediaType, record.filename, body.length);
  headers.ETag = etag;
  headers['Cache-Control'] = 'private, max-age=3600';
  headers['Content-Length'] = String(body.length);

  return new Response(new Uint8Array(body), { headers });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = (context.params.id ?? '').trim();
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ ok: false, error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || !file.size) {
    return json({ ok: false, error: 'Missing file' }, 400);
  }

  const mediaType = inferMediaLibraryType(file);
  if (!mediaType) {
    return json({ ok: false, error: 'File must be an image (JPEG, PNG, GIF, WebP, SVG) or PDF' }, 400);
  }
  if (file.size > MEDIA_LIBRARY_MAX_BYTES) {
    return json(
      { ok: false, error: `File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)` },
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await storeUpdateMedia(id, {
    mediaType,
    dataBase64: buffer.toString('base64'),
    filename: file.name.trim() || undefined,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.error === 'Not found' ? 404 : 400);
  return json({ ok: true, item: result.item });
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
