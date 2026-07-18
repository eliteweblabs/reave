import { serverEnv } from './serverEnv';
import { getMapboxAccessToken } from './mapboxAccessToken';
import { getStoredCompanyConfig } from './companyConfigStore';
import type { ClientPortalGeo } from './contactApi';

export type GeocodeResult = ClientPortalGeo & {
  resolved?: string;
};

export type RouteLineString = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type DirectionsResult = {
  geometry: RouteLineString;
  distanceMeters: number;
  durationSeconds: number;
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
};

let officeCoordsCache: { lat: number; lng: number; label: string } | null | undefined;

export function invalidateOfficeCoordsCache(): void {
  officeCoordsCache = undefined;
}

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

/** Geocode a street address via Mapbox Geocoding API. */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const token = getMapboxAccessToken();
  const q = cleanAddress(query);
  if (!token || !q) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`,
  );
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '1');
  url.searchParams.set('types', 'address,place,poi');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{
      id?: string;
      place_name?: string;
      center?: [number, number];
    }>;
  };

  const feature = data.features?.[0];
  const center = feature?.center;
  if (!center || center.length < 2) return null;

  const [lng, lat] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    placeId: feature.id || undefined,
    resolved: cleanAddress(feature.place_name) || q,
    geocodedAt: new Date().toISOString(),
  };
}

/**
 * Geocode a street address, preferring Mapbox and falling back to Google when
 * Mapbox is unconfigured or returns no match. Lets deployments that only set a
 * Google Maps key still resolve the company address for map bias / directions.
 */
export async function resolveAddressCoordinates(query: string): Promise<GeocodeResult | null> {
  const viaMapbox = await geocodeAddress(query);
  if (viaMapbox) return viaMapbox;

  const { geocodeAddressGoogle } = await import('./googleGeocode');
  return geocodeAddressGoogle(query);
}

/** Office / job-site origin for driving directions (company address, then BOOKING_DEFAULT_ADDRESS). */
export async function getOfficeCoordinates(): Promise<{ lat: number; lng: number; label: string } | null> {
  if (officeCoordsCache !== undefined) return officeCoordsCache;

  const stored = await getStoredCompanyConfig();
  const storedAddress = stored?.address?.trim() || '';
  if (storedAddress) {
    if (stored?.geo && Number.isFinite(stored.geo.lat) && Number.isFinite(stored.geo.lng)) {
      officeCoordsCache = {
        lat: stored.geo.lat,
        lng: stored.geo.lng,
        label: storedAddress,
      };
      return officeCoordsCache;
    }

    const geocodedStored = await resolveAddressCoordinates(storedAddress);
    if (geocodedStored) {
      officeCoordsCache = {
        lat: geocodedStored.lat,
        lng: geocodedStored.lng,
        label: geocodedStored.resolved || storedAddress,
      };
      return officeCoordsCache;
    }
  }

  const label = serverEnv('BOOKING_DEFAULT_ADDRESS')?.trim() || '';
  if (!label) {
    officeCoordsCache = null;
    return null;
  }

  const geocoded = await resolveAddressCoordinates(label);
  if (!geocoded) {
    officeCoordsCache = null;
    return null;
  }

  officeCoordsCache = {
    lat: geocoded.lat,
    lng: geocoded.lng,
    label: geocoded.resolved || label,
  };
  return officeCoordsCache;
}

/** Fetch a driving route between two coordinates. */
export async function getDrivingDirections(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  labels?: { origin?: string; destination?: string },
): Promise<DirectionsResult | null> {
  const token = getMapboxAccessToken();
  if (!token) return null;
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) return null;
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return null;

  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${path}`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    routes?: Array<{
      geometry?: RouteLineString;
      distance?: number;
      duration?: number;
    }>;
  };

  const route = data.routes?.[0];
  if (!route?.geometry) return null;

  return {
    geometry: route.geometry,
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
    origin: { ...from, label: labels?.origin },
    destination: { ...to, label: labels?.destination },
  };
}
