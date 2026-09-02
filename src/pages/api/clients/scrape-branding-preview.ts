/**
 * POST /api/clients/scrape-branding-preview — fetch logo/icon/tagline from a URL
 * without a saved contact (New Contact form preview).
 */

import type { APIContext } from 'astro';
import { fetchClientBrandFromWebsite, normalizeClientWebsiteInput } from '../../../lib/clientBrand';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

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

  const brand = await fetchClientBrandFromWebsite(website);
  if (!brand?.logoUrl && !brand?.iconUrl && !brand?.tagline) {
    return jsonResponse(
      { ok: false, error: `Couldn't find branding on ${website}.` },
      404,
    );
  }

  return jsonResponse({
    ok: true,
    website: brand.website || website,
    logoUrl: brand.logoUrl || '',
    iconUrl: brand.iconUrl || '',
    tagline: brand.tagline || '',
  });
}
