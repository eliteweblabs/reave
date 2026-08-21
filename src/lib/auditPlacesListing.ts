/**
 * Ensure Google Places "not listed" findings always land in audit markdown
 * and report cards — independent of agent prose quality.
 */

import {
  extractPortal,
  getContact,
  type PlacesListingRecord,
} from './contactApi';

export function googlePlacesNotListedBullet(
  businessName: string,
  query?: string,
): string {
  const name = businessName.trim() || 'This business';
  const q = (query || businessName).trim();
  const matchNote = q ? ` (no business match found)` : '';
  return (
    `- Google Business Profile: Missing — ${name} is not listed in the Google Places API` +
    `${matchNote}. Local customers will not find them on Google Maps.`
  );
}

/** Rewrite leftover "address match" phrasing on already-written audits. */
export function rewriteGooglePlacesNotListedCopy(text: string): string {
  return text.replace(
    /no exact (?:street-level )?address match(?: for "[^"]+")?/gi,
    'no business match found',
  );
}

export function auditMentionsGooglePlacesNotListed(body: string): boolean {
  const text = body.toLowerCase();
  return (
    text.includes('google places api') &&
    (/not listed/.test(text) ||
      /no exact address match/.test(text) ||
      /no business match found/.test(text))
  );
}

/**
 * Inject or replace the Google Business Profile bullet when Places found no
 * business-name match. Idempotent.
 */
export function ensureGooglePlacesNotListedInAuditBody(
  body: string,
  opts: { businessName: string; query?: string },
): string {
  const src = rewriteGooglePlacesNotListedCopy(body ?? '');
  if (!src.trim()) return src;
  if (auditMentionsGooglePlacesNotListed(src)) return src;

  const bullet = googlePlacesNotListedBullet(opts.businessName, opts.query);
  const gbpLine = /^([ \t]*[-*][ \t]*)?Google Business Profile:.*$/im;
  if (gbpLine.test(src)) {
    return src.replace(gbpLine, bullet);
  }

  const presenceHeading = /^(###[ \t]+Online Presence[^\n]*\n)/im;
  if (presenceHeading.test(src)) {
    return src.replace(presenceHeading, `$1${bullet}\n`);
  }

  return `${src.trimEnd()}\n\n### Online Presence\n${bullet}\n`;
}

export function placesListingMeansNotListed(
  listing: PlacesListingRecord | null | undefined,
): boolean {
  return listing?.status === 'not_listed';
}

/** `false` when Places confirmed not listed; `null` when unknown / unavailable. */
export function googlePlacesListedFlag(
  listing: PlacesListingRecord | null | undefined,
): boolean | null {
  if (!listing) return null;
  if (listing.status === 'not_listed') return false;
  if (listing.status === 'matched') return true;
  return null;
}

/** Load Places listing flag for a contact uid (for report-card builders). */
export async function googlePlacesListedForContact(
  contactUid: string | null | undefined,
): Promise<boolean | null> {
  const uid = String(contactUid ?? '').trim();
  if (!uid) return null;
  try {
    const res = await getContact(uid);
    if (!res.ok) return null;
    return googlePlacesListedFlag(extractPortal(res.data)?.placesListing);
  } catch {
    return null;
  }
}
