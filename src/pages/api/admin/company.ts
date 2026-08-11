import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import {
  getCompanyConfig,
  normalizeCompanyInput,
  resolveCompanyAddressGeo,
  type CompanyConfigInput,
} from '../../../lib/companyConfig';
import { sanitizeInlineSvg } from '../../../lib/brandSvg';
import { normalizeBrandColorHex } from '../../../lib/companyBrandColors';
import { brandFontCatalogForAdminAsync, mergeFontGoogleSpecs } from '../../../lib/googleFontsCatalog';
import { getStoredCompanyConfig, setStoredCompanyConfig } from '../../../lib/companyConfigStore';
import { invalidateOfficeCoordsCache } from '../../../lib/mapbox';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const company = await getCompanyConfig(context.request);
  const fontCatalog = await brandFontCatalogForAdminAsync();
  return json({ ok: true, company, fontCatalog });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: CompanyConfigInput;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (body.logoSvg !== undefined) {
    const t = (body.logoSvg ?? '').trim();
    if (t && !sanitizeInlineSvg(t)) {
      return json({ error: 'Logo SVG must be valid <svg>…</svg> markup (max 200 KB).' }, 400);
    }
  }
  if (body.iconSvg !== undefined) {
    const t = (body.iconSvg ?? '').trim();
    if (t && !sanitizeInlineSvg(t)) {
      return json({ error: 'Icon SVG must be valid <svg>…</svg> markup (max 200 KB).' }, 400);
    }
  }
  if (body.brandPrimary !== undefined && body.brandPrimary.trim() && !normalizeBrandColorHex(body.brandPrimary)) {
    return json({ error: 'Primary color must be a valid hex value (e.g. #f472b6).' }, 400);
  }
  if (body.brandSecondary !== undefined && body.brandSecondary.trim() && !normalizeBrandColorHex(body.brandSecondary)) {
    return json({ error: 'Secondary color must be a valid hex value (e.g. #c026d3).' }, 400);
  }

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
  if (!ok) return json({ error: 'Failed to save company details' }, 500);

  invalidateOfficeCoordsCache();

  const company = await getCompanyConfig(context.request);
  const fontCatalog = await brandFontCatalogForAdminAsync();
  return json({ ok: true, company, fontCatalog });
}
