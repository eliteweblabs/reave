/**
 * Static duplex back for `/admin/sales-sheet` — the REΛVE trifold, not the client audit.
 *
 * Letter landscape reads left → right as the unfolded brochure:
 * inner gate (portal welcome + small-shop Q&A), back cover (custom builds +
 * chat-bubble objections above the stack marks), front cover (full logo dead
 * center + diagnostic). Same HTML for every client.
 */
import { DEFAULT_PORTAL_OUTREACH_NOTICE } from './portalOutreachNotice';
import { PLATFORM_STACK, SIMPLE_ICONS_CDN, type StackTech } from './platformStack';

export type SalesSheetBackCompany = {
  name?: string;
  supportEmail?: string;
  /** Admin → Company “Outreach note” / portal welcome sheet. */
  portalOutreachNotice?: string;
};

export type SalesSheetBackOrientation = 'portrait' | 'landscape';

export type SalesSheetBackLogo = {
  name: string;
  src: string;
  slug?: string;
};

/** Leave-behind subset of `PLATFORM_STACK` — the marks that stay on the back. */
const SALES_SHEET_STACK_SLUGS = [
  'anthropic',
  'astro',
  'clerk',
  'cloudflare',
  'github',
  'plausibleanalytics',
  'railway',
  'resend',
  'supabase',
] as const;

export const SALES_SHEET_STACK: StackTech[] = SALES_SHEET_STACK_SLUGS.map((slug) => {
  const tech = PLATFORM_STACK.find((item) => item.slug === slug);
  if (!tech) throw new Error(`Unknown sales-sheet stack slug: ${slug}`);
  return tech;
}).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

/** Side and bottom inset. Top stays a hair larger so the mast still clears. */
export const SALES_SHEET_PRINT_INSET = '0.2in';
export const SALES_SHEET_PRINT_INSET_TOP = '0.25in';

/** Nearby shops named on the REΛVE back — matches /about + /#portfolio. */
export const SALES_SHEET_LOCAL_CLIENTS = [
  "Barber's Edge",
  'The Law Office of Barry Levine',
  'MDOT.world',
] as const;

/** Hero-demo stock faces for the back-cover chat questions (one per pair). */
export const SALES_SHEET_BACK_CHAT_HEADSHOTS = [
  'hero-field-checkin',
  'hero-nda-signing',
  'hero-henderson-billing',
] as const;

export type SalesSheetBackQa = {
  q: string;
  a: string;
};

/** Print-tight objections on the inner gate. Add more here as they land. */
export const SALES_SHEET_BACK_QA: SalesSheetBackQa[] = [
  {
    q: 'Worried about working with a small shop?',
    a: 'The software is open source. The client retains full control of all licensing and products.',
  },
];

/** Chat-thread objections on the back cover, above the stack marks. */
export const SALES_SHEET_BACK_COVER_QA: SalesSheetBackQa[] = [
  {
    q: 'How can you offer these services for so cheap?',
    a: 'Agility, automation tools, and niche knowledge gained over 20+ years. What takes an agency a dozen emails and three days, I can do in 15 minutes walking the dog.',
  },
  {
    q: 'What happens if you go out of business or disappear?',
    a: 'We never take possession of anything. Be wary of anyone who registers anything “for your convenience”. If you ever feel unsatisfied, you just delete two records with your domain registrar.',
  },
  {
    q: 'Who owns what?',
    a: 'Clients automatically get sent access to the third-party private repositories where everything lives. If you discontinue service, everything will continue to work, only updates discontinue.',
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

function noticeParagraphsHtml(notice: string): string {
  return notice
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="ss-back-copy">${esc(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

/** Same chevrons as `ReaveIconAnimated.astro` — keep the path and stops in sync. */
const REAVE_ICON_PATH =
  'M170.702,163.5c-4.334-.857-13.192,16.033-17.288,22.799-28.639,48.965-66.28,113.492-94.894,162.403-7.108,12.248-12.562,21.164-14.666,26.646-2.896,7.546,1.459,8.494,8.429,9.129,55.588,1.063,164.446.022,220.287.382,5.675.007,12.174-.048,17.058-.42,7.059-.638,11.059-1.994,7.657-9.89-29.888-54.575-75.239-129.012-107.065-184.522-4.681-7.572-14.842-27.518-19.467-26.527h-.051ZM336.67,347.384c4.334.857,13.192-16.033,17.288-22.799,28.639-48.965,66.28-113.492,94.894-162.403,7.108-12.248,12.562-21.164,14.666-26.646,2.896-7.546-1.459-8.494-8.429-9.129-55.588-1.063-164.446-.022-220.287-.382-5.675-.007-12.174.048-17.058.42-7.059.638-11.059,1.994-7.657,9.89,29.888,54.575,75.239,129.012,107.065,184.522,4.681,7.572,14.842,27.518,19.467,26.527h.051Z';

function reaveWebsiteIconHtml(idPrefix: string): string {
  const gradId = `${idPrefix}-grad`;
  return `<svg class="ss-back-reave-icon" xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${esc(gradId)}" x1="64" y1="448" x2="448" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="52%" stop-color="#c026d3"/>
      <stop offset="100%" stop-color="#ff00ff"/>
    </linearGradient>
  </defs>
  <path d="${REAVE_ICON_PATH}" fill="url(#${esc(gradId)})" />
</svg>`;
}

/** Footer lockup from `FootBostonTag.astro` — beans stand in for the o’s. */
const BOSTON_BEAN_BODY =
  'M5.8 1.1c2.9-.1 4.6 2.2 4.5 5.3-.1 3.1-2 5.9-4.4 6.3-1.4.3-2.6-.4-3-1.6-.35-.95-.15-2.05.55-2.35.65-.25 1.15.75.95 2.05-.35 2.2-2.25 1.35-2.75-1.05C1.15 7.35 1.55 3.95 3.25 2.25 4.15 1.35 5 1.1 5.8 1.1Z';
const BOSTON_BEAN_CREASE = 'M3.45 3.35q.55 3.65.95 7.35';

function bostonBeanHtml(which: 'a' | 'b'): string {
  return `<span class="ss-back-boston-bean ss-back-boston-bean--${which}" aria-hidden="true"><svg class="ss-back-boston-bean-icon" viewBox="0 0 11 14" focusable="false" aria-hidden="true"><path d="${BOSTON_BEAN_BODY}" fill="currentColor"/><path d="${BOSTON_BEAN_CREASE}" fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" opacity=".4"/></svg></span>`;
}

function bakedInBostonHtml(): string {
  return `<p class="ss-back-boston" aria-label="Baked in Boston">Baked in B${bostonBeanHtml('a')}st${bostonBeanHtml('b')}n</p>`;
}

function stackLogoHtml(logo: SalesSheetBackLogo): string {
  const slug = (logo.slug || logo.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `<li class="ss-stack-item" data-stack="${esc(slug)}">
  <img class="ss-stack-logo" src="${esc(logo.src)}" alt="${esc(logo.name)}" />
</li>`;
}

function qaListHtml(): string {
  return SALES_SHEET_BACK_QA.map(
    (item) => `<div class="ss-back-qa-item">
            <dt>${esc(item.q)}</dt>
            <dd>${esc(item.a)}</dd>
          </div>`,
  ).join('');
}

function chatUserAvatarHtml(slug: string): string {
  return `<span class="ss-back-chat-avatar ss-back-chat-avatar--user" aria-hidden="true"><img src="/api/media/${esc(slug)}" alt="" /></span>`;
}

function chatReaveAvatarHtml(index: number): string {
  return `<span class="ss-back-chat-avatar ss-back-chat-avatar--reave" aria-hidden="true">${reaveWebsiteIconHtml(`ss-back-chat-reave-${index}`)}</span>`;
}

function backCoverQaHtml(): string {
  const items = SALES_SHEET_BACK_COVER_QA.map((item, i) => {
    const face = SALES_SHEET_BACK_CHAT_HEADSHOTS[i % SALES_SHEET_BACK_CHAT_HEADSHOTS.length];
    return `<div class="ss-back-chat-pair" data-qa="${i + 1}">
  <div class="ss-back-chat-row ss-back-chat-row--q">
    ${chatUserAvatarHtml(face)}
    <p class="ss-back-chat-q">${esc(item.q)}</p>
  </div>
  <div class="ss-back-chat-row ss-back-chat-row--a">
    <p class="ss-back-chat-a">${esc(item.a)}</p>
    ${chatReaveAvatarHtml(i + 1)}
  </div>
</div>`;
  }).join('');
  return `<aside class="ss-back-chat" data-ss-col="back-qa" aria-label="Questions">${items}</aside>`;
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
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
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
  background-position: center center;
  background-size: ${orientation === 'landscape' ? '24.675in 19.067in' : '19.067in 24.675in'};
  opacity: 0.05;
  filter: grayscale(1);
  pointer-events: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-cols {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: ${orientation === 'landscape' ? '1fr 1fr 1fr' : '1fr'};
  grid-template-rows: ${orientation === 'landscape' ? '1fr' : 'auto'};
  gap: 0;
}
.ss-sheet-back .ss-back-col {
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-width: 0;
  min-height: ${orientation === 'portrait' ? '2.8in' : '0'};
  display: flex;
  flex-direction: column;
  gap: 0.38em;
  padding: var(--ss-print-inset-top) var(--ss-print-inset) var(--ss-print-inset);
}
.ss-sheet-back .ss-back-col::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  /* 50% stop sits on the tall center oval (~52% × 74% of the panel). */
  background: radial-gradient(
    ellipse 104% 148% at 50% 50%,
    #fff 0%,
    #fff 22%,
    rgba(255, 255, 255, 0.5) 50%,
    rgba(255, 255, 255, 0.16) 78%,
    rgba(255, 255, 255, 0) 100%
  );
  pointer-events: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-col > * {
  position: relative;
  z-index: 1;
}
.ss-sheet-back .ss-back-col--gate {
  justify-content: flex-start;
}
.ss-sheet-back .ss-back-col + .ss-back-col {
  ${orientation === 'landscape' ? 'border-left: 1px solid var(--doc-rule);' : 'border-top: 1px solid var(--doc-rule); padding-top: 0.55em;'}
}
.ss-sheet-back .ss-back-kicker {
  margin: 0;
  font-size: clamp(7px, 1.05cqi, 9px);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-h {
  margin: 0;
  font-size: clamp(11px, 1.7cqi, 15px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.ss-sheet-back .ss-back-copy,
.ss-sheet-back .ss-back-offer {
  margin: 0;
  font-size: clamp(8px, 1.15cqi, 10px);
  line-height: 1.38;
  color: #2a2a2a;
}
.ss-sheet-back .ss-back-locals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2em;
}
.ss-sheet-back .ss-back-locals li {
  font-size: clamp(8px, 1.1cqi, 10px);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--doc-ink);
}
.ss-sheet-back .ss-back-quote {
  margin: 0;
  font-size: clamp(7.5px, 1.05cqi, 9.5px);
  line-height: 1.35;
  color: #2a2a2a;
  font-style: italic;
}
.ss-sheet-back .ss-back-col--cover {
  position: relative;
  align-items: stretch;
  justify-content: flex-end;
  text-align: left;
  border-left-color: var(--doc-rule);
}
.ss-sheet-back .ss-back-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 84%;
  max-width: 84%;
  pointer-events: none;
}
.ss-sheet-back .ss-back-icon .doc-brand,
.ss-sheet-back .ss-back-icon .doc-onepager-logo-img,
.ss-sheet-back .ss-back-icon .doc-onepager-logo-svg,
.ss-sheet-back .ss-back-icon img,
.ss-sheet-back .ss-back-icon svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: clamp(52px, 16cqh, 112px);
  max-width: 100%;
  margin: 0 auto;
  object-fit: contain;
}
.ss-sheet-back .ss-back-gate-icon {
  margin-top: auto;
  display: grid;
  place-items: center;
  justify-items: center;
  width: 100%;
  padding-top: 0.55em;
}
.ss-sheet-back .ss-back-gate-icon .ss-back-reave-icon,
.ss-sheet-back .ss-back-gate-icon .doc-brand,
.ss-sheet-back .ss-back-gate-icon .doc-onepager-logo-img,
.ss-sheet-back .ss-back-gate-icon .doc-onepager-logo-svg,
.ss-sheet-back .ss-back-gate-icon .doc-brand img,
.ss-sheet-back .ss-back-gate-icon .doc-brand svg {
  display: block;
  width: auto;
  height: clamp(56px, 12cqh, 96px);
  max-width: 52%;
  margin: 0 auto;
  object-fit: contain;
}
.ss-sheet-back .ss-back-boston {
  margin: 0.4em 0 0;
  display: inline-flex;
  align-items: center;
  gap: 0;
  font-size: clamp(8px, 1.15cqi, 11px);
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-boston-bean {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 9px;
  height: 9px;
  margin: 0 1px;
  flex: none;
  overflow: visible;
}
.ss-sheet-back .ss-back-boston-bean-icon {
  display: block;
  width: 9px;
  height: 12px;
}
.ss-sheet-back .ss-back-boston-bean--a { transform: rotate(28deg); }
.ss-sheet-back .ss-back-boston-bean--b { transform: rotate(-28deg); }
.ss-sheet-back .ss-back-qa {
  width: 100%;
  text-align: left;
  margin-top: 0.45em;
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
  margin: 0 0 0.15em;
  font-size: clamp(8px, 1.1cqi, 10px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
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
  font-size: clamp(8px, 1.1cqi, 10px);
  line-height: 1.35;
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
  max-width: none;
  font-size: clamp(8px, 1.15cqi, 10px);
  line-height: 1.38;
  color: #2a2a2a;
}
.ss-sheet-back .ss-back-diagnostic {
  position: relative;
  z-index: 1;
  margin-top: auto;
  padding-top: 0.35em;
}
.ss-sheet-back .ss-back-diagnostic h2 {
  margin: 0 0 0.2em;
  font-size: clamp(10px, 1.45cqi, 13px);
  font-weight: 700;
  letter-spacing: -0.03em;
}
.ss-sheet-back .ss-back-diagnostic p {
  margin: 0;
  font-size: clamp(8px, 1.1cqi, 10px);
  line-height: 1.35;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-platform {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  width: 100%;
  margin-top: auto;
  margin-bottom: 0;
  padding: 0;
}
.ss-sheet-back .ss-back-chat {
  display: flex;
  flex-direction: column;
  gap: 0.42em;
  width: 100%;
}
.ss-sheet-back .ss-back-chat-pair {
  display: flex;
  flex-direction: column;
  gap: 0.18em;
}
.ss-sheet-back .ss-back-chat-row {
  display: flex;
  align-items: flex-end;
  gap: 0.28em;
  width: 100%;
}
.ss-sheet-back .ss-back-chat-row--q {
  justify-content: flex-start;
}
.ss-sheet-back .ss-back-chat-row--a {
  justify-content: flex-end;
}
.ss-sheet-back .ss-back-chat-avatar {
  flex: none;
  width: clamp(14px, 2cqi, 18px);
  height: clamp(14px, 2cqi, 18px);
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-chat-avatar--user {
  background: #d8d8d4;
}
.ss-sheet-back .ss-back-chat-avatar--user img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ss-sheet-back .ss-back-chat-avatar--reave {
  padding: 2px;
  background: #111114;
  box-sizing: border-box;
}
.ss-sheet-back .ss-back-chat-avatar--reave .ss-back-reave-icon {
  display: block;
  width: 100%;
  height: 100%;
}
.ss-sheet-back .ss-back-chat-q,
.ss-sheet-back .ss-back-chat-a {
  margin: 0;
  max-width: 82%;
  padding: 0.38em 0.58em;
  font-size: clamp(8px, 1.12cqi, 10px);
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.32;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-chat-q {
  background: #e9e9eb;
  color: #1d1d1f;
  border-radius: 14px 14px 14px 4px;
}
.ss-sheet-back .ss-back-chat-a {
  background: #007aff;
  color: #fff;
  border-radius: 14px 14px 4px 14px;
}
.ss-sheet-back .ss-stack {
  list-style: none;
  margin: 0.15em auto 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  column-gap: clamp(16px, 2.2cqi, 26px);
  row-gap: clamp(8px, 1.15cqi, 12px);
  max-width: 20cqi;
}
.ss-sheet-back .ss-stack-item {
  display: flex;
  align-items: center;
  justify-content: center;
}
.ss-sheet-back .ss-stack-logo {
  display: block;
  width: clamp(12px, 1.7cqi, 16px);
  height: clamp(12px, 1.7cqi, 16px);
  object-fit: contain;
  filter: brightness(0);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
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
  logoHtml?: string;
}): string {
  const name = (opts.company?.name || 'This platform').trim();
  const stack = salesSheetStackLogos(opts.stackLogos);
  const stackItems = stack.map(stackLogoHtml).join('');
  const notice = (opts.company?.portalOutreachNotice || '').trim() || DEFAULT_PORTAL_OUTREACH_NOTICE;
  const fallbackMark = `<span class="doc-onepager-logo-name">${esc(name)}</span>`;
  const iconHtml = (opts.iconHtml || '').trim() || reaveWebsiteIconHtml('ss-back-reave');
  const logoHtml = (opts.logoHtml || '').trim() || fallbackMark;
  const gateLockup = `${iconHtml}${bakedInBostonHtml()}`;
  const localItems = SALES_SHEET_LOCAL_CLIENTS.map((client) => `<li>${esc(client)}</li>`).join('');

  return `
<style>${backPageCss(opts.orientation)}</style>
<div class="doc-onepager-stage ss-sheet-back">
  <article class="doc-onepager" data-orientation="${opts.orientation}" data-ss-page="back">
    <div class="ss-back-cols">
      <section class="ss-back-col ss-back-col--gate" data-ss-col="gate">
        <p class="ss-back-kicker">Managed hosting</p>
        <h2 class="ss-back-h">We host it. We watch it. We fix it.</h2>
        <div class="ss-back-intro" data-ss-col="welcome">${noticeParagraphsHtml(notice)}</div>
        <div class="ss-back-qa" data-ss-col="qa">
          <p class="ss-back-kicker">Q&amp;A</p>
          <dl class="ss-back-qa-list">${qaListHtml()}</dl>
        </div>
        <div class="ss-back-gate-icon" data-ss-col="gate-icon">${gateLockup}</div>
      </section>
      <section class="ss-back-col ss-back-col--builds" data-ss-col="builds">
        <p class="ss-back-kicker">Custom builds</p>
        <p class="ss-back-builds">
          Built by operators, for operators. ${esc(name)} ships about 90% of
          the operating system on day one — one login instead of the SaaS pile.
          The last 10% is a custom build. We specialize in saving clients time
          by automating the work they still do by hand.
        </p>
        <p class="ss-back-quote">
          “I already had a site. What I needed was hosting I could trust and
          someone to consult when the technical side needed a call.”
        </p>
        <p class="ss-back-kicker">Local</p>
        <ul class="ss-back-locals" aria-label="Local clients">${localItems}</ul>
        <div class="ss-back-platform" data-ss-col="stack">
          ${backCoverQaHtml()}
          <ul class="ss-stack" aria-label="Platform stack">${stackItems}</ul>
        </div>
      </section>
      <section class="ss-back-col ss-back-col--cover" data-ss-col="cover">
        <div class="ss-back-icon">${logoHtml}</div>
        <div class="ss-back-diagnostic">
          <h2>Online presence diagnostic</h2>
          <p>An independent systems scan of your business’s digital footprint.</p>
        </div>
      </section>
    </div>
  </article>
</div>`.trim();
}
