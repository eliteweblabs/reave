import type { APIContext } from 'astro';
import {
  clearClientPortalIcon,
  getClientPortalIconBlob,
  setClientPortalIcon,
} from '../../../../lib/clientBranding';
import { isLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from '../../../../lib/companyLogo';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

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
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ error: 'Not found' }, 404);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('icon');
  if (!(file instanceof File) || !file.size) {
    return json({ error: 'Missing icon file' }, 400);
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!isLogoUploadMediaType(mediaType)) {
    return json({ error: 'Icon must be PNG, JPEG, or WebP' }, 400);
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return json({ error: 'Icon too large (max 2 MB)' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await setClientPortalIcon(uid, {
    dataBase64: buffer.toString('base64'),
    mediaType,
  });
  if (!saved.ok) return json({ error: saved.error || 'Failed to save icon' }, 500);

  return json({ ok: true, iconUrl: saved.iconUrl });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return json({ error: 'Not found' }, 404);

  const cleared = await clearClientPortalIcon(uid);
  if (!cleared.ok) return json({ error: cleared.error || 'Failed to remove icon' }, 500);

  return json({ ok: true, iconUrl: cleared.iconUrl });
}
