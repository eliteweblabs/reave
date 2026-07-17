/**
 * GET /api/google/places-autocomplete — white-labeled address suggestions (admin).
 * Proxies Google Places Autocomplete (New) and returns plain-text predictions.
 */

import type { APIContext } from 'astro';
import { getGoogleMapsApiKey } from '../../../lib/googleMapsApiKey';

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
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

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

    if (components && components.includes('country:')) {
      const countryCode = components.split(':')[1];
      requestBody.includedRegionCodes = [countryCode];
    }

    if (types === 'address') {
      requestBody.includedPrimaryTypes = ['street_address', 'premise'];
    } else if (types) {
      requestBody.includedPrimaryTypes = [types];
    }

    const defaultBias =
      import.meta.env.GOOGLE_PLACES_DEFAULT_BIAS ||
      (typeof process !== 'undefined' ? process.env.GOOGLE_PLACES_DEFAULT_BIAS : undefined);
    const biasSource = locationBias || defaultBias;

    if (biasSource) {
      let lat: string | undefined;
      let lng: string | undefined;
      if (biasSource.includes('@')) {
        const parts = biasSource.split('@');
        [lat, lng] = parts[1].split(',');
      } else {
        [lat, lng] = biasSource.split(',');
      }

      const latNum = parseFloat(lat?.trim() ?? '');
      const lngNum = parseFloat(lng?.trim() ?? '');
      if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: latNum,
              longitude: lngNum,
            },
            radius: 50000,
          },
        };
      }
    }

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
      return json({
        status: 'REQUEST_DENIED',
        predictions: [],
        errorMessage: data.error?.message || `Google Places API error (${response.status})`,
      });
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
