/**
 * Contacts form fields: First name, Last name, company title.
 * Split a combined name into First/Last only when there is no company.
 * Keep in sync with public/admin/clients-panel.js.
 */

export type ContactNameFields = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
};

/** Legal / trade tokens that mark a string as a business title, not a person. */
export const BUSINESS_NAME_TOKEN_RE =
  /\b(?:llc|l\.?l\.?c\.?|inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|co\.?|company|llp|pllc|p\.?c\.?|plc|gmbh|group|holdings|partners|associates|enterprises|industries|services|solutions|studio|studios|agency|consulting|construction|contracting|painting|painters|plumbing|electric(?:al)?|roofing|landscaping|cleaning|properties|realty|restaurant|cafe|clinic|media|productions?|daycare|day\s*care|grooming|groomers?|kennels?|veterinary|veterinarian|salon|spa|boutique)\b/i;

export function naiveSplitPersonName(full: string): { firstName: string; lastName: string } {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

/** Strip legal/trade suffixes and punctuation for fuzzy business-title compare. */
export function normalizeBusinessNameCore(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(BUSINESS_NAME_TOKEN_RE, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBusinessTitle(value: string): boolean {
  const s = String(value || '').trim();
  return !!s && BUSINESS_NAME_TOKEN_RE.test(s);
}

/** True when two labels refer to the same business (incl. LLC vs trade-name variants). */
export function namesReferToSameBusiness(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const ca = normalizeBusinessNameCore(a);
  const cb = normalizeBusinessNameCore(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const ta = ca.split(' ');
  const tb = cb.split(' ');
  // Require multi-word cores so a lone "Pink" never matches "Pink Elephant".
  if (ta.length < 2 || tb.length < 2) return false;
  // Word-boundary prefix only — "john s" must not match "john smith".
  return ca.startsWith(`${cb} `) || cb.startsWith(`${ca} `);
}

/** True when first/last are just the company title chopped on the first space. */
function isSplitOfCompany(first: string, last: string, company: string): boolean {
  if (!first || !company) return false;
  const naive = naiveSplitPersonName(company);
  if (first.toLowerCase() !== naive.firstName.toLowerCase()) return false;
  return !last || last.toLowerCase() === naive.lastName.toLowerCase();
}

/**
 * First/Last for the contacts form.
 * Split a combined name only when there is no company title. If a company is
 * set, First/Last stay as entered — never the first word of the company.
 */
export function splitClientNameParts(contact: ContactNameFields): {
  firstName: string;
  lastName: string;
} {
  const full = String(contact.name || '').trim();
  const company = String(contact.company || '').trim();
  const first = String(contact.firstName || '').trim();
  const last = String(contact.lastName || '').trim();

  if (company) {
    if (isSplitOfCompany(first, last, company)) return { firstName: '', lastName: '' };
    return { firstName: first, lastName: last };
  }

  // Only a name — this is the one case we split into First / Last.
  if (first || last) return { firstName: first, lastName: last };
  if (full) return naiveSplitPersonName(full);
  return { firstName: '', lastName: '' };
}

/** Company title for the profile header. Never invent one by splitting a name. */
export function resolveClientCompany(contact: ContactNameFields): string {
  return String(contact.company || '').trim();
}

/**
 * Portal / outreach greeting: the First name field when it is a real person
 * name, otherwise the company title. Never the first word of the company.
 */
export function contactGreetingName(contact: ContactNameFields): string {
  const { firstName } = splitClientNameParts(contact);
  if (firstName) return firstName;
  return resolveClientCompany(contact);
}
