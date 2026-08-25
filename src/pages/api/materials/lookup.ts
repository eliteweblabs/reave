import type { APIContext } from 'astro';
import { hasFeature } from '../../../lib/features';
import { isMaterialsApiConfigured, materialsLookupUrl } from '../../../lib/materialsClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('materials_pricing')) {
    return jsonResponse({ ok: false, error: 'materials_pricing not enabled' }, 404);
  }
  if (!isMaterialsApiConfigured()) {
    return jsonResponse({ ok: false, error: 'MATERIALS_API_BASE_URL is not configured' }, 503);
  }

  const parsed = await readJsonBody(context.request);
  if (parsed instanceof Response) return parsed;
  const { body } = parsed;

  const result = await materialsLookupUrl({
    url: String(body.url ?? ''),
    provider: body.provider != null ? String(body.provider) : undefined,
    zip: body.zip != null ? String(body.zip) : undefined,
  });

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
  return jsonResponse(result.data);
}
