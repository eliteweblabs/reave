/**
 * POST /api/admin/media/[id]/apply — copy a library item into branding slots.
 *
 * Body JSON: { target: 'company-logo' | 'company-icon' | 'client-logo' | 'client-icon', uid?: string }
 */

import type { APIContext } from 'astro';
import { getCompanyConfig } from '../../../../../lib/companyConfig';
import {
  setStoredCompanyIcon,
  setStoredCompanyLogo,
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

export const prerender = false;

type ApplyTarget = 'company-logo' | 'company-icon' | 'client-logo' | 'client-icon';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseTarget(raw: unknown): ApplyTarget | null {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (
    t === 'company-logo' ||
    t === 'company-icon' ||
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
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  let body: { target?: unknown; uid?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Expected JSON body' }, 400);
  }

  const target = parseTarget(body.target);
  if (!target) {
    return json({ ok: false, error: 'Invalid target' }, 400);
  }

  const record = await storeGetMedia(id);
  if (!record) return json({ ok: false, error: 'Media not found' }, 404);

  const blob = brandingBlobFromMedia(record);
  if (!blob.ok) return json({ ok: false, error: blob.error }, 400);

  if (target === 'company-logo') {
    const ok = await setStoredCompanyLogo({
      dataBase64: blob.dataBase64,
      mediaType: blob.mediaType,
    });
    if (!ok) return json({ ok: false, error: 'Failed to apply logo' }, 500);
    const company = await getCompanyConfig(context.request);
    return json({ ok: true, company });
  }

  if (target === 'company-icon') {
    const ok = await setStoredCompanyIcon({
      dataBase64: blob.dataBase64,
      mediaType: blob.mediaType,
    });
    if (!ok) return json({ ok: false, error: 'Failed to apply icon' }, 500);
    const company = await getCompanyConfig(context.request);
    return json({ ok: true, company });
  }

  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  if (!uid) return json({ ok: false, error: 'Missing client uid' }, 400);

  if (target === 'client-logo') {
    const saved = await setClientPortalLogo(uid, {
      dataBase64: blob.dataBase64,
      mediaType: blob.mediaType,
    });
    if (!saved.ok) return json({ ok: false, error: saved.error || 'Failed to apply logo' }, 500);
    return json({ ok: true, logoUrl: saved.logoUrl });
  }

  const saved = await setClientPortalIcon(uid, {
    dataBase64: blob.dataBase64,
    mediaType: blob.mediaType,
  });
  if (!saved.ok) return json({ ok: false, error: saved.error || 'Failed to apply icon' }, 500);
  return json({ ok: true, iconUrl: saved.iconUrl });
}
