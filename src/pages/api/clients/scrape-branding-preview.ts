/**
 * POST /api/clients/scrape-branding-preview — fetch logo/icon/tagline from a URL
 * without a saved contact (New Contact form preview).
 */

import type { APIContext } from 'astro';
import {
  fetchClientBrandFromWebsite,
  normalizeClientWebsiteInput,
  persistFetchedBrandAsset,
} from '../../../lib/clientBrand';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

type PreviewAsset = 'logo' | 'icon';

function parsePreviewAsset(raw: unknown): PreviewAsset | null {
  if (raw === 'logo' || raw === 'icon') return raw;
  return null;
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const website = normalizeClientWebsiteInput(String(body.website ?? '').trim());
  if (!website) {
    return jsonResponse({ ok: false, error: 'website is required' }, 400);
  }

  const asset = parsePreviewAsset(body.asset);
  if (!asset) {
    return jsonResponse({ ok: false, error: 'asset must be logo or icon' }, 400);
  }

  const brand = await fetchClientBrandFromWebsite(website);
  const remoteUrl = asset === 'logo' ? brand?.logoUrl : brand?.iconUrl;
  if (!remoteUrl) {
    return jsonResponse(
      { ok: false, error: `Couldn't find an ${asset} on ${website}.` },
      404,
    );
  }

  const saved = await persistFetchedBrandAsset({
    website,
    remoteUrl,
    asset,
    uploadedBy: userId,
  });
  if (!saved.ok) return jsonResponse({ ok: false, error: saved.error }, 502);

  return jsonResponse({
    ok: true,
    website: brand?.website || website,
    mediaId: saved.mediaId,
    logoUrl: saved.logoUrl || '',
    iconUrl: saved.iconUrl || '',
    logoSource: saved.logoSource,
    iconSource: saved.iconSource,
    tagline: asset === 'logo' ? brand?.tagline || '' : '',
  });
}
