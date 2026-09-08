/**
 * GET /api/public/places-autocomplete — public (rate-limited) city/address
 * suggestions for site landing forms. Proxies Google Places Autocomplete (New).
 *
 * Query: input (required, min 2 chars), types (default `(cities)`), locationBias,
 * components (default country:us).
 */

import type { APIContext } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import { clientIp } from '../../../lib/clientIp';
import { autocompletePlaces } from '../../../lib/googlePlacesAutocomplete';
import { getGoogleMapsApiKey } from '../../../lib/googleMapsApiKey';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const ip = clientIp(context.request);
  const limit = checkInMemoryRateLimit(`public-places:${ip}`, {
    windowMs: 60_000,
    maxPerWindow: 40,
  });
  if (!limit.ok) {
    return jsonResponse(
      {
        status: 'OVER_QUERY_LIMIT',
        predictions: [],
        errorMessage: 'Too many lookups — wait a moment and try again.',
      },
      429,
    );
  }

  const url = new URL(context.request.url);
  const input = url.searchParams.get('input')?.trim() ?? '';
  const types = url.searchParams.get('types') || '(cities)';
  const components = url.searchParams.get('components') || 'country:us';
  const locationBias = url.searchParams.get('locationBias');
  const maxResults = Math.min(Math.max(parseInt(url.searchParams.get('maxResults') || '8', 10), 1), 10);

  if (input.length < 2) {
    return jsonResponse({ status: 'OK', predictions: [], errorMessage: null });
  }

  if (!getGoogleMapsApiKey()) {
    return jsonResponse(
      {
        status: 'UNAVAILABLE',
        predictions: [],
        errorMessage: 'Location lookup is not configured.',
      },
      503,
    );
  }

  try {
    const rows = await autocompletePlaces(input, {
      types,
      components,
      locationBias,
      maxResults,
    });

    return jsonResponse({
      status: 'OK',
      predictions: rows.map((row) => ({
        place_id: row.placeId,
        description: row.description,
      })),
      errorMessage: null,
    });
  } catch (error) {
    return jsonResponse(
      {
        status: 'ERROR',
        predictions: [],
        errorMessage: error instanceof Error ? error.message : 'Could not look up locations.',
      },
      500,
    );
  }
}
