/**
 * Print one-pager chrome for document templates.
 *
 * Templates opt in with frontmatter:
 *   layout: onepager
 *   orientation: portrait | landscape
 *   footer: "…"
 *
 * Body columns are split on a `:::column` line.
 */
import { parseKnowledgeMarkdown } from './localKnowledge';
import { renderDocumentMarkdown } from './renderDocumentMarkdown';
import { brandIconUrl, companyLogoUrl, type CompanyConfig } from './companyConfig';
import { prepareInlineBrandSvg, svgHasExternalRasterRefs } from './brandSvg';
import { extractPortal, type ContactRecord } from './contactApi';
import { resolveClientIconUrl, resolveClientLogoUrl } from './clientBranding';
import { listBrandLogos } from './brandLogos';
import {
  DOCUMENT_CLIENT_LOGOS_CSS,
  renderClientBrandLogosHtml,
} from './clientBrandLogos';
import {
  DOCUMENT_INTERNET_PRESENCE_CSS,
  publicRecordFromContact,
  renderInternetPresenceHtml,
} from './auditInternetPresence';
import {
  DOCUMENT_SERVICES_PAGE_CSS,
  appendPrintOnePagerArticle,
  renderAuditServicesArticle,
} from './auditSalesPricing';
import {
  clientLogoStatusLabel,
  DOCUMENT_CLIENT_MARK_CSS,
  ensureClientLogoMark,
  renderClientLogoMarkHtml,
} from './auditClientLogo';
import { SITE } from '../config/site';

export type DocumentOrientation = 'portrait' | 'landscape';
export type DocumentLayoutKind = 'default' | 'onepager';

export type PrintCompany = Pick<
  CompanyConfig,
  | 'name'
  | 'legalName'
  | 'domain'
  | 'supportEmail'
  | 'logoPath'
  | 'logoSource'
  | 'logoVersion'
  | 'logoSvg'
  | 'iconPath'
  | 'iconSource'
  | 'iconVersion'
  | 'iconSvg'
>;

export type ParsedDocumentLayout = {
  title: string;
  layout: DocumentLayoutKind;
  orientation: DocumentOrientation;
  footer: string;
  /** Folder-backed brand strip (e.g. `clients` → public/logos/clients/). */
  brands: string;
  /** Standing internet-presence / review-response statement. */
  presence: boolean;
  /** Second page: services, modules, and installation prices. */
  services: boolean;
  body: string;
  columns: string[];
};

const COLUMN_MARK = /^:::column\s*$/m;

function fmValue(fm: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'im');
  const match = fm.match(re);
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
}

export function parseDocumentLayout(markdown: string, slug = ''): ParsedDocumentLayout {
  const parsed = parseKnowledgeMarkdown(markdown);
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch?.[1] ?? '';

  const layoutRaw = fmValue(fm, 'layout').toLowerCase();
  const orientationRaw = fmValue(fm, 'orientation').toLowerCase();
  const orientation: DocumentOrientation = orientationRaw === 'landscape' ? 'landscape' : 'portrait';
  const layout: DocumentLayoutKind =
    layoutRaw === 'onepager' || layoutRaw === 'one-pager' || Boolean(orientationRaw)
      ? 'onepager'
      : 'default';

  const title =
    parsed.title ||
    slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const footer = fmValue(fm, 'footer');
  const brands = parseBrandsFolder(fmValue(fm, 'brands'));
  const presence = parseOnFlag(fmValue(fm, 'presence'));
  const services = parseOnFlag(fmValue(fm, 'services'));
  const body = parsed.body;
  const columns = splitColumns(body);

  return { title, layout, orientation, footer, brands, presence, services, body, columns };
}

/** `true` / `yes` / `on` / `1` enable a frontmatter flag. */
export function parseOnFlag(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  return key === 'true' || key === '1' || key === 'yes' || key === 'on';
}

/** `clients` / `true` / `about` → public/logos/clients/. Empty disables the strip. */
export function parseBrandsFolder(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key || key === 'false' || key === '0' || key === 'off' || key === 'none') return '';
  if (key === 'true' || key === '1' || key === 'yes' || key === 'about') return 'clients';
  return key.replace(/[^a-z0-9_-]/g, '') || '';
}

function splitColumns(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return ['', '', ''];
  if (!COLUMN_MARK.test(trimmed)) {
    return [trimmed, '', ''];
  }
  const parts = trimmed
    .split(COLUMN_MARK)
    .map((part) => part.trim())
    .filter(Boolean);
  while (parts.length < 3) parts.push('');
  return parts.slice(0, 3);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function companyLogoHtml(company?: PrintCompany): string {
  const name = (company?.name || SITE.name || 'Logo').trim();
  if (!company) {
    return `<span class="doc-onepager-logo-name">${esc(name)}</span>`;
  }

  if (company.logoSource === 'admin' && company.logoPath) {
    const src = companyLogoUrl(company.logoPath, company.logoVersion);
    if (src) {
      return `<img class="doc-onepager-logo-img" src="${esc(src)}" alt="${esc(name)}" />`;
    }
  }

  const svg = company.logoSvg?.trim();
  if (svg && !svgHasExternalRasterRefs(svg)) {
    const prepared = prepareInlineBrandSvg(svg, {
      className: 'doc-onepager-logo-svg',
      idPrefix: 'doc-logo',
    });
    if (prepared) return prepared;
  }

  if (company.logoSource !== 'hidden') {
    const src = companyLogoUrl(company.logoPath, company.logoVersion) || SITE.logoPath;
    if (src) {
      return `<img class="doc-onepager-logo-img" src="${esc(src)}" alt="${esc(name)}" />`;
    }
  }

  return `<span class="doc-onepager-logo-name">${esc(name)}</span>`;
}

const BRAND_SIZE_PRESETS: Record<string, string> = {
  sm: '1.25em',
  md: '2.4em',
  lg: '3.6em',
  xl: '5.5em',
};

/** Shared CSS so {company.logo} / {company.icon} scale with surrounding type. */
export const DOCUMENT_BRAND_MARK_CSS = `
.doc-brand {
  display: inline-block;
  vertical-align: middle;
  height: var(--doc-brand-size, 2.4em);
  width: auto;
  max-width: 100%;
  line-height: 0;
}
.doc-brand--icon { --doc-brand-size: 1.6em; }
.doc-brand--sm { --doc-brand-size: 1.25em; }
.doc-brand--md { --doc-brand-size: 2.4em; }
.doc-brand--lg { --doc-brand-size: 3.6em; }
.doc-brand--xl { --doc-brand-size: 5.5em; }
.doc-brand svg,
.doc-brand img {
  display: block;
  height: 100%;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
.doc-brand--icon svg,
.doc-brand--icon img {
  width: auto;
  height: 100%;
}
`.trim();

function parseBrandSize(raw?: string, kind: 'logo' | 'icon' = 'logo'): { sizeClass: string; style: string } {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return { sizeClass: kind === 'icon' ? '' : 'doc-brand--md', style: '' };
  if (BRAND_SIZE_PRESETS[key]) return { sizeClass: `doc-brand--${key}`, style: '' };
  if (/^\d+(\.\d+)?$/.test(key)) return { sizeClass: '', style: `--doc-brand-size:${key}px` };
  if (/^\d+(\.\d+)?(px|em|rem|%)$/.test(key)) return { sizeClass: '', style: `--doc-brand-size:${key}` };
  return { sizeClass: kind === 'icon' ? '' : 'doc-brand--md', style: '' };
}

function makeSvgScalable(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    const width = attrs.match(/\bwidth=["']([\d.]+)(?:px)?["']/i)?.[1];
    const height = attrs.match(/\bheight=["']([\d.]+)(?:px)?["']/i)?.[1];
    let next = String(attrs)
      .replace(/\s(?:width|height)=["'][^"']*["']/gi, '')
      .replace(/\spreserveAspectRatio=["'][^"']*["']/i, '');
    if (!/viewBox=/i.test(next) && width && height) {
      next += ` viewBox="0 0 ${width} ${height}"`;
    }
    return `<svg${next} preserveAspectRatio="xMidYMid meet">`;
  });
}

function inlineBrandSvg(raw: string | undefined, className: string, idPrefix: string): string {
  const svg = raw?.trim();
  if (!svg || svgHasExternalRasterRefs(svg)) return '';
  const prepared = prepareInlineBrandSvg(svg, { className, idPrefix });
  return prepared ? makeSvgScalable(prepared) : '';
}

function brandMarkImg(src: string, alt: string): string {
  if (!src) return '';
  return `<img class="doc-brand-img" src="${esc(src)}" alt="${esc(alt)}" />`;
}

function logoImgSrc(company?: PrintCompany): string {
  if (!company) return '';
  if (company.logoPath) {
    return companyLogoUrl(company.logoPath, company.logoVersion) || '';
  }
  return companyLogoUrl(SITE.logoPath) || SITE.logoPath || '';
}

function iconImgSrc(company?: PrintCompany): string {
  if (!company) return '';
  if (company.iconPath || company.iconVersion) {
    return brandIconUrl(256, company.iconVersion || company.logoVersion, { transparent: true });
  }
  return '';
}

function brandMarkInner(
  kind: 'logo' | 'icon',
  company: PrintCompany | undefined,
  idPrefix: string,
  alt: string,
): string {
  if (kind === 'icon') {
    return (
      inlineBrandSvg(company?.iconSvg, 'doc-brand-svg', `${idPrefix}-icon`) ||
      inlineBrandSvg(company?.logoSvg, 'doc-brand-svg', `${idPrefix}-logo`) ||
      brandMarkImg(iconImgSrc(company), alt) ||
      brandMarkImg(logoImgSrc(company), alt)
    );
  }
  return (
    inlineBrandSvg(company?.logoSvg, 'doc-brand-svg', `${idPrefix}-logo`) ||
    brandMarkImg(logoImgSrc(company), alt) ||
    inlineBrandSvg(company?.iconSvg, 'doc-brand-svg', `${idPrefix}-icon`) ||
    brandMarkImg(iconImgSrc(company), alt)
  );
}

function brandMarkWrapper(
  kind: 'logo' | 'icon',
  inner: string,
  alt: string,
  opts?: { size?: string },
): string {
  if (!inner) return '';
  const { sizeClass, style } = parseBrandSize(opts?.size, kind);
  const kindClass = kind === 'icon' ? 'doc-brand--icon' : 'doc-brand--logo';
  const classes = ['doc-brand', kindClass, sizeClass].filter(Boolean).join(' ');
  const styleAttr = style ? ` style="${esc(style)}"` : '';
  return `<span class="${classes}"${styleAttr} role="img" aria-label="${esc(alt)}">${inner}</span>`;
}

/** Inline, scalable company logo or icon for `{company.logo}` / `{company.icon}`. */
export function companyBrandMarkHtml(
  kind: 'logo' | 'icon',
  company?: PrintCompany,
  opts?: { size?: string; idPrefix?: string },
): string {
  const name = (company?.name || SITE.name || 'Logo').trim();
  const inner = brandMarkInner(kind, company, opts?.idPrefix || `doc-${kind}`, name);
  return brandMarkWrapper(kind, inner, name, opts);
}

/** Scalable contact logo or icon for `{client.logo}` / `{client.icon}`. */
export function clientBrandMarkHtml(
  kind: 'logo' | 'icon',
  contact?: ContactRecord,
  opts?: { size?: string },
): string {
  if (!contact?.uid) return '';
  const portal = extractPortal(contact);
  const serveOpts = { bg: 'light' as const };
  const src =
    kind === 'icon'
      ? resolveClientIconUrl(portal, contact.uid, serveOpts)
      : resolveClientLogoUrl(portal, contact.uid, serveOpts) ||
        resolveClientIconUrl(portal, contact.uid, serveOpts);
  if (!src) return '';
  const name = (contact.company || contact.name || 'Client').trim();
  return brandMarkWrapper(kind, brandMarkImg(src, name), name, opts);
}

const BRAND_TOKEN_RE = /\{(company|client)\.(logo|icon)(?::([^}]+))?\}/gi;
const CLIENT_LOGOS_TOKEN_RE = /\{company\.client_logos\}/gi;

/** Replace leftover `{company|client}.{logo|icon}` and `{company.client_logos}` tokens. */
export function applyCompanyBrandShortcodes(
  html: string,
  company?: PrintCompany,
  contact?: ContactRecord,
): string {
  let seq = 0;
  const re = new RegExp(BRAND_TOKEN_RE.source, 'gi');
  let next = html.replace(re, (_match, ownerRaw: string, kindRaw: string, sizeRaw?: string) => {
    seq += 1;
    const kind = kindRaw.toLowerCase() === 'icon' ? 'icon' : 'logo';
    const owner = ownerRaw.toLowerCase() === 'client' ? 'client' : 'company';
    if (owner === 'client') {
      return clientBrandMarkHtml(kind, contact, { size: sizeRaw });
    }
    return companyBrandMarkHtml(kind, company, {
      size: sizeRaw,
      idPrefix: `doc-${kind}-${seq}`,
    });
  });
  const logosRe = new RegExp(CLIENT_LOGOS_TOKEN_RE.source, 'gi');
  if (logosRe.test(next)) {
    logosRe.lastIndex = 0;
    const strip = renderClientBrandLogosHtml();
    next = next.replace(logosRe, strip);
    if (strip && !next.includes('data-doc-client-logos-css')) {
      next = `<style data-doc-client-logos-css>${DOCUMENT_CLIENT_LOGOS_CSS}</style>\n${next}`;
    }
  }
  if (seq === 0 || next.includes('data-doc-brand-mark-css')) return next;
  return `<style data-doc-brand-mark-css>${DOCUMENT_BRAND_MARK_CSS}</style>\n${next}`;
}

function printPageCss(orientation: DocumentOrientation): string {
  const pageSize = orientation === 'landscape' ? 'letter landscape' : 'letter portrait';
  const ratio = orientation === 'landscape' ? '11 / 8.5' : '8.5 / 11';
  const maxWidth = orientation === 'landscape' ? '11in' : '8.5in';

  return `
.doc-onepager-stage {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 16px;
  background: #e4e4de;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.doc-onepager {
  --doc-ink: #141414;
  --doc-muted: #6b6b6b;
  --doc-rule: #d4d4cc;
  box-sizing: border-box;
  width: 100%;
  max-width: ${maxWidth};
  aspect-ratio: ${ratio};
  background: #fff;
  color: var(--doc-ink);
  box-shadow: 0 2px 18px rgba(0, 0, 0, 0.1);
  padding: 4.2% 4.6% 3.4%;
  display: flex;
  flex-direction: column;
  gap: 3.2%;
  container-type: size;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.doc-onepager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4%;
  flex: 0 0 auto;
  padding-bottom: 2.4%;
  border-bottom: 1.5px solid var(--doc-ink);
}
.doc-onepager-header-start {
  display: flex;
  align-items: center;
  gap: 0.85em;
  min-width: 0;
  max-width: 58%;
}
.doc-onepager-logo {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 42%;
}
.doc-onepager-logo-img,
.doc-onepager-logo-svg {
  display: block;
  height: clamp(22px, 7cqh, 44px);
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
.doc-onepager-logo-name {
  font-size: clamp(13px, 2.6cqi, 20px);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
${DOCUMENT_BRAND_MARK_CSS}
${DOCUMENT_CLIENT_MARK_CSS}
.doc-onepager-mast {
  text-align: right;
  min-width: 0;
}
.doc-onepager-title {
  margin: 0;
  font-size: clamp(13px, 2.5cqi, 20px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.doc-onepager-kicker {
  margin: 0.25em 0 0;
  font-size: clamp(9px, 1.5cqi, 12px);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--doc-muted);
}
.doc-onepager-cols {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 4%;
}
.doc-onepager-col {
  min-width: 0;
  overflow: hidden;
  font-size: clamp(9px, 1.55cqi, 13px);
  line-height: 1.45;
  color: #2a2a2a;
}
.doc-onepager-col + .doc-onepager-col {
  padding-left: 4%;
  border-left: 1px solid var(--doc-rule);
}
.doc-onepager-col h1,
.doc-onepager-col h2,
.doc-onepager-col h3,
.doc-onepager-col h4 {
  margin: 0 0 0.55em;
  color: var(--doc-ink);
  line-height: 1.25;
}
.doc-onepager-col h1 { font-size: 1.25em; }
.doc-onepager-col h2,
.doc-onepager-col h3 { font-size: 1.05em; font-weight: 700; letter-spacing: 0.02em; }
.doc-onepager-col p { margin: 0 0 0.7em; }
.doc-onepager-col ul,
.doc-onepager-col ol { margin: 0 0 0.7em; padding-left: 1.15em; }
.doc-onepager-col li { margin: 0 0 0.35em; }
.doc-onepager-col strong { color: var(--doc-ink); }
.doc-onepager-presence {
  flex: 0 0 auto;
  padding-top: 1.4%;
  border-top: 1px solid var(--doc-rule);
}
${DOCUMENT_INTERNET_PRESENCE_CSS}
.doc-onepager-brands {
  flex: 0 0 auto;
  padding-top: 1.6%;
  border-top: 1px solid var(--doc-rule);
}
${DOCUMENT_CLIENT_LOGOS_CSS}
${DOCUMENT_SERVICES_PAGE_CSS}
.doc-onepager-footer {
  flex: 0 0 auto;
  padding-top: 2%;
  border-top: 1px solid var(--doc-rule);
  font-size: clamp(8px, 1.25cqi, 11px);
  line-height: 1.4;
  color: var(--doc-muted);
  letter-spacing: 0.01em;
}
@page { size: ${pageSize}; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .doc-onepager-stage { padding: 0; background: #fff; min-height: 0; }
  .doc-onepager {
    max-width: none;
    width: 100%;
    height: 100vh;
    aspect-ratio: auto;
    box-shadow: none;
  }
}
`.trim();
}

function printHeaderStartHtml(logoHtml: string, clientLogoHtml?: string): string {
  const client = (clientLogoHtml || '').trim();
  const clientSlot = client ? `<div class="doc-onepager-client">${client}</div>` : '';
  return `<div class="doc-onepager-header-start"><div class="doc-onepager-logo">${logoHtml}</div>${clientSlot}</div>`;
}

export function wrapPrintOnePager(opts: {
  title: string;
  orientation: DocumentOrientation;
  columnsHtml: string[];
  footerHtml: string;
  logoHtml: string;
  kicker?: string;
  brandsHtml?: string;
  presenceHtml?: string;
  clientLogoHtml?: string;
}): string {
  const cols = [...opts.columnsHtml];
  while (cols.length < 3) cols.push('');
  const colMarkup = cols
    .slice(0, 3)
    .map((html) => `<div class="doc-onepager-col">${html || '<p></p>'}</div>`)
    .join('');
  const kicker = (opts.kicker || '').trim();
  const kickerHtml = kicker ? `<p class="doc-onepager-kicker">${esc(kicker)}</p>` : '';
  const presence = (opts.presenceHtml || '').trim();
  const presenceHtml = presence ? `<div class="doc-onepager-presence">${presence}</div>` : '';
  const brands = (opts.brandsHtml || '').trim();
  const brandsHtml = brands ? `<div class="doc-onepager-brands">${brands}</div>` : '';

  return `
<style>${printPageCss(opts.orientation)}</style>
<div class="doc-onepager-stage">
  <article class="doc-onepager" data-orientation="${opts.orientation}">
    <header class="doc-onepager-header">
      ${printHeaderStartHtml(opts.logoHtml, opts.clientLogoHtml)}
      <div class="doc-onepager-mast">
        <h1 class="doc-onepager-title">${esc(opts.title)}</h1>
        ${kickerHtml}
      </div>
    </header>
    <div class="doc-onepager-cols">${colMarkup}</div>
    ${presenceHtml}
    ${brandsHtml}
    <footer class="doc-onepager-footer">${opts.footerHtml}</footer>
  </article>
</div>`.trim();
}

export function wrapPrintPreviewDocument(fragmentHtml: string, orientation: DocumentOrientation): string {
  const pageSize = orientation === 'landscape' ? 'letter landscape' : 'letter portrait';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Document preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    html, body { margin: 0; min-height: 100%; background: #e4e4de; }
    @page { size: ${pageSize}; margin: 0; }
  </style>
</head>
<body>
${fragmentHtml}
</body>
</html>`;
}

export async function renderPrintOnePagerHtml(
  markdown: string,
  company?: PrintCompany,
  slug = '',
  contact?: ContactRecord,
): Promise<string> {
  const parsed = parseDocumentLayout(markdown, slug);
  const columnsHtml = await Promise.all(
    parsed.columns.map((col) => (col ? renderDocumentMarkdown(col) : Promise.resolve(''))),
  );
  const footerSource = parsed.footer || 'Confidential sample · not for distribution';
  const footerHtml = await renderDocumentMarkdown(footerSource);
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const kicker = today;
  const logoHtml = companyLogoHtml(company);
  const wantsClientMark = Boolean(
    parsed.presence || parsed.services || slug.startsWith('audit-onepager'),
  );
  const clientMark = wantsClientMark ? await ensureClientLogoMark(contact) : null;
  const clientName = (contact?.company || contact?.name || 'Client').trim();
  const clientLogoHtml = clientMark ? renderClientLogoMarkHtml(clientMark, clientName) : '';
  const presenceFacts = publicRecordFromContact(contact || {}, {
    logo: clientMark ? clientLogoStatusLabel(clientMark) : undefined,
  });

  const first = wrapPrintOnePager({
    title: parsed.title,
    orientation: parsed.orientation,
    columnsHtml,
    footerHtml,
    logoHtml,
    kicker,
    clientLogoHtml,
    brandsHtml: parsed.brands
      ? renderClientBrandLogosHtml(
          parsed.brands === 'clients' ? undefined : listBrandLogos(parsed.brands),
        )
      : '',
    presenceHtml: parsed.presence ? renderInternetPresenceHtml(undefined, undefined, presenceFacts) : '',
  });

  if (!parsed.services) return first;

  const who = [contact?.name, contact?.company].filter((part) => String(part || '').trim()).join(' · ');
  const companyName = (company?.name || '').trim();
  const page2Footer = [
    'Confidential sample',
    who ? `Prepared for ${who}` : '',
    companyName,
    'Page 2 of 2',
    'Not a signed quote',
  ]
    .filter(Boolean)
    .join(' · ');

  return appendPrintOnePagerArticle(
    first,
    renderAuditServicesArticle({
      logoHtml,
      clientLogoHtml,
      footerHtml: `<p>${esc(page2Footer)}</p>`,
      kicker,
    }),
  );
}
