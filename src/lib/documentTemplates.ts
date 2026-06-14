import type { ContactRecord } from './contactApi';

// Load all HTML templates at build time (Vite eager glob).
// Path is relative to this file: src/lib/ → src/content/documents/
const RAW: Record<string, string> = import.meta.glob(
  '../content/documents/*.html',
  { as: 'raw', eager: true }
) as Record<string, string>;

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
 *   {date}                "June 14, 2026"
 *   {year}                "2026"
 */
export function fillTemplate(html: string, contact: ContactRecord): string {
  const firstName =
    contact.firstName?.trim() ||
    (contact.name ?? '').split(/\s+/)[0] ||
    '';
  const lastName =
    contact.lastName?.trim() ||
    (contact.name ?? '').split(/\s+/).slice(1).join(' ') ||
    '';
  const company = contact.company?.trim() || '';
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return html
    .replace(/{client\.name}/g, escHtml(contact.name ?? ''))
    .replace(/{client\.first_name}/g, escHtml(firstName))
    .replace(/{client\.last_name}/g, escHtml(lastName))
    .replace(/{client\.email}/g, escHtml(contact.email ?? ''))
    .replace(/{client\.phone}/g, escHtml(contact.phone ?? ''))
    .replace(/{client\.company}/g, escHtml(company))
    .replace(/{client\.company_str}/g, company ? ` · ${escHtml(company)}` : '')
    .replace(/{date}/g, today)
    .replace(/{year}/g, String(new Date().getFullYear()));
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
