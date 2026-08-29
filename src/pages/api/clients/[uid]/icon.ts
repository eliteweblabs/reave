import type { APIContext } from 'astro';
import {
  clearClientPortalIcon,
  getClientPortalIconBlob,
  setClientPortalIcon,
} from '../../../../lib/clientBranding';
import { isLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from '../../../../lib/companyLogo';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const uid = (context.params.uid ?? '').trim();
  if (!uid) return new Response('Not found', { status: 404 });

  const icon = await getClientPortalIconBlob(uid);
  if (!icon) return new Response('Not found', { status: 404 });

  const bytes = Buffer.from(icon.dataBase64, 'base64');
  const etag = icon.updatedAt ? `"${icon.updatedAt}"` : undefined;
  if (etag && context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers: Record<string, string> = {
    'Content-Type': icon.mediaType,
    'Cache-Control': 'public, max-age=3600',
  };
  if (etag) headers.ETag = etag;

  return new Response(bytes, { headers });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ error: 'Not found' }, 404);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return jsonResponse({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('icon');
  if (!(file instanceof File) || !file.size) {
    return jsonResponse({ error: 'Missing icon file' }, 400);
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!isLogoUploadMediaType(mediaType)) {
    return jsonResponse({ error: 'Icon must be PNG, JPEG, or WebP' }, 400);
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: 'Icon too large (max 2 MB)' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await setClientPortalIcon(uid, {
    dataBase64: buffer.toString('base64'),
    mediaType,
  });
  if (!saved.ok) return jsonResponse({ error: saved.error || 'Failed to save icon' }, 500);

  return jsonResponse({ ok: true, iconUrl: saved.iconUrl });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ error: 'Not found' }, 404);

  const cleared = await clearClientPortalIcon(uid);
  if (!cleared.ok) return jsonResponse({ error: cleared.error || 'Failed to remove icon' }, 500);

  return jsonResponse({ ok: true, iconUrl: cleared.iconUrl });
}
