import type { APIContext } from 'astro';
import { hasFeature } from '../../../lib/features';
import { isMaterialsApiConfigured, materialsSearch } from '../../../lib/materialsClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!hasFeature('materials_pricing')) {
    return jsonResponse({ ok: false, error: 'materials_pricing not enabled' }, 404);
  }
  if (!isMaterialsApiConfigured()) {
    return jsonResponse({ ok: false, error: 'MATERIALS_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await materialsSearch({
    query: String(body.query ?? ''),
    provider: body.provider != null ? String(body.provider) : undefined,
    zip: body.zip != null ? String(body.zip) : undefined,
    limit: body.limit != null ? Number(body.limit) : undefined,
    page: body.page != null ? Number(body.page) : undefined,
    minPrice: body.minPrice != null ? Number(body.minPrice) : undefined,
    maxPrice: body.maxPrice != null ? Number(body.maxPrice) : undefined,
  });

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
  return jsonResponse(result.data);
}
