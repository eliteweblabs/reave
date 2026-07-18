/**
 * GET /api/mapbox/geocode — geocode a street address (admin).
 */
import type { APIRoute } from 'astro';
import { geocodeAddress } from '../../../lib/mapbox';
import { getMapboxAccessToken } from '../../../lib/mapboxAccessToken';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!getMapboxAccessToken()) {
    return json(
      {
        ok: false,
        error: 'Mapbox access token not configured',
        hint: 'Set MAPBOX_ACCESS_TOKEN or PUBLIC_MAPBOX_ACCESS_TOKEN',
      },
      503,
    );
  }

  const address = url.searchParams.get('address')?.trim() || '';
  if (!address) return json({ ok: false, error: 'address is required' }, 400);

  const geo = await geocodeAddress(address);
  if (!geo) return json({ ok: false, error: 'Address not found' }, 404);

  return json({ ok: true, geo });
};
