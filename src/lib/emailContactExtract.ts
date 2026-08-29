/**
 * Extract client contact details from inbound emails (Add to contacts, meeting
 * auto-book) and ensure they exist in contact-api when needed.
 */

import { createContact, isContactApiConfigured, resolveContact } from './contactApi';
import { parseSenderEmail, parseSenderName } from './emailAddress';
import { looksLikePersonName } from './contactPersonName';

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'mail.com',
  'zoho.com',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'ya.ru',
  'fastmail.com',
  'tutanota.com',
  'tuta.io',
  'comcast.net',
  'verizon.net',
  'att.net',
  'sbcglobal.net',
  'bellsouth.net',
  'charter.net',
  'cox.net',
  'earthlink.net',
  'optonline.net',
  'frontier.com',
  'shaw.ca',
  'rogers.com',
]);

/**
 * Role/shared mailbox local-parts (admin@, info@, sales@…). These are not a
 * person's name, so when we know the company we display that instead of a
 * meaningless "Admin" contact.
 */
const GENERIC_MAILBOX_LOCALPARTS = new Set([
  'admin',
  'administrator',
  'info',
  'information',
  'support',
  'help',
  'helpdesk',
  'hello',
  'hi',
  'hey',
  'contact',
  'contactus',
  'sales',
  'office',
  'team',
  'billing',
  'accounts',
  'accounting',
  'ar',
  'ap',
  'service',
  'services',
  'enquiries',
  'enquiry',
  'inquiries',
  'inquiry',
  'noreply',
  'donotreply',
  'mail',
  'email',
  'marketing',
  'webmaster',
  'postmaster',
  'general',
  'main',
  'reception',
  'orders',
]);

/** Common words smashed together in business domain labels (longest first). */
const DOMAIN_WORD_SPLITS = [
  'fireprotection',
  'fire protection',
  'financial',
  'protection',
  'security',
  'solutions',
  'services',
  'consulting',
  'construction',
  'engineering',
  'properties',
  'management',
  'technology',
  'technologies',
  'inner',
  'city',
  'fire',
  'auto',
  'group',
  'company',
  'corp',
  'inc',
  'llc',
];

export type ExtractedEmailContact = {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  company: string | null;
  phone?: string | null;
  website?: string | null;
};

/** Shape used to open the New Contact form from an inbox sender. */
export type ContactFormPrefillFromEmail = {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  website: string;
  /** Combined label for APIs that still take a single name. */
  name: string;
};

export function isGenericEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return true;
  if (GENERIC_EMAIL_DOMAINS.has(d)) return true;
  const parts = d.split('.');
  if (parts.length >= 2) {
    const base = parts.slice(-2).join('.');
    if (GENERIC_EMAIL_DOMAINS.has(base)) return true;
  }
  return false;
}

/**
 * True when an address is a shared/role mailbox (admin@, info@, sales@…) rather
 * than a specific person. Such addresses shouldn't be shown as a contact name.
 */
export function isGenericMailbox(email: string): boolean {
  const local = email.split('@')[0]?.trim().toLowerCase() ?? '';
  if (!local) return false;
  if (GENERIC_MAILBOX_LOCALPARTS.has(local)) return true;
  const normalized = local.replace(/[._+-]+/g, '');
  return GENERIC_MAILBOX_LOCALPARTS.has(normalized);
}

/**
 * The best human-facing name for an inbound contact: the sender's real name
 * when we have one, otherwise the company (for role mailboxes like admin@),
 * falling back to the derived display name.
 */
export function preferredContactName(extracted: ExtractedEmailContact): string {
  if (extracted.company && isGenericMailbox(extracted.email)) {
    return extracted.company;
  }
  if (extracted.company && !extracted.firstName && !extracted.lastName) {
    return extracted.company;
  }
  return extracted.displayName;
}

function titleCaseWords(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Split CamelCase / PascalCase tokens: AppleSupport → Apple Support. */
function splitCamelCase(text: string): string {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function parsePersonName(raw: string): { firstName: string; lastName: string } {
  const s = raw.trim();
  if (!s) return { firstName: '', lastName: '' };
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((p) => p.trim());
    return { firstName: first || '', lastName: last || '' };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

function nameFromEmailLocal(email: string): string {
  const local = email.split('@')[0]?.trim() ?? '';
  if (!local) return '';
  const smashed = expandSmashedOrgLocal(local);
  if (smashed) return smashed;
  const cleaned = splitCamelCase(local.replace(/[._+-]+/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return titleCaseWords(cleaned);
}

function companyFromEmailDomain(email: string): string | null {
  const host = email.split('@')[1]?.trim().toLowerCase();
  if (!host || isGenericEmailDomain(host)) return null;

  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;

  let companyLabel = labels[labels.length - 2]!;
  if (['mail', 'email', 'smtp', 'www', 'web'].includes(labels[0]!) && labels.length >= 3) {
    companyLabel = labels[labels.length - 2]!;
  }

  if (!companyLabel || companyLabel.length < 3) return null;

  let spaced = companyLabel.replace(/[-_]+/g, ' ');
  if (!spaced.includes(' ')) {
    let lower = spaced.toLowerCase();
    for (const phrase of DOMAIN_WORD_SPLITS) {
      const needle = phrase.replace(/\s+/g, '').toLowerCase();
      if (needle.length < 4) continue;
      lower = lower.replace(new RegExp(needle, 'gi'), ` ${phrase} `);
    }
    spaced = lower.replace(/\s+/g, ' ').trim();
  }

  const company = titleCaseWords(spaced);
  return company.length >= 3 ? company : null;
}

function stripReplyTail(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^[-–—]{3,}\s*(Original Message|Forwarded message)/i.test(line.trim())) break;
    if (/^From:\s+.+/i.test(line.trim()) && out.length > 3) break;
    out.push(line);
  }
  return out.join('\n');
}

function extractCompanyFromSignature(body: string): string | null {
  const trimmed = stripReplyTail(body).trim();
  if (!trimmed) return null;
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const tail = lines.slice(-18);

  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i]!;
    if (line.length > 80 || line.includes('@') || /^https?:\/\//i.test(line)) continue;
    if (
      /\b(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|Co\.|Group|Fire Protection|Services|Solutions)\b/i.test(
        line,
      )
    ) {
      return line.replace(/\s*[|·|].*$/, '').trim();
    }
  }

  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i]!;
    if (line.length < 4 || line.length > 55) continue;
    if (/^(\+?\d|\(\d{3}\)|www\.|https?:)/i.test(line)) continue;
    if (line.split(/\s+/).length > 5) continue;
    if (/\b(was|were|used|your|our|this|that|please|thank|thanks|sign\s*in)\b/i.test(line)) {
      continue;
    }
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}$/.test(line) && !/\b(LLC|Inc|Corp|Ltd|Co)\b/.test(line)) {
      continue;
    }
    if (/^[A-Z0-9][A-Za-z0-9&'’\-.,\s]{2,}$/.test(line) && line.split(/\s+/).length >= 2) {
      return line;
    }
  }

  return null;
}

function extractPhoneFromSignature(body: string): string | null {
  const trimmed = stripReplyTail(body).trim();
  if (!trimmed) return null;
  const labeled = trimmed.match(
    /(?:(?:tel|phone|mobile|cell|m|direct|office)\.?\s*[:#]?\s*)([+()]?[\d][\d\s()./-]{6,}\d)/i,
  );
  if (labeled?.[1]) {
    const digits = labeled[1].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return labeled[1].trim();
  }
  const bare = trimmed.match(
    /(?:^|\s)(\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})(?:\s|$)/m,
  );
  if (bare?.[1]) {
    const digits = bare[1].replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return bare[1].trim();
  }
  return null;
}

function extractWebsiteFromSignature(body: string): string | null {
  const trimmed = stripReplyTail(body).trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\b((?:https?:\/\/|www\.)[^\s<>"']+)/i);
  if (!m?.[1]) return null;
  let url = m[1].replace(/[),.]+$/, '');
  if (url.toLowerCase().startsWith('www.')) url = `https://${url}`;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function companyFromSummary(summary: string): string | null {
  const m = summary.match(/\bfrom\s+(.+?)\s+(?:wants|would like|asked|requested|is asking)\b/i);
  const candidate = m?.[1]?.trim();
  if (!candidate || candidate.length < 4 || candidate.length > 60) return null;
  if (/^(a|the|an)\b/i.test(candidate)) return null;
  return candidate;
}

/** Prefer the longer label when one contains the other (Apple Support > Apple). */
function preferRicherLabel(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const x = String(preferred || '').trim();
  const y = String(fallback || '').trim();
  if (!x) return y || null;
  if (!y) return x || null;
  const xl = x.toLowerCase();
  const yl = y.toLowerCase();
  if (xl === yl) return x;
  if (xl.includes(yl)) return x;
  if (yl.includes(xl)) return y;
  // Unrelated strings (display name vs a body sentence) — keep preferred.
  return x;
}

const ORG_ROLE_SUFFIXES = [
  'support',
  'helpdesk',
  'help',
  'billing',
  'sales',
  'noreply',
  'donotreply',
  'notifications',
  'notification',
  'mailer',
  'newsletter',
  'service',
  'services',
  'team',
  'care',
  'info',
  'admin',
  'contact',
];

/**
 * Expand smashed brand+role locals after lowercasing (applesupport → Apple Support).
 * CamelCase is handled separately in nameFromEmailLocal.
 */
function expandSmashedOrgLocal(local: string): string | null {
  const raw = String(local || '').trim();
  if (!raw || /[._+\s-]/.test(raw)) return null;
  const lower = raw.toLowerCase();
  for (const role of ORG_ROLE_SUFFIXES) {
    if (lower.length <= role.length + 2) continue;
    if (!lower.endsWith(role)) continue;
    const brand = raw.slice(0, raw.length - role.length);
    if (brand.length < 2) continue;
    return titleCaseWords(`${splitCamelCase(brand)} ${role}`);
  }
  return null;
}

/**
 * True when a From display name / local-part looks like a brand or role desk
 * (Apple Support, Acme Billing) rather than a person's name.
 */
export function looksLikeOrgSenderLabel(label: string, email = ''): boolean {
  const s = String(label || '').trim();
  if (!s) return false;
  if (isGenericMailbox(email)) return true;
  if (!looksLikePersonName(s)) return true;
  const local = email.split('@')[0] || '';
  if (expandSmashedOrgLocal(local)) return true;
  if (/[a-z][A-Z]/.test(local) && nameFromEmailLocal(email).split(/\s+/).length >= 2) {
    const fromLocal = nameFromEmailLocal(email).toLowerCase();
    if (fromLocal === s.toLowerCase()) return true;
  }
  return false;
}

export function extractContactFromInboundEmail(input: {
  from: string;
  bodyText?: string;
  summary?: string;
}): ExtractedEmailContact {
  const email = parseSenderEmail(input.from);
  const fromName = parseSenderName(input.from);
  const localName = nameFromEmailLocal(email);
  const label = (fromName || localName).trim();

  const body = String(input.bodyText ?? '');
  const summary = String(input.summary ?? '');
  const domainCompany = companyFromEmailDomain(email);
  const signatureCompany = extractCompanyFromSignature(body);
  const summaryCompany = companyFromSummary(summary);
  const phone = extractPhoneFromSignature(body);
  const website = extractWebsiteFromSignature(body);

  let firstName = '';
  let lastName = '';
  let company: string | null = null;

  if (label && !looksLikeOrgSenderLabel(label, email) && looksLikePersonName(label)) {
    const parsed = parsePersonName(label);
    firstName = parsed.firstName;
    lastName = parsed.lastName;
    company = preferRicherLabel(signatureCompany, preferRicherLabel(summaryCompany, domainCompany));
  } else {
    // Brand / role / desk — put the richest label in company, not First/Last.
    company = preferRicherLabel(
      label || null,
      preferRicherLabel(signatureCompany, preferRicherLabel(summaryCompany, domainCompany)),
    );
    if (!label && email.includes('@') && !isGenericMailbox(email) && !domainCompany) {
      const localOnly = localName.split(/\s+/)[0] ?? '';
      if (localOnly && looksLikePersonName(localOnly)) firstName = localOnly;
    }
  }

  const displayName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    company ||
    fromName ||
    localName ||
    'Guest';

  return {
    email,
    firstName,
    lastName,
    displayName,
    company,
    phone,
    website,
  };
}

/** Prefill fields for the admin New Contact drawer. */
export function contactFormPrefillFromInboundEmail(input: {
  from: string;
  bodyText?: string;
  summary?: string;
}): ContactFormPrefillFromEmail {
  const extracted = extractContactFromInboundEmail(input);
  const company = String(extracted.company || '').trim();
  const firstName = String(extracted.firstName || '').trim();
  const lastName = String(extracted.lastName || '').trim();
  const name =
    [firstName, lastName].filter(Boolean).join(' ').trim() || company || extracted.displayName;
  return {
    email: extracted.email,
    firstName,
    lastName,
    company,
    phone: String(extracted.phone || '').trim(),
    website: String(extracted.website || '').trim(),
    name,
  };
}

function contactFromResolve(data: unknown): { uid: string; name: string } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const match = String(payload.match ?? '').toLowerCase();
  if (match === 'none') return null;
  const contact = payload.contact as Record<string, unknown> | undefined;
  const uid = contact?.uid != null ? String(contact.uid) : '';
  if (!uid) return null;
  return {
    uid,
    name: contact?.name != null ? String(contact.name).trim() : '',
  };
}

export async function ensureContactForMeetingEmail(input: {
  from: string;
  bodyText?: string;
  summary?: string;
  existingContactUid?: string | null;
  existingContactName?: string | null;
}): Promise<
  | { ok: true; uid: string; name: string; company: string | null; created: boolean }
  | { ok: false; error: string }
  | null
> {
  if (!isContactApiConfigured()) return null;

  if (input.existingContactUid?.trim()) {
    return {
      ok: true,
      uid: input.existingContactUid.trim(),
      name: input.existingContactName?.trim() || 'Contact',
      company: null,
      created: false,
    };
  }

  const extracted = extractContactFromInboundEmail(input);
  if (!extracted.email.includes('@')) {
    return { ok: false, error: 'No sender email' };
  }

  const displayName = preferredContactName(extracted);
  const resolved = await resolveContact({ email: extracted.email, name: displayName });
  if (resolved.ok) {
    const hit = contactFromResolve(resolved.data);
    if (hit) {
      return {
        ok: true,
        uid: hit.uid,
        name: hit.name || displayName,
        company: extracted.company,
        created: false,
      };
    }
  }

  const created = await createContact({
    name: displayName,
    email: extracted.email,
    company: extracted.company ?? undefined,
    notes: extracted.company
      ? `Added automatically from inbound meeting request.`
      : 'Added automatically from inbound meeting request.',
  });
  if (!created.ok) return { ok: false, error: created.error };

  return {
    ok: true,
    uid: created.data.uid,
    name: created.data.name || displayName,
    company: extracted.company,
    created: true,
  };
}
