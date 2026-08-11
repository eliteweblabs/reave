/**
 * Google Places (New) search for used-car dealerships inside a map viewport.
 * Inventory size is a deterministic demo estimate — Places has no lot-size field.
 */

import { getGoogleMapsApiKey } from './googleMapsApiKey';

export type DealerInventoryBucket = '1-50' | '51-100' | '101-200';

export type DealerPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  userRatingCount?: number;
  /** Demo estimate of used-car lot size (not from Google). */
  inventoryEstimate: number;
  inventoryBucket: DealerInventoryBucket;
};

export type DealerMapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  primaryType?: string;
};

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.primaryType',
].join(',');

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

/** Stable 32-bit hash for demo inventory jitter. */
function hashPlaceId(placeId: string): number {
  let h = 2166136261;
  for (let i = 0; i < placeId.length; i++) {
    h ^= placeId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Places does not expose lot size. For this demo we map review volume + a
 * place-id hash into 1–200 so the inventory toggles have something to filter.
 */
export function estimateDealerInventory(
  placeId: string,
  userRatingCount?: number,
): { inventoryEstimate: number; inventoryBucket: DealerInventoryBucket } {
  const reviews = Number.isFinite(userRatingCount) ? Math.max(0, Number(userRatingCount)) : 0;
  const jitter = (hashPlaceId(placeId) % 40) - 12; // -12 … +27
  // Small lots cluster under ~20 reviews; mid under ~80; large above that.
  const base =
    reviews <= 0
      ? 28 + (hashPlaceId(placeId) % 90)
      : reviews < 20
        ? 12 + reviews * 1.8
        : reviews < 80
          ? 48 + (reviews - 20) * 0.85
          : 100 + Math.min(95, (reviews - 80) * 0.55);
  const inventoryEstimate = Math.max(1, Math.min(200, Math.round(base + jitter)));
  const inventoryBucket: DealerInventoryBucket =
    inventoryEstimate <= 50 ? '1-50' : inventoryEstimate <= 100 ? '51-100' : '101-200';
  return { inventoryEstimate, inventoryBucket };
}

function toDealerPlace(raw: RawPlace | undefined): DealerPlace | null {
  const placeId = String(raw?.id ?? '')
    .replace(/^places\//, '')
    .trim();
  if (!placeId) return null;

  const lat = Number(raw?.location?.latitude);
  const lng = Number(raw?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = String(raw?.displayName?.text ?? '').trim();
  if (!name) return null;

  const userRatingCount = Number(raw?.userRatingCount);
  const { inventoryEstimate, inventoryBucket } = estimateDealerInventory(
    placeId,
    Number.isFinite(userRatingCount) ? userRatingCount : undefined,
  );

  const rating = Number(raw?.rating);

  return {
    placeId,
    name,
    address: cleanAddress(raw?.formattedAddress),
    lat,
    lng,
    phone: String(raw?.nationalPhoneNumber ?? '').trim() || undefined,
    website: String(raw?.websiteUri ?? '').trim() || undefined,
    rating: Number.isFinite(rating) ? rating : undefined,
    userRatingCount: Number.isFinite(userRatingCount) ? userRatingCount : undefined,
    inventoryEstimate,
    inventoryBucket,
  };
}

function normalizeBounds(bounds: DealerMapBounds): DealerMapBounds | null {
  const south = Number(bounds.south);
  const west = Number(bounds.west);
  const north = Number(bounds.north);
  const east = Number(bounds.east);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (south < -90 || north > 90 || south >= north) return null;
  if (west < -180 || east > 180 || west >= east) return null;
  // Reject continent-scale boxes — Places returns noise and burns quota.
  const latSpan = north - south;
  const lngSpan = east - west;
  if (latSpan > 8 || lngSpan > 8) return null;
  return { south, west, north, east };
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Search used-car dealerships inside the viewport rectangle.
 * Uses Text Search with a used-car query + locationRestriction.
 */
export async function searchUsedCarDealersInBounds(
  boundsInput: DealerMapBounds,
): Promise<{ ok: true; dealers: DealerPlace[] } | { ok: false; error: string; status: number }> {
  const bounds = normalizeBounds(boundsInput);
  if (!bounds) {
    return {
      ok: false,
      error: 'Zoom in further — region is too large to search.',
      status: 400,
    };
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { ok: false, error: 'GOOGLE_MAPS_API_KEY is not configured', status: 503 };
  }

  const center = {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };

  const body = {
    textQuery: 'used car dealer',
    maxResultCount: 20,
    locationRestriction: {
      rectangle: {
        low: { latitude: bounds.south, longitude: bounds.west },
        high: { latitude: bounds.north, longitude: bounds.east },
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
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'Google Places request failed', status: 502 };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return {
      ok: false,
      error: `Google Places ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`,
      status: response.status === 429 ? 429 : 502,
    };
  }

  const data = (await response.json().catch(() => null)) as { places?: RawPlace[] } | null;
  const dealers: DealerPlace[] = [];
  const seen = new Set<string>();

  for (const raw of data?.places ?? []) {
    const place = toDealerPlace(raw);
    if (!place || seen.has(place.placeId)) continue;
    // Keep pins that fall inside the requested box (API can soft-bias).
    if (
      place.lat < bounds.south ||
      place.lat > bounds.north ||
      place.lng < bounds.west ||
      place.lng > bounds.east
    ) {
      continue;
    }
    seen.add(place.placeId);
    dealers.push(place);
  }

  dealers.sort(
    (a, b) =>
      haversineMeters(center, { lat: a.lat, lng: a.lng }) -
      haversineMeters(center, { lat: b.lat, lng: b.lng }),
  );

  return { ok: true, dealers };
}
