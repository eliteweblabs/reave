/**
 * Best-effort Google Places address for new business contacts.
 * Sets portal.address (+ Mapbox geocode) from company or contact name.
 *
 * When Places cannot return an exact street-level match, the miss is persisted
 * on the portal (`placesListing`) so audits can surface it with certainty.
 */

import { setClientPortalAddress } from './clientBrand';
import {
  extractPortal,
  getClientKind,
  getContact,
  setContactPortal,
  type ClientPortal,
  type PlacesListingRecord,
} from './contactApi';
import { lookupBusinessAddressMatch } from './googlePlacesAutocomplete';

const KINDS_WITH_ADDRESS_LOOKUP = new Set(['professional', 'proposed', 'service']);

export type PlacesAddressEnrichResult = {
  /** True only when a Places address was newly saved. */
  saved: boolean;
  listing: PlacesListingRecord;
};

/** Prefer company; fall back to contact name (audit/Siri stubs often omit company). */
export function businessNameForPlacesLookup(contact: {
  name?: string | null;
  company?: string | null;
}): string {
  const company = String(contact.company ?? '').trim();
  if (company) return company;
  return String(contact.name ?? '').trim();
}

function listingNow(
  partial: Omit<PlacesListingRecord, 'checkedAt'> & { checkedAt?: string },
): PlacesListingRecord {
  return {
    ...partial,
    checkedAt: partial.checkedAt || new Date().toISOString(),
  };
}

async function persistPlacesListing(
  uid: string,
  listing: PlacesListingRecord,
): Promise<void> {
  const res = await getContact(uid);
  if (!res.ok) return;
  const portal = extractPortal(res.data) ?? {};
  const next: ClientPortal = {
    ...portal,
    placesListing: listing,
    updatedAt: new Date().toISOString(),
  };
  const saved = await setContactPortal(uid, next);
  if (!saved.ok) {
    console.warn('[contactAddressFromPlaces] failed to persist placesListing', saved.error);
  }
}

/**
 * When a contact has no portal address yet, look up the business on Google Places
 * and persist the formatted address. Always records `placesListing` status when a
 * lookup runs so audits can flag businesses not in the Google Places API.
 *
 * No-op (skipped) when Places is unconfigured, kind is personal, or an address
 * is already saved.
 */
export async function enrichContactAddressFromPlaces(
  uid: string,
): Promise<PlacesAddressEnrichResult> {
  const trimmedUid = uid.trim();
  const skipped = (reason: PlacesListingRecord['status']): PlacesAddressEnrichResult => ({
    saved: false,
    listing: listingNow({ status: reason }),
  });

  if (!trimmedUid) return skipped('skipped');

  try {
    const res = await getContact(trimmedUid);
    if (!res.ok || res.data.archived) return skipped('skipped');

    const contact = res.data;
    if (!KINDS_WITH_ADDRESS_LOOKUP.has(getClientKind(contact))) {
      return skipped('skipped');
    }

    const portal = extractPortal(contact);
    const recentListing = portal?.placesListing;
    if (recentListing?.checkedAt) {
      const ageMs = Date.now() - Date.parse(recentListing.checkedAt);
      if (
        Number.isFinite(ageMs) &&
        ageMs >= 0 &&
        ageMs < 120_000 &&
        (recentListing.status === 'matched' || recentListing.status === 'not_listed')
      ) {
        return { saved: false, listing: recentListing };
      }
    }

    const existingAddress = String(portal?.address ?? '').trim();
    if (existingAddress) {
      const listing = listingNow({
        status: 'matched',
        query: businessNameForPlacesLookup(contact) || undefined,
        address: existingAddress,
        placeId: portal?.geo?.placeId,
      });
      // Refresh status so audits know an address is already on file.
      if (portal?.placesListing?.status !== 'matched') {
        await persistPlacesListing(trimmedUid, listing);
      }
      return { saved: false, listing };
    }

    const query = businessNameForPlacesLookup(contact);
    if (query.length < 2) {
      const listing = listingNow({ status: 'skipped', query });
      await persistPlacesListing(trimmedUid, listing);
      return { saved: false, listing };
    }

    const match = await lookupBusinessAddressMatch(query);
    if (match.status === 'unavailable') {
      const listing = listingNow({ status: 'unavailable', query });
      await persistPlacesListing(trimmedUid, listing);
      return { saved: false, listing };
    }

    if (match.status === 'not_listed') {
      const listing = listingNow({ status: 'not_listed', query });
      await persistPlacesListing(trimmedUid, listing);
      return { saved: false, listing };
    }

    const saved = await setClientPortalAddress(trimmedUid, match.place.description);
    const listing = listingNow({
      // Save failure is not "not listed" — Places matched; persist failed separately.
      status: saved.ok ? 'matched' : 'unavailable',
      query,
      address: match.place.description,
      placeId: match.place.placeId || undefined,
    });
    // Re-read + attach listing so audits see Places status even if address write raced.
    await persistPlacesListing(trimmedUid, listing);
    return { saved: saved.ok, listing };
  } catch (e) {
    console.warn(
      '[contactAddressFromPlaces] lookup failed',
      e instanceof Error ? e.message : e,
    );
    const listing = listingNow({ status: 'unavailable' });
    try {
      await persistPlacesListing(trimmedUid, listing);
    } catch {
      /* ignore */
    }
    return { saved: false, listing };
  }
}

/** Non-blocking wrapper for fire-and-forget call sites. */
export function triggerContactAddressFromPlaces(uid: string): void {
  void enrichContactAddressFromPlaces(uid).catch((e) => {
    console.warn(
      '[contactAddressFromPlaces] trigger failed',
      e instanceof Error ? e.message : e,
    );
  });
}
