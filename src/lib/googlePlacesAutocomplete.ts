/**
 * Google Places Autocomplete (New) — shared server helper for admin address lookup.
 */

import { getGoogleMapsApiKey } from './googleMapsApiKey';
import { resolvePlacesLocationBias, resolvePlacesRegionCodes } from './placesLocationBias';

const PLACES_AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text';

export type PlacePrediction = {
  placeId: string;
  description: string;
};

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

export type AutocompletePlacesOptions = {
  /** Default `address` — include businesses and street addresses. */
  types?: string;
  components?: string;
  locationBias?: string;
  maxResults?: number;
};

/** Query Google Places Autocomplete and return normalized predictions. */
export async function autocompletePlaces(
  input: string,
  opts: AutocompletePlacesOptions = {},
): Promise<PlacePrediction[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return [];

  const types = opts.types ?? 'address';
  const maxResults = Math.min(Math.max(opts.maxResults ?? 10, 1), 10);

  const requestBody: Record<string, unknown> = { input: q };
  requestBody.includedRegionCodes = resolvePlacesRegionCodes(opts.components);

  if (types && types !== 'address') {
    requestBody.includedPrimaryTypes = types
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  const { lat, lng } = await resolvePlacesLocationBias(opts.locationBias);
  requestBody.locationBias = {
    circle: {
      center: { latitude: lat, longitude: lng },
      radius: 30000,
    },
  };

  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACES_AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return [];
  }

  const data = (await response.json()) as {
    error?: { message?: string };
    suggestions?: Array<{
      placePrediction?: { placeId?: string; text?: { text?: string } };
    }>;
  };

  if (!response.ok || data.error) return [];

  const predictions =
    data.suggestions
      ?.map((suggestion) => {
        const placeId = suggestion.placePrediction?.placeId?.trim() ?? '';
        const description = cleanAddress(suggestion.placePrediction?.text?.text);
        if (!description) return null;
        return { placeId, description };
      })
      .filter((row): row is PlacePrediction => row != null) ?? [];

  return predictions.slice(0, maxResults);
}

/** Best-effort address for a business or place name (first autocomplete match). */
export async function lookupBusinessAddress(query: string): Promise<PlacePrediction | null> {
  const predictions = await autocompletePlaces(query, { maxResults: 1 });
  return predictions[0] ?? null;
}
