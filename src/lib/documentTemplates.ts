import type { ContactRecord } from './contactApi';
import type { CompanyConfig } from './companyConfig';

// Load all HTML templates at build time (Vite eager glob).
// Path is relative to this file: src/lib/ → src/documents/
const RAW: Record<string, string> = import.meta.glob(
  '../documents/*.html',
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
  category: 'Client' | 'Date' | 'Company';
};

export const SHORTCODES: Shortcode[] = [
  { code: 'client.name',        token: '{client.name}',        label: 'Full name',        description: "Contact's full name",                  category: 'Client' },
  { code: 'client.first_name',  token: '{client.first_name}',  label: 'First name',       description: "Contact's first name",                 category: 'Client' },
  { code: 'client.last_name',   token: '{client.last_name}',   label: 'Last name',        description: "Contact's last name",                  category: 'Client' },
  { code: 'client.email',       token: '{client.email}',       label: 'Email',            description: "Contact's email address",              category: 'Client' },
  { code: 'client.phone',       token: '{client.phone}',       label: 'Phone',            description: "Contact's phone number",               category: 'Client' },
  { code: 'client.company',     token: '{client.company}',     label: 'Company',          description: "Contact's company name",               category: 'Client' },
  { code: 'client.company_str', token: '{client.company_str}', label: 'Company (inline)', description: '" · Company" or empty if none',        category: 'Client' },
  { code: 'company.name',       token: '{company.name}',       label: 'Display name',     description: 'Your organization display name',       category: 'Company' },
  { code: 'company.legal_name', token: '{company.legal_name}', label: 'Legal name',       description: 'Legal entity name for contracts',      category: 'Company' },
  { code: 'company.domain',     token: '{company.domain}',     label: 'Domain',           description: 'Website hostname, e.g. example.com', category: 'Company' },
  { code: 'company.support_email', token: '{company.support_email}', label: 'Support email', description: 'Public support contact email', category: 'Company' },
  { code: 'date',               token: '{date}',               label: "Today's date",     description: 'Long date format, e.g. "June 15, 2026"', category: 'Date'   },
  { code: 'year',               token: '{year}',               label: 'Current year',     description: '4-digit year, e.g. "2026"',            category: 'Date'   },
];

export type DocumentTemplate = {
  slug: string;
  title: string;
  html: string;
};

function slugFromPath(p: string): string {
  return p.split('/').pop()!.replace(/\.html$/, '');
}

function titleFromHtml(html: string, slug: string): string {
  const m = html.match(/<!--\s*title:\s*(.+?)\s*-->/i);
  if (m) return m[1].trim();
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function listTemplates(): DocumentTemplate[] {
  return Object.entries(RAW).map(([path, html]) => {
    const slug = slugFromPath(path);
    return { slug, title: titleFromHtml(html, slug), html };
  });
}

export function getTemplate(slug: string): DocumentTemplate | null {
  const entry = Object.entries(RAW).find(([p]) => slugFromPath(p) === slug);
  if (!entry) return null;
  const [, html] = entry;
  return { slug, title: titleFromHtml(html, slug), html };
}

/**
 * Fill all {placeholder} tokens in the template HTML with contact data.
 * Supported tokens:
 *   {client.name}         full name
 *   {client.first_name}   first name
 *   {client.last_name}    last name
 *   {client.email}
 *   {client.phone}
 *   {client.company}
 *   {client.company_str}  " · Company Name" or "" (used inline in sentences)
 *   {company.name}        organization display name
 *   {company.legal_name}  legal entity name
 *   {company.domain}      website hostname
 *   {company.support_email}
 *   {date}                "June 14, 2026"
 *   {year}                "2026"
 */
export function fillTemplate(
  html: string,
  contact: ContactRecord,
  org?: Pick<CompanyConfig, 'name' | 'legalName' | 'domain' | 'supportEmail'>,
): string {
  const firstName =
    contact.firstName?.trim() ||
    (contact.name ?? '').split(/\s+/)[0] ||
    '';
  const lastName =
    contact.lastName?.trim() ||
    (contact.name ?? '').split(/\s+/).slice(1).join(' ') ||
    '';
  const contactCompany = contact.company?.trim() || '';
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let result = html
    .replace(/{client\.name}/g, escHtml(contact.name ?? ''))
    .replace(/{client\.first_name}/g, escHtml(firstName))
    .replace(/{client\.last_name}/g, escHtml(lastName))
    .replace(/{client\.email}/g, escHtml(contact.email ?? ''))
    .replace(/{client\.phone}/g, escHtml(contact.phone ?? ''))
    .replace(/{client\.company}/g, escHtml(contactCompany))
    .replace(/{client\.company_str}/g, contactCompany ? ` · <strong>${escHtml(contactCompany)}</strong>` : '')
    .replace(/{company\.name}/g, escHtml(org?.name ?? ''))
    .replace(/{company\.legal_name}/g, escHtml(org?.legalName ?? org?.name ?? ''))
    .replace(/{company\.domain}/g, escHtml(org?.domain ?? ''))
    .replace(/{company\.support_email}/g, escHtml(org?.supportEmail ?? ''))
    .replace(/{date}/g, today)
    .replace(/{year}/g, String(new Date().getFullYear()));

  // Generic fallback: any remaining {client.xxx} tokens — look up contact[xxx] directly.
  // This means extra fields added to the contact-api schema work automatically.
  result = result.replace(/{client\.([a-z_][a-z0-9_]*)}/gi, (_, field) => {
    const val = (contact as Record<string, unknown>)[field];
    return typeof val === 'string' ? escHtml(val) : '';
  });

  // Clean up empty <strong></strong> or <strong> · </strong> artifacts left by missing optional fields.
  result = result
    .replace(/<strong><\/strong>/g, '')
    .replace(/·\s*<strong><\/strong>/g, '')
    .replace(/<strong>\s*·\s*<\/strong>/g, '');

  return result;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
