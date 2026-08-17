/**
 * GET    /api/admin/media/[id] — serve bytes (optional ?thumb=1 for images/PDFs)
 * DELETE /api/admin/media/[id] — remove from library
 */

import type { APIContext } from 'astro';
import { projectFileResponseHeaders, storeDeleteMedia, storeGetMediaByRef } from '../../../../lib/mediaLibrary';
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

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = (context.params.id ?? '').trim();
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  const ok = await storeDeleteMedia(id);
  if (!ok) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true });
}
