/**
 * Static duplex back for `/admin/sales-sheet`.
 *
 * Same on every client version: company chrome + two icon sections
 * (replaced-app marks from `brandLogos.ts`, about-page client marks from
 * site content). Front stays the custom audit; this page is the flip side
 * for two-sided Letter print. Layout of the two sections is a template.
 */
export type SalesSheetBackCompany = {
  name?: string;
  supportEmail?: string;
};

export type SalesSheetBackOrientation = 'portrait' | 'landscape';

export type SalesSheetBackLogo = {
  name: string;
  src: string;
  width?: number;
  height?: number;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logoTileHtml(logo: SalesSheetBackLogo): string {
  return `<li class="ss-back-tile">
  <span class="ss-back-mark">
    <img src="${esc(logo.src)}" alt="" width="28" height="28" />
  </span>
  <span class="ss-back-name">${esc(logo.name)}</span>
</li>`;
}

function clientMarkHtml(logo: SalesSheetBackLogo): string {
  const w = logo.width && logo.width > 0 ? String(Math.round(logo.width)) : '120';
  const h = logo.height && logo.height > 0 ? String(Math.round(logo.height)) : '24';
  return `<li class="ss-back-client">
  <img src="${esc(logo.src)}" alt="${esc(logo.name)}" width="${w}" height="${h}" />
</li>`;
}

function backPageCss(orientation: SalesSheetBackOrientation): string {
  const pageSize = orientation === 'landscape' ? 'letter landscape' : 'letter portrait';
  const ratio = orientation === 'landscape' ? '11 / 8.5' : '8.5 / 11';
  const maxWidth = orientation === 'landscape' ? '11in' : '8.5in';
  const cols = orientation === 'landscape' ? 7 : 5;

  return `
.ss-sheet-back.doc-onepager-stage {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 16px;
  background: #e4e4de;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.ss-sheet-back .doc-onepager {
  --doc-ink: #141414;
  --doc-muted: #6b6b6b;
  --doc-rule: #d4d4cc;
  --ss-print-inset: 0.25in;
  box-sizing: border-box;
  width: 100%;
  max-width: ${maxWidth};
  aspect-ratio: ${ratio};
  background: #fff;
  color: var(--doc-ink);
  box-shadow: 0 2px 18px rgba(0, 0, 0, 0.1);
  padding: var(--ss-print-inset);
  display: flex;
  flex-direction: column;
  gap: 2.4%;
  container-type: size;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.ss-sheet-back .doc-onepager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4%;
  flex: 0 0 auto;
  padding-bottom: 2%;
  border-bottom: 1.5px solid var(--doc-ink);
}
.ss-sheet-back .doc-onepager-logo {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 42%;
}
.ss-sheet-back .doc-onepager-logo-img,
.ss-sheet-back .doc-onepager-logo-svg {
  display: block;
  height: clamp(22px, 7cqh, 44px);
  width: auto;
  max-width: 100%;
  object-fit: contain;
}
.ss-sheet-back .doc-onepager-logo-name {
  font-size: clamp(13px, 2.6cqi, 20px);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ss-sheet-back .doc-onepager-mast { text-align: right; min-width: 0; }
.ss-sheet-back .doc-onepager-title {
  margin: 0;
  font-size: clamp(13px, 2.5cqi, 20px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.ss-sheet-back .doc-onepager-kicker {
  margin: 0.25em 0 0;
  font-size: clamp(9px, 1.5cqi, 12px);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.7em;
}
.ss-sheet-back .ss-back-lead,
.ss-sheet-back .ss-back-note {
  margin: 0;
  max-width: 62ch;
  color: #2a2a2a;
  line-height: 1.45;
}
.ss-sheet-back .ss-back-lead {
  font-size: clamp(11px, 1.7cqi, 14px);
}
.ss-sheet-back .ss-back-note {
  font-size: clamp(9px, 1.35cqi, 11px);
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45em;
  min-height: 0;
}
.ss-sheet-back .ss-back-section-title {
  margin: 0;
  font-size: clamp(9px, 1.35cqi, 11px);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(${cols}, minmax(0, 1fr));
  gap: 0.45em 0.35em;
  flex: 1 1 auto;
  align-content: center;
}
.ss-sheet-back .ss-back-clients {
  list-style: none;
  margin: 0;
  padding: 0.35em 0 0;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.55em 1.1em;
  border-top: 1px solid var(--doc-rule);
}
.ss-sheet-back .ss-back-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35em;
  min-width: 0;
}
.ss-sheet-back .ss-back-mark {
  display: grid;
  place-items: center;
  width: clamp(36px, 5.4cqi, 52px);
  height: clamp(36px, 5.4cqi, 52px);
  background: #1a1a1a;
  border-radius: 10px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-mark img {
  display: block;
  width: 52%;
  height: 52%;
  object-fit: contain;
}
.ss-sheet-back .ss-back-name {
  font-size: clamp(7px, 1.05cqi, 9px);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--doc-muted);
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ss-sheet-back .ss-back-client {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.ss-sheet-back .ss-back-client img {
  display: block;
  height: clamp(14px, 2.6cqi, 24px);
  width: auto;
  max-width: 7.4em;
  object-fit: contain;
}
.ss-sheet-back .doc-onepager-footer {
  flex: 0 0 auto;
  padding-top: 1.6%;
  border-top: 1px solid var(--doc-rule);
  font-size: clamp(8px, 1.25cqi, 11px);
  line-height: 1.4;
  color: var(--doc-muted);
  letter-spacing: 0.01em;
}
@page { size: ${pageSize}; margin: 0; }
@media print {
  .ss-sheet-back.doc-onepager-stage {
    padding: 0;
    background: #fff;
    min-height: 0;
    break-before: page;
    page-break-before: always;
  }
  .ss-sheet-back .doc-onepager {
    max-width: none;
    width: 100%;
    height: 100vh;
    aspect-ratio: auto;
    box-shadow: none;
  }
}
`.trim();
}

export function renderSalesSheetBackHtml(opts: {
  company?: SalesSheetBackCompany;
  orientation: SalesSheetBackOrientation;
  logos?: SalesSheetBackLogo[];
  clientLogos?: SalesSheetBackLogo[];
  logoHtml?: string;
}): string {
  const name = (opts.company?.name || 'This platform').trim();
  const support = (opts.company?.supportEmail || '').trim();
  const logos = opts.logos || [];
  const clientLogos = opts.clientLogos || [];
  const items = logos.map(logoTileHtml).join('');
  const clientItems = clientLogos.map(clientMarkHtml).join('');
  const footerBits = [esc(name), support ? esc(support) : '', 'Printed two sides', 'Page 2 of 2'].filter(Boolean);
  const logoHtml = (opts.logoHtml || '').trim() || `<span class="doc-onepager-logo-name">${esc(name)}</span>`;

  return `
<style>${backPageCss(opts.orientation)}</style>
<div class="doc-onepager-stage ss-sheet-back">
  <article class="doc-onepager" data-orientation="${opts.orientation}" data-ss-page="back">
    <header class="doc-onepager-header">
      <div class="doc-onepager-logo">${logoHtml}</div>
      <div class="doc-onepager-mast">
        <h1 class="doc-onepager-title">Replace the stack</h1>
        <p class="doc-onepager-kicker">One platform</p>
      </div>
    </header>
    <div class="ss-back-body">
      <p class="ss-back-lead">
        Most small businesses pay separately for email, CRM, invoicing, scheduling,
        AI, file storage, e-sign, and project tools. ${esc(name)} is built to absorb
        that whole layer — so you stop juggling logins and line items.
      </p>
      <section class="ss-back-section" data-ss-section="platforms">
        <h2 class="ss-back-section-title">Apps this platform replaces</h2>
        <ul class="ss-back-grid" aria-label="Apps this platform replaces">${items}</ul>
      </section>
      <section class="ss-back-section" data-ss-section="clients">
        <h2 class="ss-back-section-title">Worked with</h2>
        <ul class="ss-back-clients" aria-label="Clients from the about page">${clientItems}</ul>
      </section>
      <p class="ss-back-note">
        Keep Gmail or Outlook for personal mail if you want — the OS handles CRM,
        billing, projects, scheduling, AI, and the client portal that used to
        require all of the above.
      </p>
    </div>
    <footer class="doc-onepager-footer">${footerBits.join(' · ')}</footer>
  </article>
</div>`.trim();
}
