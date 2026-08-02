/**
 * GET /api/google/places-autocomplete — white-labeled address suggestions (admin).
 * Proxies Google Places Autocomplete (New) and returns plain-text predictions.
 */

import type { APIContext } from 'astro';
import { getGoogleMapsApiKey } from '../../../lib/googleMapsApiKey';
import { resolvePlacesLocationBias, resolvePlacesRegionCodes } from '../../../lib/placesLocationBias';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

const PLACES_AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text';

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const url = new URL(context.request.url);
    const input = url.searchParams.get('input');
    const types = url.searchParams.get('types') || 'address';
    const components = url.searchParams.get('components') || '';
    const locationBias = url.searchParams.get('locationBias');
    const maxResults = parseInt(url.searchParams.get('maxResults') || '10', 10);

    if (!input) {
      return json({ error: 'Input parameter is required' }, 400);
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      return json(
        {
          error: 'Google Maps API key not configured',
          hint: 'Set GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY in your environment',
        },
        503,
      );
    }

    const googleApiUrl = new URL('https://places.googleapis.com/v1/places:autocomplete');

    const requestBody: Record<string, unknown> = {
      input,
    };

    requestBody.includedRegionCodes = resolvePlacesRegionCodes(components);

    // `address` is the admin address-field default: include businesses and
    // street addresses so typing a company/POI name returns a place with an
    // address. Omitting includedPrimaryTypes lets Places Autocomplete (New)
    // return all primary types. Street-only callers can pass types=street_address.
    if (types && types !== 'address') {
      requestBody.includedPrimaryTypes = types.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 5);
    }

    const { lat, lng } = await resolvePlacesLocationBias(locationBias);
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        // Tighter radius keeps suggestions centered on the company/office address
        // instead of scattering across the wider metro/state region.
        radius: 30000,
      },
    };

    const response = await fetch(googleApiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACES_AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      // Surface the real Google error (e.g. "Places API (New) has not been
      // used in this project" / "API key not authorized") to the caller with
      // a non-2xx status. This used to always return 200 here, so the admin
      // UI's `if (!res.ok)` check never fired — auth/config failures were
      // silently swallowed and just looked like "no matching addresses",
      // making it impossible to tell a bad API key from a genuinely empty
      // result. Use Google's own status when it looks like a real HTTP
      // status; otherwise fall back to 502 (upstream error).
      const upstreamStatus =
        Number.isInteger(response.status) && response.status >= 400 && response.status < 600
          ? response.status
          : 502;
      return json(
        {
          status: 'REQUEST_DENIED',
          predictions: [],
          errorMessage: data.error?.message || `Google Places API error (${response.status})`,
        },
        upstreamStatus,
      );
    }

    const allPredictions =
      data.suggestions?.map(
        (suggestion: {
          placePrediction?: { placeId?: string; text?: { text?: string } };
        }) => {
          const description = cleanAddress(suggestion.placePrediction?.text?.text);
          return {
            place_id: suggestion.placePrediction?.placeId,
            description,
          };
        },
      ) || [];

    const limitedPredictions = allPredictions.slice(0, maxResults);

    return json({
      status: 'OK',
      predictions: limitedPredictions,
      errorMessage: null,
    });
  } catch (error) {
    return json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
}
