/**
 * contactPortalEnrich.ts
 *
 * When a new contact is added, fire a background job that:
 *  1. Searches the web for the business (name + website / company)
 *  2. Fetches the business website for structured content
 *  3. Builds a rich Overview: headline, bio body, and labeled fields
 *     (hours, owner/contact, phone/email, address, years in business, etc.)
 *  4. Calls setContactPortal so the portal Overview tab is populated
 *
 * Runs non-blocking (void) — never throws into the caller.
 */

import { braveSearch } from './braveClient';
import { fetchUrl } from './fetchUrlClient';
import {
  extractPortal,
  getContact,
  setContactPortal,
  type ClientPortalField,
  type ContactRecord,
} from './contactApi';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clean(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

/** Extract the first plausible domain/URL from a contact's data. */
function guessWebsite(contact: ContactRecord): string | null {
  const notesText = clean(contact.notes);
  // Look for a URL in notes
  const urlMatch = notesText.match(/https?:\/\/[^\s,)]+/i);
  if (urlMatch) return urlMatch[0]!.replace(/[.,;)]+$/, '');
  // Check the website field if present
  const w = clean((contact as unknown as Record<string, unknown>).website);
  if (w) return w.startsWith('http') ? w : `https://${w}`;
  return null;
}

/** Very lightweight year-built guesser from text snippets. */
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
  // "owner: John Smith" / "president: Jane Doe" / "contact: Bob"
  const patterns = [
    /(?:owner|president|ceo|founder|principal|contact|proprietor)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      // Make sure it isn't just the company name repeated
      if (!m[1]!.toLowerCase().includes(companyName.toLowerCase().split(' ')[0]!)) {
        return m[1]!.trim();
      }
    }
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

    // ── 1. Brave web search ────────────────────────────────────────────────
    const query = company !== name ? `${company} ${name}` : name;
    let searchSnippets = '';
    try {
      const searchResult = await braveSearch({ query: `${query} business hours owner` });
      if (searchResult.ok && Array.isArray(searchResult.results)) {
        searchSnippets = searchResult.results
          .slice(0, 5)
          .map((r: { title?: string; description?: string; url?: string }) =>
            [r.title, r.description].filter(Boolean).join(' '),
          )
          .join(' ');
      }
    } catch {
      // search failed — continue with whatever we have
    }

    // ── 2. Fetch the business website if we have one ───────────────────────
    let siteText = '';
    let siteTitle = '';
    let resolvedWebsite: string | null = guessWebsite(contact);

    // If search returned a website we didn't already have, capture it
    if (!resolvedWebsite) {
      try {
        const searchResult2 = await braveSearch({ query: `${query} official website` });
        if (searchResult2.ok && Array.isArray(searchResult2.results) && searchResult2.results.length > 0) {
          const top = searchResult2.results[0];
          if (top && top.url && !top.url.includes('yelp.com') && !top.url.includes('facebook.com')) {
            resolvedWebsite = top.url;
          }
        }
      } catch {
        // ignore
      }
    }

    if (resolvedWebsite) {
      try {
        const fetched = await fetchUrl({ url: resolvedWebsite });
        if (fetched.ok) {
          siteText = (fetched.text ?? '').slice(0, 4000);
          siteTitle = fetched.title ?? '';
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
    const address = extractAddress(combinedText) ?? extractAddress(clean(contact.notes));

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
        ? `Est. ${yearFounded} (${yearsInBusiness} yrs)`
        : `Est. ${yearFounded}`;
      fields.push({ label: 'In Business', value: label });
    }

    // Build the body paragraph from search snippets
    let bodyParagraph = '';
    if (searchSnippets.length > 60) {
      // Use the first meaty sentence from search snippets as a bio
      const sentences = searchSnippets
        .split(/[.!?]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 40 && s.length < 300);
      if (sentences.length > 0) {
        bodyParagraph = sentences.slice(0, 3).join('. ').trim();
        if (!bodyParagraph.endsWith('.')) bodyParagraph += '.';
      }
    }

    if (fields.length === 0 && !bodyParagraph) {
      // Nothing useful found — skip writing a portal to avoid overwriting manually set data
      return;
    }

    // ── 5. Merge with any existing portal (don't wipe manual changes) ──────
    const fresh = await getContact(uid);
    const existing = fresh.ok ? extractPortal(fresh.data) : null;

    // Only auto-populate fields that are not already set
    const portalHeadline =
      existing?.headline || (company !== name ? company : siteTitle || company);
    const portalBody = existing?.body || bodyParagraph || undefined;

    // Merge fields: keep existing manual fields, append new discovered ones
    const existingLabels = new Set(
      (existing?.fields ?? []).map((f) => f.label.toLowerCase()),
    );
    const mergedFields = [
      ...(existing?.fields ?? []),
      ...fields.filter((f) => !existingLabels.has(f.label.toLowerCase())),
    ];

    // Also carry over website on the portal itself
    const portalWebsite =
      existing?.website || (resolvedWebsite ?? undefined);

    await setContactPortal(uid, {
      ...(existing ?? {}),
      enabled: existing?.enabled !== false, // keep revoked state
      headline: portalHeadline,
      body: portalBody,
      fields: mergedFields.length > 0 ? mergedFields : undefined,
      website: portalWebsite,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    // Non-blocking — silently log, never crash the caller
    console.warn('[contactPortalEnrich] enrichment failed', e instanceof Error ? e.message : e);
  }
}
