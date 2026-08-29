import type { APIContext } from 'astro';
import { hasFeature } from '../../../lib/features';
import { isInventoryApiConfigured, inventoryListProviders } from '../../../lib/inventoryClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('inventory_sync')) {
    return jsonResponse({ ok: false, error: 'inventory_sync not enabled' }, 404);
  }
  if (!isInventoryApiConfigured()) {
    return jsonResponse({ ok: false, error: 'INVENTORY_API_BASE_URL is not configured' }, 503);
  }

  const result = await inventoryListProviders();
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
  return jsonResponse(result.data);
}
