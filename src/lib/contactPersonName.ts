/**
 * The contacts form has First name, Last name, and a company title — no
 * combined Name field. contact-api still stores an internal `name` and
 * splitName()s it into first/last, so a company-only client comes back as
 * firstName "Four". Shared resolution blanks that so callers match the form.
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

function isNaiveSplitOf(first: string, last: string, source: string): boolean {
  if (!first || !source) return false;
  const naive = naiveSplitPersonName(source);
  return (
    first.toLowerCase() === naive.firstName.toLowerCase() &&
    last.toLowerCase() === naive.lastName.toLowerCase()
  );
}

/** Remainder after the first word is too long to be a family name. */
function lastNameLooksLikeBusinessRemainder(last: string): boolean {
  return last.split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * Person first/last for display. Blanks contact-api's derived split when `name`
 * is the company (or a business title), so "Four Leggers Doggy Daycare…" never
 * becomes firstName "Four".
 */
export function splitClientNameParts(contact: ContactNameFields): {
  firstName: string;
  lastName: string;
} {
  const full = String(contact.name || '').trim();
  const company = String(contact.company || '').trim();
  const first = String(contact.firstName || '').trim();
  const last = String(contact.lastName || '').trim();
  const person = [first, last].filter(Boolean).join(' ');

  // Business-only: name is the company (or a close business variant).
  if (company && full && namesReferToSameBusiness(full, company)) {
    return { firstName: '', lastName: '' };
  }

  // First/Last themselves are the company (or its naive split / variant).
  if (company && person) {
    if (
      isNaiveSplitOf(first, last, company) ||
      namesReferToSameBusiness(person, company) ||
      (full && namesReferToSameBusiness(person, full) && isBusinessTitle(person))
    ) {
      return { firstName: '', lastName: '' };
    }
  }

  // No company field: stored name is a business title that was split into person fields.
  if (!company && full && isBusinessTitle(full)) {
    const isNaiveFullSplit =
      (!first && !last) ||
      isNaiveSplitOf(first, last, full) ||
      (person && person.toLowerCase() === full.toLowerCase());
    if (isNaiveFullSplit) return { firstName: '', lastName: '' };
  }

  // contact-api split a long business title: "Four" / "Leggers Doggy Daycare…".
  if (first && lastNameLooksLikeBusinessRemainder(last)) {
    if (isNaiveSplitOf(first, last, full) || isNaiveSplitOf(first, last, company)) {
      return { firstName: '', lastName: '' };
    }
  }

  if (first || last) return { firstName: first, lastName: last };

  if (!full) return { firstName: '', lastName: '' };

  if (isBusinessTitle(full)) return { firstName: '', lastName: '' };

  return naiveSplitPersonName(full);
}

/** Company for the profile header — prefer stored company, else a business-only name. */
export function resolveClientCompany(
  contact: ContactNameFields,
  firstName = '',
  lastName = '',
): string {
  const company = String(contact.company || '').trim();
  if (company) return company;
  const full = String(contact.name || '').trim();
  if (full && !firstName && !lastName && isBusinessTitle(full)) return full;
  if (full && !firstName && !lastName && lastNameLooksLikeBusinessRemainder(naiveSplitPersonName(full).lastName)) {
    return full;
  }
  return '';
}

/**
 * Portal / outreach greeting: the First name field when it is a real person
 * name, otherwise the company title. Never the first word of the company.
 */
export function contactGreetingName(contact: ContactNameFields): string {
  const { firstName, lastName } = splitClientNameParts(contact);
  if (firstName) return firstName;
  return resolveClientCompany(contact, firstName, lastName);
}
