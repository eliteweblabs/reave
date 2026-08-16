/**
 * Standing internet-presence copy + public-record facts for audit one-pagers.
 * Always on — not a scored finding. Websites often skip city/state, years,
 * owner, staff, and registration dates; we show them from the contact or a
 * dummy fallback so the sheet still reads as a real leave-behind.
 */
/** Minimal contact shape so this module stays free of contact-api imports. */
export type PublicRecordContact = {
  uid?: string;
  name?: string | null;
  company?: string | null;
  links?: Array<{ system?: string; metadata?: Record<string, unknown> | null }>;
};

export const AUDIT_INTERNET_PRESENCE_KICKER = 'Internet presence';

export const AUDIT_INTERNET_PRESENCE_STATEMENT =
  'We look at everything that turns up about this business online — listings, articles, forums, and especially reviews that are not endearing. We also check the facts most websites skip: city and state, years in operation, who owns it, at least three staff when there is a team, and public-record dates (registered on). When something negative shows up, we help take it down if the platform allows, or write a public response so a bad note is not the last word customers see.';

export const AUDIT_PUBLIC_RECORD_NOTE =
  'City, years, owner, and staff are missing from most sites. We fill gaps from public record when we can; the rest stays marked until we have a source.';

export type PublicRecordFacts = {
  cityState: string;
  yearsInOperation: string;
  owner: string;
  staff: string[];
  registeredOn: string;
  /** True when values are the Hale & Co. dummy fixture. */
  fallback: boolean;
};

export const DUMMY_PUBLIC_RECORD: PublicRecordFacts = {
  cityState: 'Boston, MA',
  yearsInOperation: 'Since 2014 (12 years)',
  owner: 'Jordan Hale',
  staff: ['Maya Chen', 'Luis Ortega', 'Priya Shah'],
  registeredOn: 'Massachusetts · March 12, 2014',
  fallback: true,
};

const MISSING_ON_SITE = 'Not on the website';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "18 Atlantic Ave, Boston, MA 02110" → "Boston, MA" */
export function cityStateFromAddress(address: string | null | undefined): string {
  const clean = String(address || '')
    .replace(/,?\s*USA$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const stateZip = parts[parts.length - 1] ?? '';
    const city = parts[parts.length - 2] ?? '';
    const state = stateZip.replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
    if (city && state) return `${city}, ${state}`;
  }
  const loose = clean.match(/\b([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)*),\s*([A-Z]{2})\b/);
  if (loose) return `${loose[1]}, ${loose[2]}`;
  return '';
}

function parseStaff(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;|/]|\band\b/i)
    .map((name) => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function contactAddress(contact: PublicRecordContact): string {
  const link = (contact.links ?? []).find((row) => row.system === 'portal');
  const raw = link?.metadata && typeof link.metadata === 'object' ? link.metadata.address : '';
  return typeof raw === 'string' ? raw.trim() : '';
}

export function publicRecordFromContact(
  contact: PublicRecordContact,
  overrides: Partial<Omit<PublicRecordFacts, 'fallback' | 'staff'>> & { staff?: string[] | string } = {},
): PublicRecordFacts {
  const fromAddress = cityStateFromAddress(contactAddress(contact));
  const owner = (overrides.owner || contact.name || '').trim();
  const staff = Array.isArray(overrides.staff)
    ? overrides.staff.map((s) => s.trim()).filter(Boolean)
    : parseStaff(overrides.staff);
  const isDummy = contact.uid === 'preview';
  const base = isDummy ? DUMMY_PUBLIC_RECORD : null;

  const cityState = (overrides.cityState || fromAddress || base?.cityState || MISSING_ON_SITE).trim();
  const yearsInOperation = (overrides.yearsInOperation || base?.yearsInOperation || MISSING_ON_SITE).trim();
  const registeredOn = (overrides.registeredOn || base?.registeredOn || 'Public record not pulled yet').trim();
  const nextStaff = staff.length
    ? staff
    : base?.staff ?? [];
  const namedOwner = owner || base?.owner || MISSING_ON_SITE;

  return {
    cityState,
    yearsInOperation,
    owner: namedOwner,
    staff: nextStaff,
    registeredOn,
    fallback: isDummy && !fromAddress && !overrides.cityState,
  };
}

export function publicRecordFromSearchParams(
  params: URLSearchParams,
  contact: PublicRecordContact,
): PublicRecordFacts {
  const city = params.get('city')?.trim() || '';
  const state = params.get('state')?.trim() || '';
  const cityState = params.get('cityState')?.trim() || (city && state ? `${city}, ${state}` : city || state);
  return publicRecordFromContact(contact, {
    cityState,
    yearsInOperation: params.get('years')?.trim() || '',
    owner: params.get('owner')?.trim() || '',
    staff: params.get('staff')?.trim() || '',
    registeredOn: params.get('registered')?.trim() || '',
  });
}

function staffDisplay(staff: string[]): string {
  if (staff.length >= 3) return staff.slice(0, 6).join(', ');
  if (staff.length > 0) return `${staff.join(', ')} — name at least three when there is a team`;
  return `${MISSING_ON_SITE} — name at least three when there is a team`;
}

function factItems(facts: PublicRecordFacts): Array<{ label: string; value: string }> {
  return [
    { label: 'City & state', value: facts.cityState },
    { label: 'Years in operation', value: facts.yearsInOperation },
    { label: 'Owner', value: facts.owner },
    { label: 'Staff', value: staffDisplay(facts.staff) },
    { label: 'Registered on', value: facts.registeredOn },
  ];
}

/** Compact band for the sales one-pager, between findings and the brand strip. */
export function renderInternetPresenceHtml(
  statement = AUDIT_INTERNET_PRESENCE_STATEMENT,
  kicker = AUDIT_INTERNET_PRESENCE_KICKER,
  facts: PublicRecordFacts = DUMMY_PUBLIC_RECORD,
): string {
  if (!statement.trim()) return '';
  const items = factItems(facts)
    .map(
      (item) =>
        `<li class="doc-presence-fact"><span class="doc-presence-fact-label">${escHtml(item.label)}</span><span class="doc-presence-fact-value">${escHtml(item.value)}</span></li>`,
    )
    .join('');
  return `<div class="doc-presence" role="note"><p class="doc-presence-kicker">${escHtml(kicker)}</p><p class="doc-presence-copy">${escHtml(statement)}</p><ul class="doc-presence-facts">${items}</ul><p class="doc-presence-note">${escHtml(AUDIT_PUBLIC_RECORD_NOTE)}</p></div>`;
}

/** Swap the rendered presence band for one that includes live/fallback facts. */
export function injectInternetPresenceFacts(
  sheetHtml: string,
  facts: PublicRecordFacts,
  html = renderInternetPresenceHtml(undefined, undefined, facts),
): string {
  if (!html.trim()) return sheetHtml;
  const re = /<div class="doc-presence"[^>]*>[\s\S]*?<\/div>/;
  if (re.test(sheetHtml)) return sheetHtml.replace(re, html);
  const brandsAt = sheetHtml.lastIndexOf('<div class="doc-onepager-brands">');
  if (brandsAt >= 0) {
    return `${sheetHtml.slice(0, brandsAt)}<div class="doc-onepager-presence">${html}</div>${sheetHtml.slice(brandsAt)}`;
  }
  const footerAt = sheetHtml.lastIndexOf('<footer class="doc-onepager-footer">');
  if (footerAt < 0) return sheetHtml;
  return `${sheetHtml.slice(0, footerAt)}<div class="doc-onepager-presence">${html}</div>${sheetHtml.slice(footerAt)}`;
}

export const DOCUMENT_INTERNET_PRESENCE_CSS = `
.doc-presence {
  display: flex;
  flex-direction: column;
  gap: 0.28em;
}
.doc-presence-kicker {
  margin: 0;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--doc-ink, #141414);
}
.doc-presence-copy {
  margin: 0;
  line-height: 1.4;
  color: #2a2a2a;
}
.doc-presence-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em 1.1em;
  list-style: none;
  margin: 0.35em 0 0;
  padding: 0;
}
.doc-presence-fact {
  display: flex;
  flex-direction: column;
  gap: 0.08em;
  min-width: 6.5em;
  margin: 0;
}
.doc-presence-fact-label {
  font-size: 0.78em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--doc-muted, #6b6b6b);
}
.doc-presence-fact-value {
  font-size: 0.95em;
  line-height: 1.3;
  color: var(--doc-ink, #141414);
}
.doc-presence-note {
  margin: 0.25em 0 0;
  font-size: 0.88em;
  font-style: italic;
  line-height: 1.35;
  color: var(--doc-muted, #6b6b6b);
}
`.trim();
