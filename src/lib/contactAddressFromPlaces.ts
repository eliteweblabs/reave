/**
 * Best-effort Google Places address for new business contacts.
 * Sets portal.address (+ Mapbox geocode) from company or contact name.
 */

import { setClientPortalAddress } from './clientBrand';
import {
  extractPortal,
  getClientKind,
  getContact,
} from './contactApi';
import { lookupBusinessAddress } from './googlePlacesAutocomplete';

const KINDS_WITH_ADDRESS_LOOKUP = new Set(['professional', 'proposed', 'service']);

/** Prefer company; fall back to contact name (audit/Siri stubs often omit company). */
export function businessNameForPlacesLookup(contact: {
  name?: string | null;
  company?: string | null;
}): string {
  const company = String(contact.company ?? '').trim();
  if (company) return company;
  return String(contact.name ?? '').trim();
}

/**
 * When a contact has no portal address yet, look up the business on Google Places
 * and persist the formatted address. No-op when Places is unconfigured, kind is
 * personal, or an address is already saved.
 */
export async function enrichContactAddressFromPlaces(uid: string): Promise<boolean> {
  const trimmedUid = uid.trim();
  if (!trimmedUid) return false;

  try {
    const res = await getContact(trimmedUid);
    if (!res.ok || res.data.archived) return false;

    const contact = res.data;
    if (!KINDS_WITH_ADDRESS_LOOKUP.has(getClientKind(contact))) return false;

    const portal = extractPortal(contact);
    if (String(portal?.address ?? '').trim()) return false;

    const query = businessNameForPlacesLookup(contact);
    if (query.length < 2) return false;

    const place = await lookupBusinessAddress(query);
    if (!place?.description) return false;

    const saved = await setClientPortalAddress(trimmedUid, place.description);
    return saved.ok;
  } catch (e) {
    console.warn(
      '[contactAddressFromPlaces] lookup failed',
      e instanceof Error ? e.message : e,
    );
    return false;
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
