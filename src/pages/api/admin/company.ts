import type { APIContext } from 'astro';
import {
  getCompanyConfig,
  normalizeCompanyInput,
  resolveCompanyAddressGeo,
  type CompanyConfigInput,
} from '../../../lib/companyConfig';
import { getStoredCompanyConfig, setStoredCompanyConfig } from '../../../lib/companyConfigStore';
import { invalidateOfficeCoordsCache } from '../../../lib/mapbox';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  let body: CompanyConfigInput;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const stored = normalizeCompanyInput(body);
  if (body.address !== undefined || body.geo !== undefined) {
    const existing = await getStoredCompanyConfig();
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

  const ok = await setStoredCompanyConfig(stored);
  if (!ok) return json({ error: 'Failed to save company details' }, 500);

  invalidateOfficeCoordsCache();

  const company = await getCompanyConfig(context.request);
  return json({ ok: true, company });
}
