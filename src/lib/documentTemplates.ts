import type { ContactRecord } from './contactApi';
import type { CompanyConfig } from './companyConfig';
import { parseKnowledgeMarkdown } from './localKnowledge';
import { renderDocumentMarkdown } from './renderDocumentMarkdown';

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
};

export const SHORTCODES: Shortcode[] = [
  { code: 'client.name',        token: '{client.name}',        label: 'Full name',        description: "Contact's full name",                  category: 'Contact' },
  { code: 'client.first_name',  token: '{client.first_name}',  label: 'First name',       description: "Contact's first name",                 category: 'Contact' },
  { code: 'client.last_name',   token: '{client.last_name}',   label: 'Last name',        description: "Contact's last name",                  category: 'Contact' },
  { code: 'client.email',       token: '{client.email}',       label: 'Email',            description: "Contact's email address",              category: 'Contact' },
  { code: 'client.phone',       token: '{client.phone}',       label: 'Phone',            description: "Contact's phone number",               category: 'Contact' },
  { code: 'client.company',     token: '{client.company}',     label: 'Company',          description: "Contact's company name",               category: 'Contact' },
  { code: 'client.company_str', token: '{client.company_str}', label: 'Company (inline)', description: '" · Company" or empty if none',        category: 'Contact' },
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

/**
 * Fill all {placeholder} tokens in the template markdown with contact data.
 */
export function fillTemplate(
  markdown: string,
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

  result = result.replace(/{client\.([a-z_][a-z0-9_]*)}/gi, (_, field) => {
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
  org?: Pick<CompanyConfig, 'name' | 'legalName' | 'domain' | 'supportEmail'>,
): Promise<string> {
  return renderDocumentMarkdown(fillTemplate(markdown, contact, org));
}

function escMarkdown(s: string): string {
  return s.replace(/([\\`*_[\]#])/g, '\\$1');
}
