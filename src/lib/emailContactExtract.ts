/**
 * Extract client contact details from inbound meeting-request emails and ensure
 * they exist in contact-api when a meeting is auto-booked.
 */

import { createContact, isContactApiConfigured, resolveContact } from './contactApi';
import { parseSenderEmail, parseSenderName } from './emailAddress';

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

function titleCaseWords(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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
  const cleaned = local.replace(/[._+-]+/g, ' ').trim();
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
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}$/.test(line) && !/\b(LLC|Inc|Corp|Ltd|Co)\b/.test(line)) {
      continue;
    }
    if (/^[A-Z0-9][A-Za-z0-9&'’\-.,\s]{2,}$/.test(line) && line.split(/\s+/).length >= 2) {
      return line;
    }
  }

  return null;
}

function companyFromSummary(summary: string): string | null {
  const m = summary.match(/\bfrom\s+(.+?)\s+(?:wants|would like|asked|requested|is asking)\b/i);
  const candidate = m?.[1]?.trim();
  if (!candidate || candidate.length < 4 || candidate.length > 60) return null;
  if (/^(a|the|an)\b/i.test(candidate)) return null;
  return candidate;
}

export function extractContactFromInboundEmail(input: {
  from: string;
  bodyText?: string;
  summary?: string;
}): ExtractedEmailContact {
  const email = parseSenderEmail(input.from);
  const fromName = parseSenderName(input.from);
  const parsed = parsePersonName(fromName || nameFromEmailLocal(email));

  let firstName = parsed.firstName;
  let lastName = parsed.lastName;
  if (!firstName && email.includes('@')) {
    const localName = nameFromEmailLocal(email).split(/\s+/)[0] ?? '';
    if (localName) firstName = localName;
  }

  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || fromName || nameFromEmailLocal(email) || 'Guest';

  const body = String(input.bodyText ?? '');
  const summary = String(input.summary ?? '');
  const company =
    extractCompanyFromSignature(body) ||
    companyFromSummary(summary) ||
    companyFromEmailDomain(email);

  return {
    email,
    firstName,
    lastName,
    displayName,
    company,
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
      name: input.existingContactName?.trim() || 'Client',
      company: null,
      created: false,
    };
  }

  const extracted = extractContactFromInboundEmail(input);
  if (!extracted.email.includes('@')) {
    return { ok: false, error: 'No sender email' };
  }

  const resolved = await resolveContact({ email: extracted.email, name: extracted.displayName });
  if (resolved.ok) {
    const hit = contactFromResolve(resolved.data);
    if (hit) {
      return {
        ok: true,
        uid: hit.uid,
        name: hit.name || extracted.displayName,
        company: extracted.company,
        created: false,
      };
    }
  }

  const created = await createContact({
    name: extracted.displayName,
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
    name: created.data.name || extracted.displayName,
    company: extracted.company,
    created: true,
  };
}
