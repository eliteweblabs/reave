/**
 * GET /api/dealer-map/places — public (rate-limited) used-car dealer search
 * for the /dealer-map demo. Proxies Google Places Text Search for a viewport.
 *
 * Query: south, west, north, east (WGS84).
 */

import type { APIContext } from 'astro';
import { searchUsedCarDealersInBounds } from '../../../lib/dealerMapPlaces';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const ip = clientIp(context.request);
  const limit = checkInMemoryRateLimit(`dealer-map:${ip}`, {
    windowMs: 60_000,
    maxPerWindow: 40,
  });
  if (!limit.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many searches — wait a moment and try again.' },
      429,
    );
  }

  const url = new URL(context.request.url);
  const south = Number(url.searchParams.get('south'));
  const west = Number(url.searchParams.get('west'));
  const north = Number(url.searchParams.get('north'));
  const east = Number(url.searchParams.get('east'));

  const result = await searchUsedCarDealersInBounds({ south, west, north, east });
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, result.status);
  }

  return jsonResponse({
    ok: true,
    dealers: result.dealers,
    note: 'Inventory sizes are demo estimates (Places has no lot-size field).',
  });
}
