import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { hasFeature } from '../../../lib/features';
import { isInventoryApiConfigured, inventorySearch } from '../../../lib/inventoryClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!hasFeature('inventory_sync')) {
    return json({ ok: false, error: 'inventory_sync not enabled' }, 404);
  }
  if (!isInventoryApiConfigured()) {
    return json({ ok: false, error: 'INVENTORY_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await inventorySearch({
    query: String(body.query ?? ''),
    provider: body.provider != null ? String(body.provider) : undefined,
    limit: body.limit != null ? Number(body.limit) : undefined,
    page: body.page != null ? Number(body.page) : undefined,
    minPrice: body.minPrice != null ? Number(body.minPrice) : undefined,
    maxPrice: body.maxPrice != null ? Number(body.maxPrice) : undefined,
    inStockOnly: body.inStockOnly === true,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json(result.data);
}
