/**
 * Mapbox geocoding + static map helpers for schedule meeting locations.
 */
import { serverEnv } from './serverEnv';

export type GeoPoint = {
  lat: number;
  lng: number;
  resolved?: string;
};

export function mapboxPublicToken(): string | null {
  return serverEnv('PUBLIC_MAPBOX_ACCESS_TOKEN')?.trim() || null;
}

function mapboxServerToken(): string | null {
  return serverEnv('MAPBOX_ACCESS_TOKEN')?.trim() || mapboxPublicToken();
}

export function isMapboxConfigured(): boolean {
  return Boolean(mapboxServerToken());
}

export async function geocodeAddress(
  address: string,
): Promise<{ ok: true; geo: GeoPoint } | { ok: false; error: string }> {
  const token = mapboxServerToken();
  if (!token) return { ok: false, error: 'Mapbox is not configured' };

  const q = address.trim();
  if (!q) return { ok: false, error: 'Address is required' };

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`,
  );
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '1');

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const data = (await res.json().catch(() => null)) as {
    message?: string;
    features?: Array<{ center?: [number, number]; place_name?: string }>;
  } | null;

  if (!res.ok) {
    return { ok: false, error: data?.message || `HTTP ${res.status}` };
  }

  const center = data?.features?.[0]?.center;
  if (!center || center.length < 2) {
    return { ok: false, error: 'Address not found' };
  }

  const [lng, lat] = center;
  return {
    ok: true,
    geo: {
      lat,
      lng,
      resolved: data?.features?.[0]?.place_name || q,
    },
  };
}
