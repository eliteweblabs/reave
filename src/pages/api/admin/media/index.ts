/**
 * GET  /api/admin/media — list library items
 * POST /api/admin/media — upload (multipart form field: file)
 */

import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { inferLogoUploadMediaType } from '../../../../lib/companyLogo';
import {
  isMediaLibraryMediaType,
  MEDIA_LIBRARY_MAX_BYTES,
  storeAddMedia,
  storeListMedia,
} from '../../../../lib/mediaLibrary';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;


function inferMediaLibraryType(file: Pick<File, 'type' | 'name'>): string | null {
  const type = file.type.trim().toLowerCase();
  if (isMediaLibraryMediaType(type)) return type;
  const logoType = inferLogoUploadMediaType(file);
  if (logoType) return logoType;
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return null;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const limitRaw = context.url.searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 200;
  const items = await storeListMedia(Number.isFinite(limit) ? limit : 200);
  return json({ ok: true, items, count: items.length });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

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

  const altText = form.get('altText');
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await storeAddMedia({
    filename: file.name.trim() || undefined,
    mediaType,
    dataBase64: buffer.toString('base64'),
    altText: typeof altText === 'string' ? altText : null,
    uploadedBy: userId,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, item: result.item });
}
