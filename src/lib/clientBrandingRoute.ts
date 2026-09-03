/**
 * Shared GET/POST/DELETE handlers for per-client portal logo and icon assets.
 */
import type { APIContext } from 'astro';
import {
  clearClientPortalIcon,
  clearClientPortalLogo,
  getClientPortalIconBlob,
  getClientPortalLogoBlob,
  setClientPortalIcon,
  setClientPortalLogo,
} from './clientBranding';
import { isLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from './companyLogo';
import { archiveUploadToMediaLibrary } from './mediaLibrary';
import { requireDashboardUser } from './dashboardAuth';
import {
  adaptLogoContrast,
  type LogoBackgroundTone,
} from './logoContrastAdapt';
import { jsonResponse } from './apiResponse';

type BrandingKind = 'logo' | 'icon';

function parseLogoBackground(raw: string | null): LogoBackgroundTone | 'raw' {
  const v = (raw || 'raw').trim().toLowerCase();
  if (v === 'light' || v === 'dark' || v === 'raw') return v;
  return 'raw';
}

async function getBlob(kind: BrandingKind, uid: string) {
  return kind === 'logo' ? getClientPortalLogoBlob(uid) : getClientPortalIconBlob(uid);
}

async function setBlob(
  kind: BrandingKind,
  uid: string,
  input: { dataBase64: string; mediaType: string },
) {
  return kind === 'logo' ? setClientPortalLogo(uid, input) : setClientPortalIcon(uid, input);
}

async function clearBlob(kind: BrandingKind, uid: string) {
  return kind === 'logo' ? clearClientPortalLogo(uid) : clearClientPortalIcon(uid);
}

export async function clientBrandingAssetGet(
  context: APIContext,
  kind: BrandingKind,
): Promise<Response> {
  const uid = (context.params.uid ?? '').trim();
  if (!uid) return new Response('Not found', { status: 404 });

  const blob = await getBlob(kind, uid);
  if (!blob) return new Response('Not found', { status: 404 });

  const original = Buffer.from(blob.dataBase64, 'base64');
  let mediaType = blob.mediaType;
  let body: BodyInit = original;

  if (kind === 'logo') {
    const bg = parseLogoBackground(context.url.searchParams.get('bg'));
    if (bg !== 'raw') {
      const adapted = await adaptLogoContrast(original, bg);
      if (adapted.changed) {
        body = Buffer.from(adapted.buffer);
        mediaType = adapted.mediaType;
      }
    }
  }

  const adaptTag = kind === 'logo' ? parseLogoBackground(context.url.searchParams.get('bg')) : 'raw';
  const etag =
    kind === 'logo' && blob.updatedAt ? `"${blob.updatedAt}:${adaptTag}"` : blob.updatedAt ? `"${blob.updatedAt}"` : undefined;
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

export async function clientBrandingAssetPost(
  context: APIContext,
  kind: BrandingKind,
): Promise<Response> {
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

  const fieldName = kind;
  const file = form.get(fieldName);
  if (!(file instanceof File) || !file.size) {
    return jsonResponse({ error: `Missing ${fieldName} file` }, 400);
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!isLogoUploadMediaType(mediaType)) {
    return jsonResponse({ error: `${kind === 'logo' ? 'Logo' : 'Icon'} must be PNG, JPEG, or WebP` }, 400);
  }
  if (file.size > LOGO_UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: `${kind === 'logo' ? 'Logo' : 'Icon'} too large (max 2 MB)` }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await setBlob(kind, uid, {
    dataBase64: buffer.toString('base64'),
    mediaType,
  });
  if (!saved.ok) return jsonResponse({ error: saved.error || `Failed to save ${fieldName}` }, 500);

  await archiveUploadToMediaLibrary({
    filename: file.name.trim() || undefined,
    mediaType,
    dataBase64: buffer.toString('base64'),
    uploadedBy: userId,
  });

  const urlKey = kind === 'logo' ? 'logoUrl' : 'iconUrl';
  const urlValue = kind === 'logo'
    ? (saved as { ok: true; logoUrl: string }).logoUrl
    : (saved as { ok: true; iconUrl: string }).iconUrl;
  return jsonResponse({ ok: true, [urlKey]: urlValue });
}

export async function clientBrandingAssetDelete(
  context: APIContext,
  kind: BrandingKind,
): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const uid = (context.params.uid ?? '').trim();
  if (!uid) return jsonResponse({ error: 'Not found' }, 404);

  const cleared = await clearBlob(kind, uid);
  if (!cleared.ok) return jsonResponse({ error: cleared.error || `Failed to remove ${kind}` }, 500);

  const urlKey = kind === 'logo' ? 'logoUrl' : 'iconUrl';
  const urlValue = kind === 'logo'
    ? (cleared as { ok: true; logoUrl: string }).logoUrl
    : (cleared as { ok: true; iconUrl: string }).iconUrl;
  return jsonResponse({ ok: true, [urlKey]: urlValue });
}
