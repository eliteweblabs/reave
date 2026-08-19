import { geocodeAddressGoogle } from './googleGeocode';
import { getOfficeCoordinates } from './mapbox';
import { serverEnv } from './serverEnv';

/** Boston, MA — fallback when BOOKING_DEFAULT_ADDRESS is unset or cannot geocode. */
const BOSTON_MA = { lat: 42.3601, lng: -71.0589 } as const;

function parseLatLngBias(raw: string): { lat: number; lng: number } | null {
  const source = raw.trim();
  if (!source) return null;

  let latPart: string | undefined;
  let lngPart: string | undefined;
  if (source.includes('@')) {
    const parts = source.split('@');
    [latPart, lngPart] = parts[1].split(',');
  } else {
    [latPart, lngPart] = source.split(',');
  }

  const lat = parseFloat(latPart?.trim() ?? '');
  const lng = parseFloat(lngPart?.trim() ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Center for Google Places autocomplete bias.
 * Priority: explicit override → BOOKING_DEFAULT_ADDRESS → Boston, MA.
 */
export async function resolvePlacesLocationBias(
  explicitBias?: string | null,
): Promise<{ lat: number; lng: number }> {
  const parsed = explicitBias ? parseLatLngBias(explicitBias) : null;
  if (parsed) return parsed;

  const place = explicitBias?.trim();
  if (place) {
    const geo = await geocodeAddressGoogle(place);
    if (geo) return { lat: geo.lat, lng: geo.lng };
  }

  const office = await getOfficeCoordinates();
  if (office) return { lat: office.lat, lng: office.lng };

  return { ...BOSTON_MA };
}

function parseCountryCode(raw: string | undefined | null): string | null {
  const code = raw?.trim().toLowerCase() ?? '';
  return /^[a-z]{2}$/.test(code) ? code : null;
}

/**
 * ISO 3166-1 alpha-2 region filter for Google Places autocomplete.
 * Priority: explicit `components=country:xx` → PLACES_DEFAULT_COUNTRY → US.
 *
 * Location bias alone still returns global matches (e.g. Finland) for partial
 * street queries; includedRegionCodes keeps suggestions in-country.
 */
export function resolvePlacesRegionCodes(components?: string | null): string[] {
  if (components?.includes('country:')) {
    const code = parseCountryCode(components.split(':').pop());
    if (code) return [code];
  }

  const fromEnv = parseCountryCode(serverEnv('PLACES_DEFAULT_COUNTRY'));
  if (fromEnv) return [fromEnv];

  return ['us'];
}
