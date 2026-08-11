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

const NAME_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'llc',
  'inc',
  'ltd',
  'co',
  'company',
  'corp',
  'corporation',
]);

function normalizeBusinessTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1 && !NAME_STOP_WORDS.has(t));
}

/** True when Places text includes a street-level address (not just a city/region). */
export function hasStreetAddress(description: string): boolean {
  return /\b\d{1,6}\s+[A-Za-z0-9]/.test(description);
}

/**
 * Exact-enough business+address match for audit / contact enrichment.
 * Requires a street address in the Places prediction and strong name overlap
 * with the lookup query (company / contact name).
 */
export function isExactBusinessAddressMatch(query: string, description: string): boolean {
  const q = query.trim();
  const d = description.trim();
  if (q.length < 2 || d.length < 2) return false;
  if (!hasStreetAddress(d)) return false;

  const placeName = d.split(',')[0]?.trim() || d;
  const qNorm = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const nameNorm = placeName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!qNorm || !nameNorm) return false;
  if (nameNorm === qNorm || nameNorm.startsWith(qNorm) || qNorm.startsWith(nameNorm)) {
    return true;
  }

  const qTokens = normalizeBusinessTokens(q);
  if (!qTokens.length) return nameNorm.includes(qNorm) || qNorm.includes(nameNorm);

  const nameHay = `${nameNorm} ${d.toLowerCase()}`;
  const hits = qTokens.filter((t) => nameHay.includes(t)).length;
  return hits >= Math.ceil(qTokens.length * 0.7);
}

export type BusinessAddressLookupResult =
  | { status: 'matched'; place: PlacePrediction; query: string }
  | { status: 'not_listed'; query: string }
  | { status: 'unavailable'; query: string };

/**
 * Resolve a business address from Google Places with an exact-match gate.
 * No street-level name match → `not_listed` (caller should surface this in audits).
 */
export async function lookupBusinessAddressMatch(
  query: string,
): Promise<BusinessAddressLookupResult> {
  const q = query.trim();
  if (q.length < 2) return { status: 'not_listed', query: q };
  if (!getGoogleMapsApiKey()) return { status: 'unavailable', query: q };

  const establishment = await autocompletePlaces(q, {
    maxResults: 5,
    types: 'establishment',
  });
  const establishmentHit = establishment.find((p) =>
    isExactBusinessAddressMatch(q, p.description),
  );
  if (establishmentHit) {
    return { status: 'matched', place: establishmentHit, query: q };
  }

  const any = await autocompletePlaces(q, { maxResults: 5 });
  const anyHit = any.find((p) => isExactBusinessAddressMatch(q, p.description));
  if (anyHit) return { status: 'matched', place: anyHit, query: q };

  return { status: 'not_listed', query: q };
}

/** Best-effort address for a business or place name (exact street-level match only). */
export async function lookupBusinessAddress(query: string): Promise<PlacePrediction | null> {
  const result = await lookupBusinessAddressMatch(query);
  return result.status === 'matched' ? result.place : null;
}
