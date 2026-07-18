import { getOfficeCoordinates } from './mapbox';

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

  const office = await getOfficeCoordinates();
  if (office) return { lat: office.lat, lng: office.lng };

  return { ...BOSTON_MA };
}
