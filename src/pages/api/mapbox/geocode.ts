/**
 * GET /api/mapbox/geocode — geocode a street address (admin).
 */
import type { APIRoute } from 'astro';
import { resolveAddressCoordinates } from '../../../lib/mapbox';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { json } from '../../../lib/apiJson';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const address = context.url.searchParams.get('address')?.trim() || '';
  if (!address) return json({ ok: false, error: 'address is required' }, 400);

  const geo = await resolveAddressCoordinates(address);
  if (!geo) return json({ ok: false, error: 'Address not found' }, 404);

  return json({ ok: true, geo });
};
