/**
 * contactPortalEnrich.ts
 *
 * When a new contact is added, fire a background job that:
 *  1. Searches the web for the business (name + company)
 *  2. Fetches the business website for structured content
 *  3. Builds a rich Overview: headline, bio body, and labeled fields
 *     (website, address, phone/email, hours, owner, years in business)
 *  4. Calls setContactPortal so the portal Overview tab is populated
 *
 * Runs non-blocking (void) — never throws into the caller.
 */

import { braveSearch } from './braveClient';
import { guessClientWebsite } from './clientBrand';
import { fetchUrl } from './fetchUrlClient';
import {
  extractPortal,
  getClientKind,
  getContact,
  setContactPortal,
  type ClientPortal,
  type ClientPortalField,
  type ContactRecord,
} from './contactApi';
import { enrichContactAddressFromPlaces } from './contactAddressFromPlaces';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clean(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

/** Extract the first plausible URL from a contact's notes field. */
function websiteFromNotes(contact: ContactRecord): string | null {
  const notesText = clean(contact.notes);
  const urlMatch = notesText.match(/https?:\/\/[^\s,)]+/i);
  if (urlMatch) return urlMatch[0]!.replace(/[.,;)]+$/, '');
  return null;
}

/** Very lightweight year-founded extractor from free text. */
function extractYearFounded(text: string): string | null {
  const m =
    text.match(/(?:founded|established|est\.?|since|serving.*since|in business since)[^\d]*(\d{4})/i) ??
    text.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (!m) return null;
  const yr = Number(m[1]);
  if (yr >= 1950 && yr <= new Date().getFullYear()) return String(yr);
  return null;
}

/** Pull hours of operation out of raw page/search text. */
function extractHours(text: string): string | null {
  const m = text.match(
    /(?:hours?(?:\s+of\s+operation)?|open)[:\s]+([^\n.]{10,80})/i,
  );
  return m ? m[1]!.trim() : null;
}

/** Pull an owner / contact name from text. */
function extractOwner(text: string, companyName: string): string | null {
  const m = text.match(
    /(?:owner|president|ceo|founder|principal|contact|proprietor)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
  );
  if (m) {
    const firstName = companyName.toLowerCase().split(' ')[0] ?? '';
    if (!m[1]!.toLowerCase().includes(firstName)) return m[1]!.trim();
  }
  return null;
}

/** Extract a street address from text. */
function extractAddress(text: string): string | null {
  const m = text.match(
    /\d{2,5}\s+[A-Z][a-zA-Z\s]{3,30}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Way|Court|Ct|Place|Pl)[.,\s]+[A-Z][a-zA-Z\s]{2,20},\s+[A-Z]{2}\s+\d{5}/,
  );
  return m ? m[0]!.trim() : null;
}

const ENRICHMENT_FIELD_LABELS = new Set([
  'hours',
  'owner / contact',
  'in business',
  'address',
]);

/** True when Overview already has enrichment content (manual or prior run). */
function overviewAlreadyPopulated(portal: ClientPortal | null): boolean {
  if (!portal) return false;
  if (contactStringField(portal.body).length > 20) return true;
  return (portal.fields ?? []).some((f) =>
    ENRICHMENT_FIELD_LABELS.has(f.label.trim().toLowerCase()),
  );
}

function buildBioParagraph(
  searchSnippets: string,
  metaDescription: string,
  siteText: string,
): string {
  const meta = metaDescription.trim();
  if (meta.length > 40 && meta.length < 600) return meta.endsWith('.') ? meta : `${meta}.`;

  if (searchSnippets.length > 60) {
    const sentences = searchSnippets
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40 && s.length < 300);
    if (sentences.length > 0) {
      let body = sentences.slice(0, 3).join('. ').trim();
      if (!body.endsWith('.')) body += '.';
      return body;
    }
  }

  if (siteText.length > 80) {
    const sentences = siteText
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40 && s.length < 300);
    if (sentences.length > 0) {
      let body = sentences.slice(0, 2).join('. ').trim();
      if (!body.endsWith('.')) body += '.';
      return body;
    }
  }

  return '';
}

/**
 * Load a contact and populate its portal Overview tab when appropriate.
 * Safe to call non-blocking: `void triggerContactPortalEnrich(uid).catch(() => {})`
 */
export async function triggerContactPortalEnrich(uid: string): Promise<void> {
  try {
    const trimmed = uid.trim();
    if (!trimmed) return;

    const res = await getContact(trimmed);
    if (!res.ok || res.data.archived) return;

    await enrichContactAddressFromPlaces(trimmed);

    if (getClientKind(res.data) !== 'professional') return;

    const portal = extractPortal(res.data);
    if (overviewAlreadyPopulated(portal)) return;

    await enrichContactPortal(res.data);
  } catch (e) {
    console.warn(
      '[contactPortalEnrich] trigger failed',
      e instanceof Error ? e.message : e,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call this non-blocking after a new contact is persisted.
 *
 * ```ts
 * void enrichContactPortal(result.data).catch(() => {});
 * ```
 */
export async function enrichContactPortal(contact: ContactRecord): Promise<void> {
  try {
    const name = clean(contact.name);
    const company = clean(contact.company) || name;
    const email = clean(contact.email);
    const phone = clean(contact.phone);
    const uid = clean(contact.uid);

    if (!uid || !name) return;

    const fresh = await getContact(uid);
    const existing = fresh.ok ? extractPortal(fresh.data) : null;
    if (overviewAlreadyPopulated(existing)) return;

    const contactForLookup = fresh.ok ? fresh.data : contact;

    // ── 1. Brave web search ────────────────────────────────────────────────
    const query = company !== name ? `${company} ${name}` : name;
    let searchSnippets = '';
    let resolvedWebsite =
      guessClientWebsite(contactForLookup, existing) ?? websiteFromNotes(contact);

    try {
      const searchResult = await braveSearch(`${query} business hours owner`, 5);
      if (searchResult.ok && searchResult.results.length > 0) {
        searchSnippets = searchResult.results
          .map((r) => [r.title, r.description].filter(Boolean).join(' '))
          .join(' ');

        // Grab a website from the top result if we don't have one yet
        if (!resolvedWebsite) {
          const top = searchResult.results[0];
          if (
            top?.url &&
            !top.url.includes('yelp.com') &&
            !top.url.includes('facebook.com') &&
            !top.url.includes('yellowpages') &&
            !top.url.includes('bbb.org')
          ) {
            resolvedWebsite = top.url;
          }
        }
      }
    } catch {
      // search failed — continue with whatever we have
    }

    // ── 2. Fetch the business website ──────────────────────────────────────
    let siteText = '';
    let siteTitle = '';
    let metaDescription = '';

    if (resolvedWebsite) {
      try {
        const fetched = await fetchUrl(resolvedWebsite);
        if (fetched.ok) {
          siteText = (fetched.data.content ?? '').slice(0, 4000);
          siteTitle = fetched.data.title ?? '';
          metaDescription = fetched.data.meta_description ?? '';
        }
      } catch {
        // site fetch failed — proceed with search data only
      }
    }

    const combinedText = [searchSnippets, siteText].join(' ');

    // ── 3. Extract structured info ─────────────────────────────────────────
    const yearFounded = extractYearFounded(combinedText);
    const yearsInBusiness = yearFounded
      ? String(new Date().getFullYear() - Number(yearFounded))
      : null;
    const hours = extractHours(combinedText);
    const owner = extractOwner(combinedText, company);
    const address =
      extractAddress(combinedText) ?? extractAddress(clean(contact.notes));

    // ── 4. Build the Overview fields ───────────────────────────────────────
    const fields: ClientPortalField[] = [];

    if (resolvedWebsite) {
      fields.push({ label: 'Website', value: resolvedWebsite });
    }
    if (address) {
      fields.push({ label: 'Address', value: address });
    }
    if (phone) {
      fields.push({ label: 'Phone', value: phone });
    }
    if (email) {
      fields.push({ label: 'Email', value: email });
    }
    if (hours) {
      fields.push({ label: 'Hours', value: hours });
    }
    if (owner) {
      fields.push({ label: 'Owner / Contact', value: owner });
    }
    if (yearFounded) {
      const label = yearsInBusiness
        ? `Est. ${yearFounded} (${yearsInBusiness} yrs in business)`
        : `Est. ${yearFounded}`;
      fields.push({ label: 'In Business', value: label });
    }

    const bodyParagraph = buildBioParagraph(searchSnippets, metaDescription, siteText);

    if (fields.length === 0 && !bodyParagraph) {
      // Nothing useful found — skip to avoid overwriting manually set data
      return;
    }

    // ── 5. Merge with any existing portal (preserve manual changes) ────────
    // Re-read after slow Brave/site fetches — address autocomplete often lands
    // during this window; spreading a stale `existing` would wipe it.
    const latestRes = await getContact(uid);
    const latest = latestRes.ok ? extractPortal(latestRes.data) : existing;

    const portalHeadline =
      latest?.headline ||
      existing?.headline ||
      (company !== name ? company : siteTitle || company);

    const portalBody = latest?.body || existing?.body || bodyParagraph || undefined;

    // Merge fields: keep existing, append newly discovered ones (no dupes)
    const baseFields = latest?.fields ?? existing?.fields ?? [];
    const existingLabels = new Set(baseFields.map((f) => f.label.toLowerCase()));
    const mergedFields = [
      ...baseFields,
      ...fields.filter((f) => !existingLabels.has(f.label.toLowerCase())),
    ];

    await setContactPortal(uid, {
      ...(latest ?? existing ?? {}),
      enabled: (latest ?? existing)?.enabled !== false,
      headline: portalHeadline,
      body: portalBody,
      fields: mergedFields.length > 0 ? mergedFields : undefined,
      website: latest?.website || existing?.website || resolvedWebsite || undefined,
      // Never clobber a newer admin address pick with a stale enrich snapshot.
      address: latest?.address ?? existing?.address,
      geo: latest?.geo ?? existing?.geo,
      addressWriteToken: latest?.addressWriteToken ?? existing?.addressWriteToken,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(
      '[contactPortalEnrich] enrichment failed',
      e instanceof Error ? e.message : e,
    );
  }
}
