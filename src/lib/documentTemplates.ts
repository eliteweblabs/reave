import {
  extractPortal,
  getContact,
  isContactApiConfigured,
  listContacts,
  type ContactRecord,
} from './contactApi';
import { parseKnowledgeMarkdown } from './localKnowledge';
import { renderDocumentMarkdown } from './renderDocumentMarkdown';
import {
  applyCompanyBrandShortcodes,
  parseDocumentLayout,
  renderPrintOnePagerHtml,
  wrapMarkdownPreviewDocument,
  wrapPrintPreviewDocument,
  type DocumentLayoutKind,
  type DocumentOrientation,
  type PrintCompany,
} from './documentPrintLayout';

// Load all markdown templates at build time (Vite eager glob).
// Path is relative to this file: src/lib/ → src/documents/
const RAW: Record<string, string> = import.meta.glob(
  '../documents/*.md',
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

// ── Shortcode registry ──────────────────────────────────────────────────────
// Single source of truth for what tokens fillTemplate() resolves.
// The /api/documents/shortcodes endpoint returns this list, optionally enriched
// with extra fields discovered from a live contact record.

export type Shortcode = {
  code: string;        // e.g. 'client.name'
  token: string;       // e.g. '{client.name}'
  label: string;       // e.g. 'Full name'
  description: string;
  category: 'Contact' | 'Date' | 'Company';
  example?: string;    // current filled value, for scan / already-applied checks
};

/** Sample contact so View mode and shortcode scan share the same fill data. */
export const PREVIEW_CONTACT: ContactRecord = {
  uid: 'preview',
  name: 'Jordan Hale',
  firstName: 'Jordan',
  lastName: 'Hale',
  email: 'jordan@example.com',
  phone: '(555) 010-0148',
  company: 'Hale & Co.',
};

export const SHORTCODES: Shortcode[] = [
  { code: 'client.name',        token: '{client.name}',        label: 'Full name',        description: "Contact's full name",                  category: 'Contact' },
  { code: 'client.first_name',  token: '{client.first_name}',  label: 'First name',       description: "Contact's first name",                 category: 'Contact' },
  { code: 'client.last_name',   token: '{client.last_name}',   label: 'Last name',        description: "Contact's last name",                  category: 'Contact' },
  { code: 'client.email',       token: '{client.email}',       label: 'Email',            description: "Contact's email address",              category: 'Contact' },
  { code: 'client.phone',       token: '{client.phone}',       label: 'Phone',            description: "Contact's phone number",               category: 'Contact' },
  { code: 'client.company',     token: '{client.company}',     label: 'Company',          description: "Contact's company name",               category: 'Contact' },
  { code: 'client.company_str', token: '{client.company_str}', label: 'Company (inline)', description: '" · Company" or empty if none',        category: 'Contact' },
  { code: 'client.logo',        token: '{client.logo}',        label: 'Logo',             description: "Scalable contact logo. Size with {client.logo:sm|md|lg|xl} or {client.logo:3em}", category: 'Contact' },
  { code: 'client.icon',        token: '{client.icon}',        label: 'Icon',             description: "Scalable contact icon. Size with {client.icon:sm|md|lg|xl} or {client.icon:32}", category: 'Contact' },
  { code: 'company.name',       token: '{company.name}',       label: 'Display name',     description: 'Your organization display name',       category: 'Company' },
  { code: 'company.legal_name', token: '{company.legal_name}', label: 'Legal name',       description: 'Legal entity name for contracts',      category: 'Company' },
  { code: 'company.domain',     token: '{company.domain}',     label: 'Domain',           description: 'Website hostname, e.g. example.com', category: 'Company' },
  { code: 'company.support_email', token: '{company.support_email}', label: 'Support email', description: 'Public support contact email', category: 'Company' },
  { code: 'company.logo',       token: '{company.logo}',       label: 'Logo',             description: 'Scalable company logo. Size with {company.logo:sm|md|lg|xl} or {company.logo:3em}', category: 'Company' },
  { code: 'company.icon',       token: '{company.icon}',       label: 'Icon',             description: 'Scalable company icon. Size with {company.icon:sm|md|lg|xl} or {company.icon:32}', category: 'Company' },
  { code: 'date',               token: '{date}',               label: "Today's date",     description: 'Long date format, e.g. "June 15, 2026"', category: 'Date'   },
  { code: 'year',               token: '{year}',               label: 'Current year',     description: '4-digit year, e.g. "2026"',            category: 'Date'   },
];

export type DocumentTemplate = {
  slug: string;
  title: string;
  markdown: string;
};

function slugFromPath(p: string): string {
  return p.split('/').pop()!.replace(/\.md$/, '');
}

export function titleFromDocumentMarkdown(markdown: string, slug: string): string {
  const parsed = parseKnowledgeMarkdown(markdown);
  if (parsed.title) return parsed.title;
  const first = parsed.body.split('\n').find((l) => l.trim().length > 0) ?? '';
  const fromHeading = first.replace(/^#+\s*/, '').trim();
  if (fromHeading) return fromHeading.slice(0, 200);
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function listTemplates(): DocumentTemplate[] {
  return Object.entries(RAW).map(([path, markdown]) => {
    const slug = slugFromPath(path);
    return { slug, title: titleFromDocumentMarkdown(markdown, slug), markdown };
  });
}

export function getTemplate(slug: string): DocumentTemplate | null {
  const entry = Object.entries(RAW).find(([p]) => slugFromPath(p) === slug);
  if (!entry) return null;
  const [, markdown] = entry;
  return { slug, title: titleFromDocumentMarkdown(markdown, slug), markdown };
}

export type ShortcodeExample = {
  code: string;
  token: string;
  value: string;
};

export type ShortcodeScanHit = {
  code: string;
  token: string;
  count: number;
};

const MONTHS_LONG = 'January|February|March|April|May|June|July|August|September|October|November|December';
const MONTHS_SHORT = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const DATE_RE = new RegExp(
  String.raw`\b(?:(?:${MONTHS_LONG})|(?:${MONTHS_SHORT})\.?)\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b`,
  'gi',
);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const SUPPORT_LOCAL_RE = /^(support|hello|info|contact|help|office|admin|team|hi)$/i;
const TOKEN_RE = /\{[a-z][a-z0-9_.]*(?::[a-z0-9.]+)?\}/gi;
const SKIP_SCAN_CODES = new Set(['client.company_str', 'company.logo', 'company.icon', 'client.logo', 'client.icon']);

function contactNameParts(contact: ContactRecord): { firstName: string; lastName: string; company: string } {
  const firstName =
    contact.firstName?.trim() ||
    (contact.name ?? '').split(/\s+/)[0] ||
    '';
  const lastName =
    contact.lastName?.trim() ||
    (contact.name ?? '').split(/\s+/).slice(1).join(' ') ||
    '';
  return { firstName, lastName, company: contact.company?.trim() || '' };
}

function formatTodayDate(now = new Date()): string {
  return now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Filled values that `{token}` resolves to — used by fill, preview, and scan. */
export function shortcodeExamples(contact: ContactRecord, org?: PrintCompany, now = new Date()): ShortcodeExample[] {
  const { firstName, lastName, company } = contactNameParts(contact);
  const today = formatTodayDate(now);
  const values: Array<[string, string]> = [
    ['client.name', contact.name ?? ''],
    ['client.first_name', firstName],
    ['client.last_name', lastName],
    ['client.email', contact.email ?? ''],
    ['client.phone', contact.phone ?? ''],
    ['client.company', company],
    ['company.name', org?.name ?? ''],
    ['company.legal_name', org?.legalName ?? org?.name ?? ''],
    ['company.domain', org?.domain ?? ''],
    ['company.support_email', org?.supportEmail ?? ''],
    ['date', today],
    ['year', String(now.getFullYear())],
  ];
  return values
    .filter(([, value]) => value.trim().length > 0)
    .map(([code, value]) => ({ code, token: `{${code}}`, value }));
}

function tokenRanges(markdown: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function inProtectedRange(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceUnprotected(
  markdown: string,
  pattern: RegExp,
  replace: (match: string, offset: number) => string,
): { markdown: string; count: number } {
  const ranges = tokenRanges(markdown);
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let count = 0;
  const next = markdown.replace(re, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    if (inProtectedRange(offset, ranges)) return match;
    const swapped = replace(match, offset);
    if (swapped === match) return match;
    count += 1;
    return swapped;
  });
  return { markdown: next, count };
}

function addHit(hits: Map<string, ShortcodeScanHit>, code: string, token: string, count: number) {
  if (count <= 0) return;
  const prev = hits.get(code);
  if (prev) prev.count += count;
  else hits.set(code, { code, token, count });
}

/**
 * Replace literal dates, emails, phones, and known fill values with shortcodes.
 * Existing `{tokens}` are left alone.
 */
export function scanMarkdownForShortcodes(
  markdown: string,
  examples: ShortcodeExample[],
): { markdown: string; hits: ShortcodeScanHit[] } {
  const hits = new Map<string, ShortcodeScanHit>();
  let next = markdown;

  let supportEmailCount = 0;
  let clientEmailCount = 0;
  const { markdown: afterEmails } = replaceUnprotected(next, EMAIL_RE, (match) => {
    const knownEmail = examples.find(
      (ex) =>
        (ex.code === 'company.support_email' || ex.code === 'client.email') &&
        ex.value.toLowerCase() === match.toLowerCase(),
    );
    if (knownEmail?.code === 'company.support_email' || SUPPORT_LOCAL_RE.test(match.split('@')[0] || '')) {
      supportEmailCount += 1;
      return '{company.support_email}';
    }
    clientEmailCount += 1;
    return '{client.email}';
  });
  next = afterEmails;
  addHit(hits, 'company.support_email', '{company.support_email}', supportEmailCount);
  addHit(hits, 'client.email', '{client.email}', clientEmailCount);

  const { markdown: afterPhones, count: phoneCount } = replaceUnprotected(next, PHONE_RE, () => '{client.phone}');
  next = afterPhones;
  addHit(hits, 'client.phone', '{client.phone}', phoneCount);

  const known = examples
    .filter((ex) => !SKIP_SCAN_CODES.has(ex.code) && ex.value.trim().length >= 3)
    .slice()
    .sort((a, b) => b.value.length - a.value.length || a.code.localeCompare(b.code));

  for (const ex of known) {
    const variants = [ex.value];
    if (ex.code === 'company.domain') {
      const host = ex.value.replace(/^www\./i, '');
      if (host && host !== ex.value) variants.push(host);
      variants.push(`www.${host}`);
    }
    const unique = [...new Set(variants.map((v) => v.trim()).filter(Boolean))];
    for (const value of unique) {
      const { markdown: replaced, count } = replaceUnprotected(
        next,
        new RegExp(escapeRegExp(value), 'g'),
        (match, offset) => {
          if (ex.code === 'company.domain' && offset > 0 && next[offset - 1] === '@') return match;
          return ex.token;
        },
      );
      next = replaced;
      addHit(hits, ex.code, ex.token, count);
    }
  }

  const { markdown: afterDates, count: dateCount } = replaceUnprotected(next, DATE_RE, () => '{date}');
  next = afterDates;
  addHit(hits, 'date', '{date}', dateCount);

  const year = String(new Date().getFullYear());
  const { markdown: afterYear, count: yearCount } = replaceUnprotected(
    next,
    new RegExp(`\\b${escapeRegExp(year)}\\b`, 'g'),
    () => '{year}',
  );
  next = afterYear;
  addHit(hits, 'year', '{year}', yearCount);

  return { markdown: next, hits: [...hits.values()].filter((h) => h.count > 0) };
}

/** Replace a selected literal with a shortcode, skipping text already inside `{tokens}`. */
export function replaceLiteralWithShortcode(
  markdown: string,
  selected: string,
  token: string,
): { markdown: string; count: number } {
  const needle = selected.replace(/\s+/g, ' ').trim();
  if (!needle) return { markdown, count: 0 };
  const { markdown: exact, count } = replaceUnprotected(
    markdown,
    new RegExp(escapeRegExp(needle), 'g'),
    () => token,
  );
  if (count) return { markdown: exact, count };
  if (needle === selected.trim()) return { markdown, count: 0 };
  return replaceUnprotected(markdown, new RegExp(escapeRegExp(selected.trim()), 'g'), () => token);
}

/**
 * Fill all {placeholder} tokens in the template markdown with contact data.
 */
export function fillTemplate(
  markdown: string,
  contact: ContactRecord,
  org?: PrintCompany,
): string {
  const { firstName, lastName, company: contactCompany } = contactNameParts(contact);
  const today = formatTodayDate();

  let result = markdown
    .replace(/{client\.name}/g, escMarkdown(contact.name ?? ''))
    .replace(/{client\.first_name}/g, escMarkdown(firstName))
    .replace(/{client\.last_name}/g, escMarkdown(lastName))
    .replace(/{client\.email}/g, escMarkdown(contact.email ?? ''))
    .replace(/{client\.phone}/g, escMarkdown(contact.phone ?? ''))
    .replace(/{client\.company}/g, escMarkdown(contactCompany))
    .replace(/{client\.company_str}/g, contactCompany ? ` · **${escMarkdown(contactCompany)}**` : '')
    .replace(/{company\.name}/g, escMarkdown(org?.name ?? ''))
    .replace(/{company\.legal_name}/g, escMarkdown(org?.legalName ?? org?.name ?? ''))
    .replace(/{company\.domain}/g, escMarkdown(org?.domain ?? ''))
    .replace(/{company\.support_email}/g, escMarkdown(org?.supportEmail ?? ''))
    .replace(/{date}/g, today)
    .replace(/{year}/g, String(new Date().getFullYear()));

  result = result.replace(/{client\.([a-z_][a-z0-9_]*)}/gi, (match, field: string) => {
    if (field.toLowerCase() === 'logo' || field.toLowerCase() === 'icon') return match;
    const val = (contact as Record<string, unknown>)[field];
    return typeof val === 'string' ? escMarkdown(val) : '';
  });

  result = result
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/ · \*\*\*\*/g, '')
    .replace(/\*\* · \*\*/g, '');

  return result;
}

/** Fill shortcodes, then render markdown to HTML for display and signing. */
export async function fillAndRenderTemplate(
  markdown: string,
  contact: ContactRecord,
  org?: PrintCompany,
): Promise<string> {
  return renderFilledDocumentHtml(fillTemplate(markdown, contact, org), org, '', contact);
}

/** Prefer a named contact when the agent/UI asked to fill a specific client. */
export async function resolvePreviewContact(contactUid?: string): Promise<ContactRecord> {
  const uid = contactUid?.trim();
  if (uid && isContactApiConfigured()) {
    try {
      const res = await getContact(uid);
      if (res.ok) return res.data;
    } catch {
      /* fall through to the sample/preview contact */
    }
  }
  return previewDocumentContact();
}

export type DocumentPreviewPage = {
  html: string;
  title: string;
  layout: DocumentLayoutKind;
  orientation: DocumentOrientation;
  contact: ContactRecord;
};

/** Fill shortcodes and wrap HTML so admin View / chat thumbnails can iframe it. */
export async function buildDocumentPreviewHtml(opts: {
  markdown: string;
  slug?: string;
  company: PrintCompany;
  contact?: ContactRecord;
}): Promise<DocumentPreviewPage> {
  const contact = opts.contact ?? (await previewDocumentContact());
  const layout = parseDocumentLayout(opts.markdown, opts.slug);
  const source = fillTemplate(opts.markdown, contact, opts.company);
  const html = await renderFilledDocumentHtml(source, opts.company, opts.slug ?? '', contact);
  const previewHtml =
    layout.layout === 'onepager'
      ? wrapPrintPreviewDocument(html, layout.orientation)
      : wrapMarkdownPreviewDocument(html);
  return {
    html: previewHtml,
    title: layout.title,
    layout: layout.layout,
    orientation: layout.orientation,
    contact,
  };
}

/** Sample contact for admin View — prefers a real contact that has a logo/icon. */
export async function previewDocumentContact(): Promise<ContactRecord> {
  if (!isContactApiConfigured()) return PREVIEW_CONTACT;
  try {
    const res = await listContacts({ limit: 25 });
    if (!res.ok || !res.data.contacts.length) return PREVIEW_CONTACT;
    const branded = res.data.contacts.find((c) => {
      const portal = extractPortal(c);
      if (!portal) return false;
      return Boolean(
        portal.logoSource === 'upload' ||
        portal.iconSource === 'upload' ||
        portal.logoUrl ||
        portal.iconUrl,
      );
    });
    return branded || res.data.contacts[0] || PREVIEW_CONTACT;
  } catch {
    return PREVIEW_CONTACT;
  }
}

/** Render template markdown (already filled) to HTML, applying print chrome when opted in. */
export async function renderFilledDocumentHtml(
  markdown: string,
  org?: PrintCompany,
  slug = '',
  contact?: ContactRecord,
): Promise<string> {
  const layout = parseDocumentLayout(markdown, slug);
  const html =
    layout.layout === 'onepager'
      ? await renderPrintOnePagerHtml(markdown, org, slug)
      : await renderDocumentMarkdown(markdown);
  return applyCompanyBrandShortcodes(html, org, contact);
}

function escMarkdown(s: string): string {
  return s.replace(/([\\`*_[\]#])/g, '\\$1');
}
