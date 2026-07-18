/**
 * Google Geocoding API helper — resolve a street address to coordinates using the
 * same key that powers admin address autocomplete. Used as a fallback when Mapbox
 * is not configured, so the company/office address still resolves for map bias.
 */
import { getGoogleMapsApiKey } from './googleMapsApiKey';
import type { GeocodeResult } from './mapbox';

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

/** Geocode a street address via the Google Geocoding API. */
export async function geocodeAddressGoogle(query: string): Promise<GeocodeResult | null> {
  const key = getGoogleMapsApiKey();
  const q = cleanAddress(query);
  if (!key || !q) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', q);
  url.searchParams.set('key', key);

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (data.status !== 'OK') return null;
  const result = data.results?.[0];
  const loc = result?.geometry?.location;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    placeId: result?.place_id || undefined,
    resolved: cleanAddress(result?.formatted_address) || q,
    geocodedAt: new Date().toISOString(),
  };
}
