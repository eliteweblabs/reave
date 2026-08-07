/**
 * Backfill normalized opening hours onto a contact's portal.
 *
 * Order of preference:
 *   1. Google Place Details (structured `regularOpeningHours`).
 *   2. The legacy free-text `Hours` portal field, parsed best-effort.
 *
 * Coordinates are filled in opportunistically from the same Places response so
 * an audit prospect that was never geocoded still becomes routable.
 */

import {
  hasAnyHours,
  parseHoursText,
  type BusinessHours,
} from './businessHours';
import {
  extractPortal,
  getContact,
  setContactPortal,
  type ClientPortal,
  type ContactRecord,
} from './contactApi';
import { businessNameForPlacesLookup } from './contactAddressFromPlaces';
import { resolvePlaceDetails } from './googlePlaceDetails';

export type HoursEnrichOutcome = {
  uid: string;
  name: string;
  /** Where the saved hours came from, or null when none could be resolved. */
  source: BusinessHours['source'] | null;
  saved: boolean;
  /** True when coordinates were added or corrected as a side effect. */
  geoUpdated: boolean;
  /** Google's business status, when it flagged the place as closed. */
  businessStatus?: string;
  reason?: string;
};

/** Free-text hours a previous enrichment pass stashed in portal.fields. */
export function hoursFieldText(portal: ClientPortal | null | undefined): string {
  const field = (portal?.fields ?? []).find((f) => /^hours\b/i.test(f.label));
  return String(field?.value ?? '').trim();
}

function contactDisplayName(contact: ContactRecord): string {
  return String(contact.company ?? '').trim() || String(contact.name ?? '').trim() || contact.uid;
}

/**
 * Resolve and persist hours for one contact.
 *
 * `force` re-fetches even when hours are already stored, which is how a stale
 * week (a prospect that changed their hours) gets refreshed.
 */
export async function enrichContactHours(
  uid: string,
  opts: { force?: boolean } = {},
): Promise<HoursEnrichOutcome> {
  const trimmedUid = String(uid ?? '').trim();
  if (!trimmedUid) {
    return { uid: '', name: '', source: null, saved: false, geoUpdated: false, reason: 'missing uid' };
  }

  const res = await getContact(trimmedUid);
  if (!res.ok) {
    return {
      uid: trimmedUid,
      name: '',
      source: null,
      saved: false,
      geoUpdated: false,
      reason: res.error,
    };
  }

  const contact = res.data;
  const name = contactDisplayName(contact);
  const portal = extractPortal(contact) ?? {};

  const hasCoords =
    Number.isFinite(Number(portal.geo?.lat)) && Number.isFinite(Number(portal.geo?.lng));

  // Only skip when there is nothing left to resolve — hours alone are not
  // enough, since an inquiry without coordinates cannot be routed.
  if (!opts.force && hasAnyHours(portal.hours) && hasCoords) {
    return {
      uid: trimmedUid,
      name,
      source: portal.hours?.source ?? null,
      saved: false,
      geoUpdated: false,
      reason: 'already has hours and coordinates',
    };
  }

  const query = businessNameForPlacesLookup(contact);
  const address = String(portal.address ?? '').trim();

  let hours: BusinessHours | null = null;
  let businessStatus: string | undefined;
  let geo = portal.geo;
  let geoUpdated = false;
  let resolvedAddress = address;

  if (query.length >= 2 || address) {
    const place = await resolvePlaceDetails({
      placeId: portal.geo?.placeId,
      name: query,
      address,
    });

    if (place) {
      businessStatus = place.businessStatus;
      if (hasAnyHours(place.hours)) hours = place.hours;

      const hasCoords = Number.isFinite(geo?.lat) && Number.isFinite(geo?.lng);
      if (!hasCoords && place.lat != null && place.lng != null) {
        geo = {
          lat: place.lat,
          lng: place.lng,
          placeId: place.placeId,
          geocodedAt: new Date().toISOString(),
        };
        geoUpdated = true;
      } else if (hasCoords && !geo?.placeId && place.placeId) {
        geo = { ...geo!, placeId: place.placeId };
        geoUpdated = true;
      }

      if (!resolvedAddress && place.formattedAddress) resolvedAddress = place.formattedAddress;
    }
  }

  if (!hours) {
    const fromText = parseHoursText(hoursFieldText(portal));
    if (hasAnyHours(fromText)) hours = fromText;
  }

  // Coordinates are what make an inquiry routable at all, so fall back to the
  // plain geocoder when Places had no match for the business name.
  const stillNoCoords = !Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lng);
  if (stillNoCoords && resolvedAddress) {
    const { resolveAddressCoordinates } = await import('./mapbox');
    const geocoded = await resolveAddressCoordinates(resolvedAddress);
    if (geocoded) {
      geo = {
        lat: geocoded.lat,
        lng: geocoded.lng,
        placeId: geo?.placeId,
        geocodedAt: geocoded.geocodedAt ?? new Date().toISOString(),
      };
      geoUpdated = true;
    }
  }

  if (!hours && !geoUpdated) {
    return {
      uid: trimmedUid,
      name,
      source: null,
      saved: false,
      geoUpdated: false,
      businessStatus,
      reason: 'no hours found',
    };
  }

  const nextPortal: ClientPortal = { ...portal };
  if (hours) nextPortal.hours = hours;
  if (geo) nextPortal.geo = geo;
  if (resolvedAddress && !address) nextPortal.address = resolvedAddress;

  const saved = await setContactPortal(trimmedUid, nextPortal);
  if (!saved.ok) {
    return {
      uid: trimmedUid,
      name,
      source: hours?.source ?? null,
      saved: false,
      geoUpdated: false,
      businessStatus,
      reason: saved.error,
    };
  }

  return {
    uid: trimmedUid,
    name,
    source: hours?.source ?? null,
    saved: true,
    geoUpdated,
    businessStatus,
  };
}

export type HoursBackfillResult = {
  /** Contacts behind open inquiries that still lack hours or coordinates. */
  pending: number;
  processed: number;
  saved: number;
  fromPlaces: number;
  fromText: number;
  geoFilled: number;
  /** Still missing after this batch — the caller can run again. */
  remaining: number;
  outcomes: HoursEnrichOutcome[];
};

/**
 * Fill in hours (and any missing coordinates) for the contacts behind open
 * inquiries.
 *
 * Batched on purpose: each contact costs a Google Place Details call, so a
 * ~70-inquiry backlog is chunked to keep any single request well inside a
 * request timeout. Call repeatedly until `remaining` is 0.
 */
export async function backfillInquiryHours(
  opts: { limit?: number; force?: boolean } = {},
): Promise<HoursBackfillResult> {
  const limit = Math.max(1, Math.min(Number(opts.limit ?? 20), 100));
  const force = opts.force === true;

  const { storeListWork } = await import('./workStore');
  const { hasAnyHours: hasHours } = await import('./businessHours');

  const jobs = await storeListWork({ status: 'inquiry' });
  const uids = [...new Set(jobs.map((job) => String(job.contact_uid ?? '').trim()).filter(Boolean))];

  // Decide who needs work before spending any Places calls.
  const needsWork: string[] = [];
  for (const uid of uids) {
    if (force) {
      needsWork.push(uid);
      continue;
    }
    const res = await getContact(uid);
    if (!res.ok || res.data.archived) continue;
    const portal = extractPortal(res.data);
    const hasCoords =
      Number.isFinite(Number(portal?.geo?.lat)) && Number.isFinite(Number(portal?.geo?.lng));
    if (!hasHours(portal?.hours) || !hasCoords) needsWork.push(uid);
  }

  const batch = needsWork.slice(0, limit);
  const outcomes: HoursEnrichOutcome[] = [];
  for (const uid of batch) {
    outcomes.push(await enrichContactHours(uid, { force }));
  }

  const saved = outcomes.filter((o) => o.saved);

  return {
    pending: needsWork.length,
    processed: outcomes.length,
    saved: saved.length,
    fromPlaces: saved.filter((o) => o.source === 'places').length,
    fromText: saved.filter((o) => o.source === 'text').length,
    geoFilled: saved.filter((o) => o.geoUpdated).length,
    remaining: Math.max(0, needsWork.length - outcomes.length),
    outcomes,
  };
}
