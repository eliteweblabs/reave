/**
 * GET  /api/admin/media — list library items
 * POST /api/admin/media — upload (multipart form field: file)
 */

import type { APIContext } from 'astro';
import {
  inferMediaLibraryType,
  MEDIA_LIBRARY_MAX_BYTES,
  storeAddMedia,
  storeListMedia,
} from '../../../../lib/mediaLibrary';
import { mediaDropFolderInfo } from '../../../../lib/mediaWebdav/auth';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const limitRaw = context.url.searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 200;
  const items = await storeListMedia(Number.isFinite(limit) ? limit : 200);
  return jsonResponse({
    ok: true,
    items,
    count: items.length,
    dropFolder: mediaDropFolderInfo(context.request),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return jsonResponse({ ok: false, error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || !file.size) {
    return jsonResponse({ ok: false, error: 'Missing file' }, 400);
  }

  const mediaType = inferMediaLibraryType(file);
  if (!mediaType) {
    return jsonResponse({ ok: false, error: 'File must be an image (JPEG, PNG, GIF, WebP, SVG) or PDF' }, 400);
  }
  if (file.size > MEDIA_LIBRARY_MAX_BYTES) {
    return jsonResponse(
      { ok: false, error: `File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)` },
      400,
    );
  }

  const altText = form.get('altText');
  const slugField = form.get('slug');
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await storeAddMedia({
    filename: file.name.trim() || undefined,
    mediaType,
    dataBase64: buffer.toString('base64'),
    altText: typeof altText === 'string' ? altText : null,
    uploadedBy: userId,
    slug: typeof slugField === 'string' ? slugField : null,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, item: result.item });
}
