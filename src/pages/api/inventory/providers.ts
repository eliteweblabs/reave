import type { APIContext } from 'astro';
import { hasFeature } from '../../../lib/features';
import { isInventoryApiConfigured, inventoryListProviders } from '../../../lib/inventoryClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('inventory_sync')) {
    return json({ ok: false, error: 'inventory_sync not enabled' }, 404);
  }
  if (!isInventoryApiConfigured()) {
    return json({ ok: false, error: 'INVENTORY_API_BASE_URL is not configured' }, 503);
  }

  const result = await inventoryListProviders();
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json(result.data);
}
