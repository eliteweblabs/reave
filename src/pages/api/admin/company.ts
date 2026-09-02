import type { APIContext } from 'astro';
import {
  getCompanyConfig,
  normalizeCompanyInput,
  resolveCompanyAddressGeo,
  type CompanyConfigInput,
} from '../../../lib/companyConfig';
import { sanitizeInlineSvg } from '../../../lib/brandSvg';
import { normalizeBrandColorHex } from '../../../lib/companyBrandColors';
import { emailSafeFontCatalogForAdmin } from '../../../lib/emailSafeFonts';
import { brandFontCatalogForAdminAsync, mergeFontGoogleSpecs } from '../../../lib/googleFontsCatalog';
import { getStoredCompanyConfig, setStoredCompanyConfig } from '../../../lib/companyConfigStore';
import { invalidateOfficeCoordsCache } from '../../../lib/mapbox';
import {
  syncCalcomHoursFromReave,
  syncCalcomIdentityFromReave,
} from '../../../lib/calcomIdentitySync';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const company = await getCompanyConfig(context.request);
  const fontCatalog = await brandFontCatalogForAdminAsync();
  return jsonResponse({ ok: true, company, fontCatalog, emailFontCatalog: emailSafeFontCatalogForAdmin() });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: CompanyConfigInput;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (body.logoSvg !== undefined) {
    const t = (body.logoSvg ?? '').trim();
    if (t && !sanitizeInlineSvg(t)) {
      return jsonResponse({ error: 'Logo SVG must be valid <svg>…</svg> markup (max 200 KB).' }, 400);
    }
  }
  if (body.iconSvg !== undefined) {
    const t = (body.iconSvg ?? '').trim();
    if (t && !sanitizeInlineSvg(t)) {
      return jsonResponse({ error: 'Icon SVG must be valid <svg>…</svg> markup (max 200 KB).' }, 400);
    }
  }
  if (body.brandPrimary !== undefined && body.brandPrimary.trim() && !normalizeBrandColorHex(body.brandPrimary)) {
    return jsonResponse({ error: 'Primary color must be a valid hex value (e.g. #rrggbb).' }, 400);
  }
  if (body.brandSecondary !== undefined && body.brandSecondary.trim() && !normalizeBrandColorHex(body.brandSecondary)) {
    return jsonResponse({ error: 'Secondary color must be a valid hex value (e.g. #rrggbb).' }, 400);
  }
  if (body.iconBackground !== undefined && body.iconBackground.trim() && !normalizeBrandColorHex(body.iconBackground)) {
    return jsonResponse({ error: 'Icon background must be a valid hex value (e.g. #rrggbb).' }, 400);
  }

  delete body.domain;
  const stored = normalizeCompanyInput(body);
  const existing = await getStoredCompanyConfig();
  if (body.address !== undefined || body.geo !== undefined) {
    if (body.address !== undefined) {
      stored.address = (body.address ?? '').trim() || null;
      stored.geo = stored.address
        ? await resolveCompanyAddressGeo(stored.address, body.geo, existing?.address)
        : null;
    } else if (body.geo !== undefined) {
      stored.geo = body.geo
        ? {
            lat: body.geo.lat,
            lng: body.geo.lng,
            placeId: body.geo.placeId || null,
            geocodedAt: body.geo.geocodedAt || new Date().toISOString(),
          }
        : null;
    }
  }

  const fontGoogleSpecs = await mergeFontGoogleSpecs(existing?.fontGoogleSpecs, [
    stored.fontPrimary,
    stored.fontSecondary,
    stored.fontContent,
  ]);
  if (Object.keys(fontGoogleSpecs).length) {
    stored.fontGoogleSpecs = fontGoogleSpecs;
  }

  const ok = await setStoredCompanyConfig(stored);
  if (!ok) return jsonResponse({ error: 'Failed to save company details' }, 500);

  invalidateOfficeCoordsCache();
  void syncCalcomIdentityFromReave({ force: true, request: context.request })
    .then(() => syncCalcomHoursFromReave({ request: context.request }))
    .catch(() => undefined);

  const company = await getCompanyConfig(context.request);
  const fontCatalog = await brandFontCatalogForAdminAsync();
  return jsonResponse({ ok: true, company, fontCatalog, emailFontCatalog: emailSafeFontCatalogForAdmin() });
}
