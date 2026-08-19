/**
 * Live Google Places lookup for the audit sales-sheet phone mock-up.
 * Listing check + nearby competitors (what a customer sees instead).
 */
import { getGoogleMapsApiKey } from './googleMapsApiKey';
import {
  isExactBusinessAddressMatch,
  lookupBusinessAddressMatch,
} from './googlePlacesAutocomplete';
import { resolvePlacesLocationBias } from './placesLocationBias';
import {
  type SalesSheetCompetitor,
  type SalesSheetPlacesView,
} from './salesSheetPlacesView';

const COMPETITOR_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
].join(',');

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
};

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

function toCompetitor(raw: RawPlace): SalesSheetCompetitor | null {
  const name = String(raw.displayName?.text ?? '').trim();
  if (!name) return null;
  const rating = Number(raw.rating);
  const reviewCount = Number(raw.userRatingCount);
  return {
    name,
    address: cleanAddress(raw.formattedAddress) || 'Nearby',
    rating: Number.isFinite(rating) ? rating : undefined,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : undefined,
  };
}

function sameBusiness(query: string, name: string, address: string): boolean {
  const line = address ? `${name}, ${address}` : name;
  return isExactBusinessAddressMatch(query, line) || isExactBusinessAddressMatch(query, name);
}

async function searchCompetitorPlaces(opts: {
  textQuery: string;
  lat: number;
  lng: number;
}): Promise<{ rows: SalesSheetCompetitor[]; error?: string }> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return { rows: [], error: 'GOOGLE_MAPS_API_KEY is not configured' };

  const body = {
    textQuery: opts.textQuery,
    maxResultCount: 8,
    rankPreference: 'DISTANCE',
    locationBias: {
      circle: {
        center: { latitude: opts.lat, longitude: opts.lng },
        radius: 12000,
      },
    },
  };

  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': COMPETITOR_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'Places search failed' };
  }
  const data = (await response.json().catch(() => null)) as {
    places?: RawPlace[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    return { rows: [], error: data?.error?.message || `Places search HTTP ${response.status}` };
  }

  const out: SalesSheetCompetitor[] = [];
  const seen = new Set<string>();
  for (const raw of data?.places ?? []) {
    const row = toCompetitor(raw);
    if (!row) continue;
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { rows: out };
}

/** Business name, then a shorter local-category query so unlisted shops still get neighbors. */
export function salesSheetCompetitorQueries(
  query: string,
  near: string,
  category: string,
): string[] {
  const q = query.trim();
  const loc = near.trim();
  const cat = category.trim();
  const out: string[] = [];
  const push = (value: string) => {
    const next = value.replace(/\s+/g, ' ').trim();
    if (next && !out.includes(next)) out.push(next);
  };
  if (cat) push(loc ? `${cat} ${loc}` : cat);
  push(loc ? `${q} ${loc}` : q);
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length >= 2) push(loc ? `${words.slice(-2).join(' ')} ${loc}` : words.slice(-2).join(' '));
  return out;
}

export async function fetchSalesSheetPlaces(opts: {
  query: string;
  near?: string;
  category?: string;
  forceNotListed?: boolean;
  skipNetwork?: boolean;
}): Promise<SalesSheetPlacesView> {
  const query = opts.query.trim() || 'Hale & Co.';
  const near = (opts.near || '').trim();
  const category = (opts.category || '').trim();
  const dummy = (): SalesSheetPlacesView => ({
    query,
    near,
    listed: false,
    competitors: [],
    source: 'dummy',
    error: opts.skipNetwork ? 'Places lookup skipped' : 'GOOGLE_MAPS_API_KEY is not configured',
  });

  if (opts.skipNetwork) return dummy();
  if (!getGoogleMapsApiKey()) return dummy();

  const listing = await lookupBusinessAddressMatch(near ? `${query} ${near}` : query);
  const listed = opts.forceNotListed ? false : listing.status === 'matched';
  const matchName =
    listing.status === 'matched' ? listing.place.description.split(',')[0]?.trim() : undefined;

  const { lat, lng } = await resolvePlacesLocationBias(near);
  let competitors: SalesSheetCompetitor[] = [];
  let searchError: string | undefined;
  for (const textQuery of salesSheetCompetitorQueries(query, near, category)) {
    const found = await searchCompetitorPlaces({ textQuery, lat, lng });
    if (found.error) searchError = found.error;
    competitors = found.rows.filter((c) => !sameBusiness(query, c.name, c.address)).slice(0, 3);
    if (competitors.length) {
      searchError = undefined;
      break;
    }
  }

  return {
    query,
    near,
    listed,
    matchName,
    competitors,
    source: competitors.length ? 'places' : 'dummy',
    error: competitors.length
      ? undefined
      : searchError || 'Places returned no nearby competitors',
  };
}
