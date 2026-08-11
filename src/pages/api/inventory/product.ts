import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { hasFeature } from '../../../lib/features';
import { isInventoryApiConfigured, inventoryGetProduct } from '../../../lib/inventoryClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('inventory_sync')) {
    return json({ ok: false, error: 'inventory_sync not enabled' }, 404);
  }
  if (!isInventoryApiConfigured()) {
    return json({ ok: false, error: 'INVENTORY_API_BASE_URL is not configured' }, 503);
  }

  const provider = context.url.searchParams.get('provider')?.trim();
  const id = context.url.searchParams.get('id')?.trim();
  if (!provider || !id) {
    return json({ ok: false, error: 'provider and id query params are required' }, 400);
  }

  const result = await inventoryGetProduct(provider, id);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json(result.data);
}
