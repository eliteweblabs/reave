import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { isMaterialsApiConfigured, materialsListProviders } from '../../../lib/materialsClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  if (!isMaterialsApiConfigured()) {
    return json({ ok: false, error: 'MATERIALS_API_BASE_URL is not configured' }, 503);
  }

  const result = await materialsListProviders();
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json(result.data);
}
