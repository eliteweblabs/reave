/**
 * Google Places (New) search for used-car dealerships inside a map viewport.
 * Inventory size is a deterministic demo estimate — Places has no lot-size field.
 */

import { getGoogleMapsApiKey } from './googleMapsApiKey';

export type DealerInventoryBucket = '1-50' | '51-100' | '101-200' | '201-500' | '500+';

export type DealerPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  /** Favicon / Places photo URL for pin face (may be relative). */
  logoUrl?: string;
  /** Places photo resource name for /api/dealer-map/photo */
  photoName?: string;
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
  photos?: Array<{ name?: string }>;
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
  'places.photos',
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
 * place-id hash into inventory buckets so the toggles have something to filter.
 */
export function estimateDealerInventory(
  placeId: string,
  userRatingCount?: number,
): { inventoryEstimate: number; inventoryBucket: DealerInventoryBucket } {
  const reviews = Number.isFinite(userRatingCount) ? Math.max(0, Number(userRatingCount)) : 0;
  const jitter = (hashPlaceId(placeId) % 55) - 18;
  const base =
    reviews <= 0
      ? 35 + (hashPlaceId(placeId) % 160)
      : reviews < 20
        ? 15 + reviews * 2.2
        : reviews < 80
          ? 55 + (reviews - 20) * 1.4
          : reviews < 200
            ? 140 + (reviews - 80) * 1.1
            : reviews < 500
              ? 280 + (reviews - 200) * 0.7
              : 520 + Math.min(280, (reviews - 500) * 0.35);
  const inventoryEstimate = Math.max(1, Math.min(900, Math.round(base + jitter)));
  const inventoryBucket: DealerInventoryBucket =
    inventoryEstimate <= 50
      ? '1-50'
      : inventoryEstimate <= 100
        ? '51-100'
        : inventoryEstimate <= 200
          ? '101-200'
          : inventoryEstimate <= 500
            ? '201-500'
            : '500+';
  return { inventoryEstimate, inventoryBucket };
}

function faviconFromWebsite(website: string | undefined): string | undefined {
  if (!website) return undefined;
  try {
    const host = new URL(website).hostname;
    if (!host) return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return undefined;
  }
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
  const website = String(raw?.websiteUri ?? '').trim() || undefined;
  const photoName = String(raw?.photos?.[0]?.name ?? '').trim() || undefined;
  const favicon = faviconFromWebsite(website);
  const logoUrl =
    favicon ||
    (photoName ? `/api/dealer-map/photo?name=${encodeURIComponent(photoName)}&size=64` : undefined);

  return {
    placeId,
    name,
    address: cleanAddress(raw?.formattedAddress),
    lat,
    lng,
    phone: String(raw?.nationalPhoneNumber ?? '').trim() || undefined,
    website,
    logoUrl,
    photoName,
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
  const latSpan = north - south;
  const lngSpan = east - west;
  if (latSpan > 4 || lngSpan > 4) return null;
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

/** Approx half-diagonal of the viewport, clamped to Places circle max (50 km). */
function biasRadiusMeters(bounds: DealerMapBounds): number {
  const center = {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
  const corner = { lat: bounds.north, lng: bounds.east };
  const halfDiag = haversineMeters(center, corner);
  return Math.max(2000, Math.min(50_000, Math.round(halfDiag * 1.25)));
}

/**
 * Search used-car dealerships near the viewport center.
 * Returns Places hits within the bias radius (client filters to the map view).
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
  const radius = biasRadiusMeters(bounds);

  const body = {
    textQuery: 'used car dealership',
    includedType: 'car_dealer',
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius,
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
    // Keep anything inside the search circle — client clips to the viewport.
    if (haversineMeters(center, { lat: place.lat, lng: place.lng }) > radius * 1.15) {
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

/** Stream a Places photo (pin-sized) — keeps the Maps API key server-side. */
export async function fetchDealerPlacePhoto(
  photoName: string,
  size = 64,
): Promise<{ ok: true; body: ArrayBuffer; contentType: string } | { ok: false; status: number; error: string }> {
  const name = String(photoName ?? '')
    .trim()
    .replace(/^\/+/, '');
  if (!name.startsWith('places/') || !name.includes('/photos/')) {
    return { ok: false, status: 400, error: 'Invalid photo name' };
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { ok: false, status: 503, error: 'GOOGLE_MAPS_API_KEY is not configured' };
  }

  const px = Math.max(32, Math.min(256, Math.round(Number(size) || 64)));
  const url =
    `https://places.googleapis.com/v1/${name}/media` +
    `?maxHeightPx=${px}&maxWidthPx=${px}&skipHttpRedirect=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
    });
  } catch {
    return { ok: false, status: 502, error: 'Photo request failed' };
  }

  if (!response.ok) {
    return { ok: false, status: response.status === 429 ? 429 : 502, error: `Photo ${response.status}` };
  }

  // skipHttpRedirect returns JSON with photoUri, or may return the image directly.
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as { photoUri?: string } | null;
    const photoUri = data?.photoUri;
    if (!photoUri) return { ok: false, status: 502, error: 'No photoUri' };
    try {
      const img = await fetch(photoUri);
      if (!img.ok) return { ok: false, status: 502, error: `Photo fetch ${img.status}` };
      const body = await img.arrayBuffer();
      return {
        ok: true,
        body,
        contentType: img.headers.get('content-type') || 'image/jpeg',
      };
    } catch {
      return { ok: false, status: 502, error: 'Photo fetch failed' };
    }
  }

  const body = await response.arrayBuffer();
  return { ok: true, body, contentType: contentType || 'image/jpeg' };
}
