import type { APIContext } from 'astro';
import {
  clearClientPortalLogo,
  getClientPortalLogoBlob,
  setClientPortalLogo,
} from '../../../../lib/clientBranding';
import { isLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from '../../../../lib/companyLogo';
import { archiveUploadToMediaLibrary } from '../../../../lib/mediaLibrary';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  adaptLogoContrast,
  type LogoBackgroundTone,
} from '../../../../lib/logoContrastAdapt';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


function parseLogoBackground(raw: string | null): LogoBackgroundTone | 'raw' {
  // Default raw so light surfaces (email signatures) keep the original mark.
  // Portal/admin pass ?bg=dark via resolveClientLogoUrl.
  const v = (raw || 'raw').trim().toLowerCase();
  if (v === 'light' || v === 'dark' || v === 'raw') return v;
  return 'raw';
}

export async function GET(context: APIContext): Promise<Response> {
  const uid = (context.params.uid ?? '').trim();
  if (!uid) return new Response('Not found', { status: 404 });

  const logo = await getClientPortalLogoBlob(uid);
  if (!logo) return new Response('Not found', { status: 404 });

  const original = Buffer.from(logo.dataBase64, 'base64');
  let mediaType = logo.mediaType;
  let body: BodyInit = original;
  const bg = parseLogoBackground(context.url.searchParams.get('bg'));
  if (bg !== 'raw') {
    const adapted = await adaptLogoContrast(original, bg);
    if (adapted.changed) {
      // Copy into a fresh Buffer so Response accepts BodyInit under strict types.
      body = Buffer.from(adapted.buffer);
      mediaType = adapted.mediaType;
    }
  }

  const adaptTag = bg === 'raw' ? 'raw' : bg;
  const etag = logo.updatedAt ? `"${logo.updatedAt}:${adaptTag}"` : undefined;
  if (etag && context.request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304 });
  }

  const headers: Record<string, string> = {
    'Content-Type': mediaType,
    'Cache-Control': 'public, max-age=3600',
  };
  if (etag) headers.ETag = etag;

  return new Response(body, { headers });
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

  const file = form.get('logo');
  if (!(file instanceof File) || !file.size) {
    return jsonResponse({ error: 'Missing logo file' }, 400);
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!isLogoUploadMediaType(mediaType)) {
    return jsonResponse({ error: 'Logo must be PNG, JPEG, or WebP' }, 400);
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: 'Logo too large (max 2 MB)' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await setClientPortalLogo(uid, {
    dataBase64: buffer.toString('base64'),
    mediaType,
  });
  if (!saved.ok) return jsonResponse({ error: saved.error || 'Failed to save logo' }, 500);

  await archiveUploadToMediaLibrary({
    filename: file.name.trim() || undefined,
    mediaType,
    dataBase64: buffer.toString('base64'),
    uploadedBy: userId,
  });

  return jsonResponse({ ok: true, logoUrl: saved.logoUrl });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ error: 'Not found' }, 404);

  const cleared = await clearClientPortalLogo(uid);
  if (!cleared.ok) return jsonResponse({ error: cleared.error || 'Failed to remove logo' }, 500);

  return jsonResponse({ ok: true, logoUrl: cleared.logoUrl });
}
