/**
 * Static duplex back for `/admin/sales-sheet` — the REΛVE side, not the client audit.
 *
 * Two columns on Letter: managed hosting (stack marks along the bottom) and a
 * cover (site pattern + company icon + Q&A + diagnostic line). Same HTML for every client.
 */
import { formatHostingUsd, HOSTING_CARE_PLANS } from './hostingPlans';
import { PLATFORM_STACK, SIMPLE_ICONS_CDN, type StackTech } from './platformStack';

export type SalesSheetBackCompany = {
  name?: string;
  supportEmail?: string;
};

export type SalesSheetBackOrientation = 'portrait' | 'landscape';

export type SalesSheetBackLogo = {
  name: string;
  src: string;
  slug?: string;
};

/** Flyer back — one print row. Yellowed marks stay on /platform, not here. */
const SALES_SHEET_STACK_SLUGS = [
  'astro',
  'nodedotjs',
  'railway',
  'supabase',
  'clerk',
  'resend',
  'anthropic',
  'github',
  'cloudflare',
  'caldotcom',
  'plausibleanalytics',
] as const;

export const SALES_SHEET_STACK: StackTech[] = SALES_SHEET_STACK_SLUGS.map((slug) => {
  const tech = PLATFORM_STACK.find((item) => item.slug === slug);
  if (!tech) throw new Error(`sales sheet stack is missing ${slug}`);
  return tech;
});

/** Side and bottom inset. Top stays a hair larger so the mast still clears. */
export const SALES_SHEET_PRINT_INSET = '0.2in';
export const SALES_SHEET_PRINT_INSET_TOP = '0.25in';

/** Nearby shops named on the REΛVE back — matches /about + /#portfolio. */
export const SALES_SHEET_LOCAL_CLIENTS = [
  "Barber's Edge",
  'The Law Office of Barry Levine',
  'MDOT.world',
] as const;

export type SalesSheetBackQa = {
  q: string;
  a: string;
};

/** Print-tight objections on the REΛVE cover. Add more here as they land. */
export const SALES_SHEET_BACK_QA: SalesSheetBackQa[] = [
  {
    q: 'Worried about working with a small shop?',
    a: 'The software is open source. The client retains full control of all licensing and products.',
  },
];

export function salesSheetStackLogos(overrides: SalesSheetBackLogo[] = []): SalesSheetBackLogo[] {
  if (overrides.length) {
    const hasAnthropic = overrides.some((logo) => /anthropic|claude/i.test(`${logo.name} ${logo.slug} ${logo.src}`));
    if (hasAnthropic) return overrides;
    const anthropic = SALES_SHEET_STACK.find((tech) => tech.slug === 'anthropic');
    if (!anthropic) return overrides;
    return [
      ...overrides,
      { name: anthropic.name, slug: anthropic.slug, src: SIMPLE_ICONS_CDN(anthropic.slug) },
    ];
  }
  return SALES_SHEET_STACK.map((tech) => ({
    name: tech.name,
    slug: tech.slug,
    src: tech.iconSrc
      ? `/api/media/${tech.iconSrc}`
      : tech.iconHref || SIMPLE_ICONS_CDN(tech.slug),
  }));
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stackLogoHtml(logo: SalesSheetBackLogo): string {
  const slug = (logo.slug || logo.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `<li class="ss-stack-item" data-stack="${esc(slug)}">
  <img class="ss-stack-logo" src="${esc(logo.src)}" alt="${esc(logo.name)}" />
</li>`;
}

function backPageCss(orientation: SalesSheetBackOrientation): string {
  const pageSize = orientation === 'landscape' ? 'letter landscape' : 'letter portrait';
  const ratio = orientation === 'landscape' ? '11 / 8.5' : '8.5 / 11';
  const maxWidth = orientation === 'landscape' ? '11in' : '8.5in';
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
  --ss-print-inset: ${SALES_SHEET_PRINT_INSET};
  --ss-print-inset-top: ${SALES_SHEET_PRINT_INSET_TOP};
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  width: 100%;
  max-width: ${maxWidth};
  aspect-ratio: ${ratio};
  background: #fff;
  color: var(--doc-ink);
  box-shadow: 0 2px 18px rgba(0, 0, 0, 0.1);
  padding: var(--ss-print-inset-top) var(--ss-print-inset) var(--ss-print-inset);
  display: flex;
  flex-direction: column;
  gap: 2%;
  container-type: size;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.ss-sheet-back .doc-onepager::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: url("/reave-bg-pattern.svg");
  background-repeat: repeat;
  background-position: center;
  background-size: 260% 260%;
  opacity: 0.05;
  filter: grayscale(1);
  pointer-events: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-cols,
.ss-sheet-back .doc-onepager-footer {
  position: relative;
  z-index: 1;
}
.ss-sheet-back .ss-back-cols {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: ${orientation === 'landscape' ? '1.12fr 1fr' : '1fr'};
  grid-template-rows: ${orientation === 'landscape' ? '1fr' : 'auto 1fr'};
  gap: 0 3.2%;
}
.ss-sheet-back .ss-back-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55em;
}
.ss-sheet-back .ss-back-col--hosting {
  justify-content: flex-start;
}
.ss-sheet-back .ss-back-col + .ss-back-col {
  padding-left: 3.2%;
  border-left: 1px solid var(--doc-rule);
}
.ss-sheet-back .ss-back-kicker {
  margin: 0;
  font-size: clamp(8px, 1.2cqi, 10px);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-h {
  margin: 0;
  font-size: clamp(13px, 2.15cqi, 18px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.ss-sheet-back .ss-back-copy,
.ss-sheet-back .ss-back-stat,
.ss-sheet-back .ss-back-offer {
  margin: 0;
  font-size: clamp(9px, 1.35cqi, 11.5px);
  line-height: 1.45;
  color: #2a2a2a;
}
.ss-sheet-back .ss-back-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35em;
}
.ss-sheet-back .ss-back-list li {
  font-size: clamp(9px, 1.3cqi, 11px);
  line-height: 1.4;
  color: #2a2a2a;
}
.ss-sheet-back .ss-back-list strong { color: var(--doc-ink); }
.ss-sheet-back .ss-back-locals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2em;
}
.ss-sheet-back .ss-back-locals li {
  font-size: clamp(9px, 1.3cqi, 11px);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.35;
  color: var(--doc-ink);
}
.ss-sheet-back .ss-back-quote {
  margin: 0;
  font-size: clamp(8.5px, 1.25cqi, 10.5px);
  line-height: 1.4;
  color: #2a2a2a;
  font-style: italic;
}
.ss-sheet-back .ss-back-col--cover {
  align-items: center;
  justify-content: space-between;
  text-align: center;
  border-left-color: var(--doc-rule);
}
.ss-sheet-back .ss-back-icon {
  display: grid;
  place-items: center;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}
.ss-sheet-back .ss-back-icon .doc-brand,
.ss-sheet-back .ss-back-icon .doc-onepager-logo-img,
.ss-sheet-back .ss-back-icon .doc-onepager-logo-svg,
.ss-sheet-back .ss-back-icon img,
.ss-sheet-back .ss-back-icon svg {
  display: block;
  width: auto;
  height: clamp(56px, 16cqh, 110px);
  max-width: 70%;
  margin: 0 auto;
  object-fit: contain;
}
.ss-sheet-back .ss-back-qa {
  width: 100%;
  text-align: left;
}
.ss-sheet-back .ss-back-qa-list {
  list-style: none;
  margin: 0.3em 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55em;
}
.ss-sheet-back .ss-back-qa-item {
  margin: 0;
}
.ss-sheet-back .ss-back-qa-item dt {
  margin: 0 0 0.2em;
  font-size: clamp(9px, 1.3cqi, 11px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: var(--doc-ink);
}
.ss-sheet-back .ss-back-qa-item dt::before {
  content: "Q  ";
  color: var(--doc-muted);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.ss-sheet-back .ss-back-qa-item dd {
  margin: 0;
  font-size: clamp(9px, 1.3cqi, 11px);
  line-height: 1.4;
  color: #2a2a2a;
}
.ss-sheet-back .ss-back-qa-item dd::before {
  content: "A  ";
  color: var(--doc-muted);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.ss-sheet-back .ss-back-builds {
  margin: 0;
  max-width: 34ch;
  font-size: clamp(9px, 1.35cqi, 11.5px);
  line-height: 1.45;
  color: #2a2a2a;
}
.ss-sheet-back .ss-back-diagnostic {
  margin-top: auto;
  padding-top: 0.6em;
}
.ss-sheet-back .ss-back-diagnostic h2 {
  margin: 0 0 0.25em;
  font-size: clamp(12px, 1.85cqi, 16px);
  font-weight: 700;
  letter-spacing: -0.03em;
}
.ss-sheet-back .ss-back-diagnostic p {
  margin: 0;
  font-size: clamp(9px, 1.3cqi, 11px);
  line-height: 1.4;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-stack {
  list-style: none;
  margin-top: auto;
  padding: 0.35em 0 0;
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.16em;
}
.ss-sheet-back .ss-stack-item {
  display: flex;
  align-items: center;
  justify-content: center;
}
.ss-sheet-back .ss-stack-logo {
  display: block;
  width: clamp(9px, 1.25cqi, 13px);
  height: clamp(9px, 1.25cqi, 13px);
  object-fit: contain;
  filter: brightness(0);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .doc-onepager-footer {
  flex: 0 0 auto;
  padding-top: 0.8%;
  border-top: none;
  font-size: clamp(8px, 1.2cqi, 10.5px);
  line-height: 1.4;
  color: var(--doc-muted);
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
  stackLogos?: SalesSheetBackLogo[];
  iconHtml?: string;
}): string {
  const name = (opts.company?.name || 'This platform').trim();
  const support = (opts.company?.supportEmail || '').trim();
  const stack = salesSheetStackLogos(opts.stackLogos);
  const stackItems = stack.map(stackLogoHtml).join('');
  const care = HOSTING_CARE_PLANS.find((plan) => plan.id === 'care');
  const unlimited = HOSTING_CARE_PLANS.find((plan) => plan.id === 'care-unlimited');
  const footerBits = [esc(name), support ? esc(support) : '', 'Printed two sides', 'Page 2 of 2'].filter(Boolean);
  const iconHtml =
    (opts.iconHtml || '').trim() || `<span class="doc-onepager-logo-name">${esc(name)}</span>`;
  const localItems = SALES_SHEET_LOCAL_CLIENTS.map((client) => `<li>${esc(client)}</li>`).join('');

  return `
<style>${backPageCss(opts.orientation)}</style>
<div class="doc-onepager-stage ss-sheet-back">
  <article class="doc-onepager" data-orientation="${opts.orientation}" data-ss-page="back">
    <div class="ss-back-cols">
      <section class="ss-back-col ss-back-col--hosting" data-ss-col="hosting">
        <p class="ss-back-kicker">Managed hosting</p>
        <h2 class="ss-back-h">We host it. We watch it. We fix it.</h2>
        <p class="ss-back-copy">
          Over 20 years designing logos, sites, plugins, and apps for shops that
          needed more than a template. Every finding on the other side of this
          sheet is work we take on with a one-year Core OS plan — daily scans,
          malware cleanup, weekly SEO reports, and the updates nobody wants to
          babysit.
        </p>
        <ul class="ss-back-list">
          <li><strong>Core OS</strong> ${care ? `${formatHostingUsd(care.annualUsd)}/year` : '$600/year'} · the site, watched</li>
          <li><strong>Growth</strong> ${unlimited ? `${formatHostingUsd(unlimited.annualUsd)}/year` : '$900/year'} · plus edits whenever you need them</li>
        </ul>
        <p class="ss-back-stat">
          Infrastructure sits on Railway™ — git-push deploys, isolated containers,
          not a shared cPanel box. Their builder clears 50M+ builds a month and
          has peaked at 66,000 builds an hour on bare metal. Rollbacks in one click.
        </p>
        <p class="ss-back-copy">
          What the fixes do: the page loads, the listing shows, the form works,
          and you stop losing calls to a site that looks closed.
        </p>
        <p class="ss-back-quote">
          “I already had a site. What I needed was hosting I could trust and
          someone to consult when the technical side needed a call.”
        </p>
        <p class="ss-back-offer">
          <strong>Nearby rate</strong> — first-year Core OS for shops we can actually
          get to. Not on the website. Ask while we’re standing here.
        </p>
        <p class="ss-back-kicker">Local</p>
        <ul class="ss-back-locals" aria-label="Local clients">${localItems}</ul>
        <ul class="ss-stack" data-ss-col="stack" aria-label="Platform stack">${stackItems}</ul>
      </section>
      <section class="ss-back-col ss-back-col--cover" data-ss-col="cover">
        <div class="ss-back-icon">${iconHtml}</div>
        <p class="ss-back-kicker">Custom builds</p>
        <p class="ss-back-builds">
          Built by operators, for operators. ${esc(name)} ships about 90% of
          the operating system on day one — one login instead of the SaaS pile.
          The last 10% is a custom build. We specialize in saving clients time
          by automating the work they still do by hand.
        </p>
        <div class="ss-back-qa" data-ss-col="qa">
          <p class="ss-back-kicker">Q&amp;A</p>
          <dl class="ss-back-qa-list">${SALES_SHEET_BACK_QA.map(
            (item) => `<div class="ss-back-qa-item">
            <dt>${esc(item.q)}</dt>
            <dd>${esc(item.a)}</dd>
          </div>`,
          ).join('')}</dl>
        </div>
        <div class="ss-back-diagnostic">
          <h2>Online presence diagnostic</h2>
          <p>An independent systems scan of your business’s digital footprint.</p>
        </div>
      </section>
    </div>
    <footer class="doc-onepager-footer">${footerBits.join(' · ')}</footer>
  </article>
</div>`.trim();
}
