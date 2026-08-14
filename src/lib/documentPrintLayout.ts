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
import { companyLogoUrl, type CompanyConfig } from './companyConfig';
import { prepareInlineBrandSvg, svgHasExternalRasterRefs } from './brandSvg';
import { SITE } from '../config/site';

export type DocumentOrientation = 'portrait' | 'landscape';
export type DocumentLayoutKind = 'default' | 'onepager';

export type PrintCompany = Pick<
  CompanyConfig,
  'name' | 'legalName' | 'domain' | 'supportEmail' | 'logoPath' | 'logoSource' | 'logoVersion' | 'logoSvg'
>;

export type ParsedDocumentLayout = {
  title: string;
  layout: DocumentLayoutKind;
  orientation: DocumentOrientation;
  footer: string;
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
  const body = parsed.body;
  const columns = splitColumns(body);

  return { title, layout, orientation, footer, body, columns };
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

export function wrapPrintOnePager(opts: {
  title: string;
  orientation: DocumentOrientation;
  columnsHtml: string[];
  footerHtml: string;
  logoHtml: string;
  kicker?: string;
}): string {
  const cols = [...opts.columnsHtml];
  while (cols.length < 3) cols.push('');
  const colMarkup = cols
    .slice(0, 3)
    .map((html) => `<div class="doc-onepager-col">${html || '<p></p>'}</div>`)
    .join('');
  const kicker = opts.kicker || (opts.orientation === 'landscape' ? 'Landscape' : 'Portrait');

  return `
<style>${printPageCss(opts.orientation)}</style>
<div class="doc-onepager-stage">
  <article class="doc-onepager" data-orientation="${opts.orientation}">
    <header class="doc-onepager-header">
      <div class="doc-onepager-logo">${opts.logoHtml}</div>
      <div class="doc-onepager-mast">
        <h1 class="doc-onepager-title">${esc(opts.title)}</h1>
        <p class="doc-onepager-kicker">${esc(kicker)}</p>
      </div>
    </header>
    <div class="doc-onepager-cols">${colMarkup}</div>
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
  const kicker = `${parsed.orientation === 'landscape' ? 'Landscape' : 'Portrait'} · ${today}`;

  return wrapPrintOnePager({
    title: parsed.title,
    orientation: parsed.orientation,
    columnsHtml,
    footerHtml,
    logoHtml: companyLogoHtml(company),
    kicker,
  });
}
