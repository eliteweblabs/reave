/**
 * Contacts form fields: First name, Last name, company title.
 * Split a combined name into First/Last only when it is a real person name.
 * Never invent first/last by chopping a business title or search snippet.
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
  /\b(?:llc|l\.?l\.?c\.?|inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|co\.?|company|llp|pllc|p\.?c\.?|plc|gmbh|group|holdings|partners|associates|enterprises|industries|services|solutions|studio|studios|agency|consulting|construction|contracting|painting|painters|plumbing|electric(?:al)?|roofing|landscaping|cleaning|properties|realty|restaurant|cafe|clinic|media|productions?|records|record|shop|store|daycare|day\s*care|grooming|groomers?|kennels?|veterinary|veterinarian|salon|spa|boutique)\b/i;

const NAME_PARTICLES = new Set([
  'van',
  'von',
  'de',
  'del',
  'della',
  'der',
  'den',
  'di',
  'da',
  'dos',
  'das',
  'bin',
  'al',
  'la',
  'le',
  'du',
  'st',
  'saint',
]);

/** Words that appear in descriptions / listings, never in a real surname. */
const NON_PERSON_WORDS = new Set([
  'in',
  'at',
  'of',
  'near',
  'from',
  'the',
  'and',
  'or',
  'for',
  'with',
  'on',
  'by',
  'to',
  'a',
  'an',
  'they',
  'that',
  'which',
  'who',
  'sell',
  'sells',
  'located',
  'based',
  'serving',
  'offering',
  // Org / mailbox role tokens — "Apple Support" is a brand, not a person.
  'support',
  'help',
  'helpdesk',
  'noreply',
  'donotreply',
  'no-reply',
  'mailer',
  'newsletter',
  'notifications',
  'notification',
  'alerts',
  'alert',
  'billing',
  'sales',
  'service',
  'services',
  'team',
  'care',
  'desk',
  'info',
  'admin',
  'contact',
  'hello',
]);

const US_STATE_NAMES = new Set([
  'alabama',
  'alaska',
  'arizona',
  'arkansas',
  'california',
  'colorado',
  'connecticut',
  'delaware',
  'florida',
  'georgia',
  'hawaii',
  'idaho',
  'illinois',
  'indiana',
  'iowa',
  'kansas',
  'kentucky',
  'louisiana',
  'maine',
  'maryland',
  'massachusetts',
  'michigan',
  'minnesota',
  'mississippi',
  'missouri',
  'montana',
  'nebraska',
  'nevada',
  'ohio',
  'oklahoma',
  'oregon',
  'pennsylvania',
  'tennessee',
  'texas',
  'utah',
  'vermont',
  'virginia',
  'washington',
  'wisconsin',
  'wyoming',
]);

const NAME_TOKEN_RE = /^[\p{L}][\p{L}\p{M}'’.\-]*$/u;

export function naiveSplitPersonName(full: string): { firstName: string; lastName: string } {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

function nameTokens(value: string): string[] {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\.+$/g, '');
}

function isNameToken(word: string): boolean {
  const key = tokenKey(word);
  if (!key) return false;
  if (NAME_PARTICLES.has(key)) return true;
  if (NON_PERSON_WORDS.has(key)) return false;
  if (US_STATE_NAMES.has(key)) return false;
  if (BUSINESS_NAME_TOKEN_RE.test(key)) return false;
  return NAME_TOKEN_RE.test(word);
}

/** True when the string is a real person's given and/or family name — not a business or snippet. */
export function looksLikePersonName(value: string): boolean {
  const s = String(value || '').trim();
  if (!s || /\d/.test(s)) return false;
  if (isBusinessTitle(s)) return false;
  const parts = nameTokens(s);
  if (parts.length === 0 || parts.length > 4) return false;
  if (!parts.every(isNameToken)) return false;
  const particles = parts.filter((p) => NAME_PARTICLES.has(tokenKey(p)));
  if (parts.length === 4 && particles.length === 0) return false;
  return true;
}

export function looksLikePersonFirstName(value: string): boolean {
  const s = String(value || '').trim();
  if (!s) return true;
  const parts = nameTokens(s);
  if (parts.length > 2) return false;
  return looksLikePersonName(s);
}

export function looksLikePersonLastName(value: string): boolean {
  const s = String(value || '').trim();
  if (!s) return true;
  const parts = nameTokens(s);
  if (parts.length > 3) return false;
  if (parts.length === 3 && !parts.some((p) => NAME_PARTICLES.has(tokenKey(p)))) return false;
  return looksLikePersonName(s);
}

/** Strip legal/trade suffixes and punctuation for fuzzy business-title compare. */
export function normalizeBusinessNameCore(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
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

function firstIsCompanyBrand(first: string, company: string): boolean {
  if (!first || !company) return false;
  const naive = naiveSplitPersonName(company);
  if (first.toLowerCase() === naive.firstName.toLowerCase()) return true;
  const core = normalizeBusinessNameCore(company);
  const f = normalizeBusinessNameCore(first);
  if (!f || !core) return false;
  return core === f || core.startsWith(`${f} `);
}

/** True when first/last were invented by splitting a business, listing, or dictation. */
export function isInventedPersonName(
  first: string,
  last: string,
  company = '',
  fullName = '',
): boolean {
  if (!first && !last) return false;
  if (!looksLikePersonFirstName(first) || !looksLikePersonLastName(last)) return true;
  const joined = [first, last].filter(Boolean).join(' ');
  if (joined && !looksLikePersonName(joined)) return true;
  if (company && isSplitOfCompany(first, last, company)) return true;
  if (company && firstIsCompanyBrand(first, company) && !last) return true;
  if (company && firstIsCompanyBrand(first, company) && !looksLikePersonLastName(last)) return true;
  if (fullName && !looksLikePersonName(fullName)) {
    const naive = naiveSplitPersonName(fullName);
    if (first.toLowerCase() === naive.firstName.toLowerCase()) return true;
  }
  return false;
}

/**
 * First/Last for the contacts form.
 * Only keep First/Last when they are a real person name. Business titles,
 * Siri dictations, and search snippets stay out of those fields.
 */
export function splitClientNameParts(contact: ContactNameFields): {
  firstName: string;
  lastName: string;
} {
  const full = String(contact.name || '').trim();
  const company = String(contact.company || '').trim();
  const first = String(contact.firstName || '').trim();
  const last = String(contact.lastName || '').trim();

  if (first || last) {
    if (isInventedPersonName(first, last, company, full)) return { firstName: '', lastName: '' };
    return { firstName: first, lastName: last };
  }

  if (full && looksLikePersonName(full) && !company) return naiveSplitPersonName(full);
  return { firstName: '', lastName: '' };
}

/** Company title for the profile header. Never invent one by splitting a name. */
export function resolveClientCompany(contact: ContactNameFields): string {
  const company = String(contact.company || '').trim();
  if (company) return company;
  const full = String(contact.name || '').trim();
  if (full && !looksLikePersonName(full)) return full;
  return '';
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

export type ResolvedContactNameWrite = {
  name: string;
  company: string;
  omittedInventedPersonName: boolean;
  note?: string;
};

/**
 * Decide what to persist for name/company. Person first/last are written only
 * when they look like a real human name; otherwise the business stays in
 * company and first/last stay empty.
 */
export function resolveContactNameWrite(input: {
  name?: string | null;
  company?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  existingName?: string | null;
  existingCompany?: string | null;
}): ResolvedContactNameWrite {
  const existingName = String(input.existingName || '').trim();
  const existingCompany = String(input.existingCompany || '').trim();
  const requestedName = String(input.name || '').trim();
  const requestedCompany = String(input.company || '').trim();
  const first = String(input.firstName || '').trim();
  const last = String(input.lastName || '').trim();

  let company = requestedCompany || existingCompany;
  let omittedInventedPersonName = false;
  let note: string | undefined;
  let name = existingName;

  if (first || last) {
    if (isInventedPersonName(first, last, company, [first, last].filter(Boolean).join(' '))) {
      omittedInventedPersonName = true;
      note =
        'First/last name omitted — not a real person name found on the site or a listing. Leave those fields empty; put the business in company.';
    } else {
      name = [first, last].filter(Boolean).join(' ');
    }
  } else if (requestedName) {
    if (looksLikePersonName(requestedName)) {
      name = requestedName;
    } else {
      omittedInventedPersonName = true;
      note =
        'Name was a business or description, not a person. First/last left empty. Use company for the business title.';
      if (!company) company = requestedName;
      name = company || requestedName;
    }
  }

  if (name && !looksLikePersonName(name) && company) {
    name = company;
  }
  if (!name) name = company || existingName || requestedName;
  if (!company && name && !looksLikePersonName(name)) company = name;

  return { name, company, omittedInventedPersonName, note };
}
