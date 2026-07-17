/**
 * GET /api/mapbox/geocode?address=... — geocode a meeting address (admin).
 */

import type { APIContext } from 'astro';
import { geocodeAddress, isMapboxConfigured } from '../../../lib/mapboxClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!isMapboxConfigured()) {
    return json({ ok: false, error: 'Mapbox is not configured' }, 503);
  }

  const address = new URL(context.request.url).searchParams.get('address')?.trim() || '';
  if (!address) return json({ ok: false, error: 'address is required' }, 400);

  const result = await geocodeAddress(address);
  if (!result.ok) {
    const status = result.error === 'Address not found' ? 404 : 502;
    return json({ ok: false, error: result.error }, status);
  }

  return json({ ok: true, geo: result.geo });
}
