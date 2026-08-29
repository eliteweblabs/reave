/**
 * POST /api/admin/media/[id]/apply — copy a library item into branding slots.
 *
 * Body JSON: { target: 'company-logo' | 'company-icon' | 'company-og' | 'client-logo' | 'client-icon', uid?: string }
 */

import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../../lib/companyConfig';
import {
  setStoredCompanyConfig,
  setStoredCompanyIcon,
  setStoredCompanyLogo,
  setStoredCompanyOg,
} from '../../../../../lib/companyConfigStore';
import {
  setClientPortalIcon,
  setClientPortalLogo,
} from '../../../../../lib/clientBranding';
import {
  brandingBlobFromMedia,
  storeGetMedia,
} from '../../../../../lib/mediaLibrary';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;

type ApplyTarget = 'company-logo' | 'company-icon' | 'company-og' | 'client-logo' | 'client-icon';


function parseTarget(raw: unknown): ApplyTarget | null {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (
    t === 'company-logo' ||
    t === 'company-icon' ||
    t === 'company-og' ||
    t === 'client-logo' ||
    t === 'client-icon'
  ) {
    return t;
  }
  return null;
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = (context.params.id ?? '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  let body: { target?: unknown; uid?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Expected JSON body' }, 400);
  }

  const target = parseTarget(body.target);
  if (!target) {
    return jsonResponse({ ok: false, error: 'Invalid target' }, 400);
  }

  const record = await storeGetMedia(id);
  if (!record) return jsonResponse({ ok: false, error: 'Media not found' }, 404);

  const blob = brandingBlobFromMedia(record);
  if (!blob.ok) return jsonResponse({ ok: false, error: blob.error }, 400);

  if (target === 'company-logo') {
    const ok =
      blob.kind === 'svg'
        ? await setStoredCompanyConfig({
            logoSvg: blob.svg,
            logoData: null,
            logoMediaType: null,
            logoPath: null,
          })
        : await setStoredCompanyLogo({
            dataBase64: blob.dataBase64,
            mediaType: blob.mediaType,
          });
    if (!ok) return jsonResponse({ ok: false, error: 'Failed to apply logo' }, 500);
    const company = await getCompanyConfig(context.request);
    return jsonResponse({ ok: true, company });
  }

  if (target === 'company-icon') {
    const ok =
      blob.kind === 'svg'
        ? await setStoredCompanyConfig({
            iconSvg: blob.svg,
            iconData: null,
            iconMediaType: null,
            iconPath: null,
          })
        : await setStoredCompanyIcon({
            dataBase64: blob.dataBase64,
            mediaType: blob.mediaType,
          });
    if (!ok) return jsonResponse({ ok: false, error: 'Failed to apply icon' }, 500);
    const company = await getCompanyConfig(context.request);
    return jsonResponse({ ok: true, company });
  }

  if (target === 'company-og') {
    if (blob.kind === 'svg') {
      return jsonResponse({ ok: false, error: 'Share image must be PNG, JPEG, or WebP (1200×630 recommended).' }, 400);
    }
    const ok = await setStoredCompanyOg({
      dataBase64: blob.dataBase64,
      mediaType: blob.mediaType,
    });
    if (!ok) return jsonResponse({ ok: false, error: 'Failed to apply share image' }, 500);
    const company = await getCompanyConfig(context.request);
    return jsonResponse({ ok: true, company });
  }

  if (blob.kind === 'svg') {
    return jsonResponse({ ok: false, error: 'Client branding requires PNG, JPEG, or WebP' }, 400);
  }

  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  if (!uid) return jsonResponse({ ok: false, error: 'Missing client uid' }, 400);

  if (target === 'client-logo') {
    const saved = await setClientPortalLogo(uid, {
      dataBase64: blob.dataBase64,
      mediaType: blob.mediaType,
    });
    if (!saved.ok) return jsonResponse({ ok: false, error: saved.error || 'Failed to apply logo' }, 500);
    return jsonResponse({ ok: true, logoUrl: saved.logoUrl });
  }

  const saved = await setClientPortalIcon(uid, {
    dataBase64: blob.dataBase64,
    mediaType: blob.mediaType,
  });
  if (!saved.ok) return jsonResponse({ ok: false, error: saved.error || 'Failed to apply icon' }, 500);
  return jsonResponse({ ok: true, iconUrl: saved.iconUrl });
}
