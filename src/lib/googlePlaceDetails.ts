/**
 * Google Place Details (New) — the only place we fetch structured opening hours.
 *
 * Address autocomplete (`googlePlacesAutocomplete.ts`) deliberately requests a
 * minimal field mask to keep it on the cheap SKU. Hours require a Place Details
 * or Text Search call, so it lives here and is used by hours enrichment rather
 * than on every contact save.
 */

import {
  hoursFromPlacesPeriods,
  type BusinessHours,
  type PlacesOpeningPeriod,
} from './businessHours';
import { getGoogleMapsApiKey } from './googleMapsApiKey';
import { resolvePlacesLocationBias, resolvePlacesRegionCodes } from './placesLocationBias';

const DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'regularOpeningHours',
  'utcOffsetMinutes',
  'nationalPhoneNumber',
  'websiteUri',
  'businessStatus',
] as const;

const DETAILS_FIELD_MASK = DETAILS_FIELDS.join(',');
const SEARCH_FIELD_MASK = DETAILS_FIELDS.map((f) => `places.${f}`).join(',');

export type PlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  /** Google's own status, e.g. OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY. */
  businessStatus?: string;
  hours: BusinessHours | null;
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  regularOpeningHours?: {
    periods?: PlacesOpeningPeriod[];
    weekdayDescriptions?: string[];
    openNow?: boolean;
  };
  utcOffsetMinutes?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;
};

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  return address.replace(/, USA$/i, '').trim();
}

function toPlaceDetails(raw: RawPlace | undefined): PlaceDetails | null {
  const placeId = String(raw?.id ?? '').replace(/^places\//, '').trim();
  if (!raw || !placeId) return null;

  const periods = raw.regularOpeningHours?.periods;
  const hours =
    periods && periods.length
      ? hoursFromPlacesPeriods(periods, {
          displayLines: raw.regularOpeningHours?.weekdayDescriptions,
          utcOffsetMinutes: raw.utcOffsetMinutes,
        })
      : null;

  const lat = Number(raw.location?.latitude);
  const lng = Number(raw.location?.longitude);

  return {
    placeId,
    name: String(raw.displayName?.text ?? '').trim(),
    formattedAddress: cleanAddress(raw.formattedAddress),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    phone: String(raw.nationalPhoneNumber ?? '').trim() || undefined,
    website: String(raw.websiteUri ?? '').trim() || undefined,
    businessStatus: String(raw.businessStatus ?? '').trim() || undefined,
    hours,
  };
}

/** Fetch details (including opening hours) for a known place id. */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const id = String(placeId ?? '').replace(/^places\//, '').trim();
  if (!id) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  let response: Response;
  try {
    response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DETAILS_FIELD_MASK,
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as RawPlace | null;
  return toPlaceDetails(data ?? undefined);
}

/**
 * Resolve a business by name (optionally biased by a known address) and return
 * its details. Used when a contact has no stored place id — Mapbox-sourced geo
 * carries a Mapbox feature id, not a Google place id.
 */
export async function searchPlaceDetails(
  query: string,
  opts: { near?: string; locationBias?: string } = {},
): Promise<PlaceDetails | null> {
  const textQuery = [query, opts.near].map((p) => String(p ?? '').trim()).filter(Boolean).join(' ');
  if (textQuery.length < 2) return null;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const body: Record<string, unknown> = {
    textQuery,
    maxResultCount: 1,
    includedRegionCodes: resolvePlacesRegionCodes(),
  };

  const { lat, lng } = await resolvePlacesLocationBias(opts.locationBias);
  body.locationBias = {
    circle: { center: { latitude: lat, longitude: lng }, radius: 50000 },
  };

  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as { places?: RawPlace[] } | null;
  return toPlaceDetails(data?.places?.[0]);
}

/**
 * Details for a business, preferring an exact place id and falling back to a
 * name/address search.
 */
export async function resolvePlaceDetails(input: {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
}): Promise<PlaceDetails | null> {
  const placeId = String(input.placeId ?? '').trim();
  // Mapbox feature ids ("poi.123", "address.456") are not Google place ids.
  if (placeId && !/^(?:poi|address|place|postcode|region|locality|neighborhood)\./i.test(placeId)) {
    const byId = await fetchPlaceDetails(placeId);
    if (byId) return byId;
  }

  const name = String(input.name ?? '').trim();
  const address = String(input.address ?? '').trim();
  if (!name && !address) return null;

  return searchPlaceDetails(name || address, { near: name ? address : undefined });
}
