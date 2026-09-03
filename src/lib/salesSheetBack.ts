/**
 * Static duplex back for `/admin/sales-sheet` — the reave.app trifold, not the client audit.
 *
 * Letter landscape reads left → right as the unfolded brochure:
 * inner gate (sale-sheet module tiles), back cover (custom builds +
 * chat-bubble objections above the client marks), front cover (full logo dead
 * center + diagnostic). Same HTML for every client.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRANDING_ICON_PATH } from './companyLogo';
import type { CatalogRow } from './moduleCatalog';
import { projectRoot } from './projectRoot';

/** Official square mark as PNG — `/api/branding/icon`, not the website SVG. */
const SALES_SHEET_ICON_PNG = `${BRANDING_ICON_PATH}?size=256&transparent=1`;

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
  /** Visual scale vs peers (1 = default). */
  scale?: number;
};

export type SalesSheetBackModule = {
  feature: string;
  label: string;
  blurb?: string;
  priceLabel?: string;
  /** IOS_ICONS key — keep glyphs in sync with public/admin/admin-ui.js */
  icon: string;
};

/** Print-only copy — static placeholders, not live contact data. */
const SALES_SHEET_MODULE_BLURBS: Partial<Record<string, string>> = {
  google_workspace:
    'A branded email (you@yourcompany.com) looks more professional than a free Gmail™ address.',
};

/** Sale-sheet add-ons → their dashboard / footer IOS_ICONS key. */
const FEATURE_MOD_ICONS: Record<string, string> = {
  billing: 'receipt',
  documents: 'file-text',
  digital_signature: 'edit',
  email_marketing: 'send',
  google_workspace: 'mail',
  materials_pricing: 'shopping-bag',
  real_estate_data: 'map-pin',
  scheduling: 'calendar',
  social_inbox: 'share',
  time_tracking: 'stopwatch',
  website: 'image',
  content_management: 'image',
};

/**
 * Inner path data from IOS_ICONS — keep in sync with public/admin/admin-ui.js.
 * Sales-sheet HTML is server-rendered and cannot import the admin pack.
 */
const IOS_ICON_PATHS: Record<string, string> = {
  calendar:
    '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  'file-text':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  edit:
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'map-pin':
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  puzzle:
    '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
  receipt:
    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  share:
    '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  'shopping-bag':
    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  stopwatch:
    '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/>',
};

function iconKeyForModule(feature: string): string {
  return FEATURE_MOD_ICONS[feature] || 'puzzle';
}

/** Print cards only have two lines — keep the first sentence of a long catalog blurb. */
function salesSheetBlurb(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= 140) return text;
  const sentence = text.match(/^.+?[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= 36) return sentence[0];
  return `${text.slice(0, 137).replace(/\s+\S*$/, '')}…`;
}

function moduleIconHtml(iconKey: string): string {
  const key = IOS_ICON_PATHS[iconKey] ? iconKey : 'puzzle';
  const paths = IOS_ICON_PATHS[key]!;
  return `<!-- IOS_ICONS.${key} — keep in sync with public/admin/admin-ui.js --><span class="ss-back-mod-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}

/** Add-on / custom catalog rows with the sale-sheet toggle on. Core OS stays off this list. */
export function salesSheetBackModules(rows: readonly CatalogRow[]): SalesSheetBackModule[] {
  return rows
    .filter(
      (row) =>
        row.saleSheet === true &&
        row.kind !== 'core' &&
        row.visibility !== 'private' &&
        row.group !== 'internal',
    )
    .map((row) => ({
      feature: row.feature,
      label: row.label,
      blurb: salesSheetBlurb(
        SALES_SHEET_MODULE_BLURBS[row.feature] ?? row.blurb ?? '',
      ),
      priceLabel: (row.priceLabel || '').trim(),
      icon: iconKeyForModule(row.feature),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
}

/**
 * About-page client marks on the back cover — same `clientLogos` list as
 * `/about` (`config/sites/reave-config.json` → media library). Curated subset
 * so two print rows stay readable.
 */
export const SALES_SHEET_CLIENT_LOGO_NAMES = [
  'Porsche',
  'The New York Times',
  'Red Bull',
  'Chase Bank',
  'Worcester Polytechnic Institute',
  'Kingdom Trails',
  'Mohegan Sun',
  'Coinbase',
] as const;

function clientLogoKey(name: string): string {
  return name.trim().toLowerCase();
}

function mediaSlugFromSrc(src: string): string {
  const fromUrl = src.match(/\/api\/media\/([^/?#]+)/)?.[1] || '';
  return decodeURIComponent(fromUrl).trim();
}

function clientLogoSrc(ref?: string): string {
  const value = (ref ?? '').trim();
  if (!value) return '';
  if (
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:')
  ) {
    return value;
  }
  return `/api/media/${encodeURIComponent(value)}`;
}

function displaySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadAboutClientLogos(): { name: string; src: string; scale?: number }[] {
  const path = join(projectRoot(), 'config', 'sites', 'reave-config.json');
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      clientLogos?: { name?: string; image?: string; scale?: number }[];
    };
    return (raw.clientLogos || [])
      .map((logo) => {
        const scaleRaw = Number(logo.scale);
        const scale =
          Number.isFinite(scaleRaw) && scaleRaw > 0 && scaleRaw !== 1
            ? Math.min(2, Math.max(0.25, scaleRaw))
            : undefined;
        return {
          name: String(logo.name || '').trim(),
          src: clientLogoSrc(logo.image),
          ...(scale != null ? { scale } : {}),
        };
      })
      .filter((logo) => logo.name && logo.src);
  } catch {
    return [];
  }
}

export function salesSheetClientLogos(): SalesSheetBackLogo[] {
  const byName = new Map(loadAboutClientLogos().map((logo) => [clientLogoKey(logo.name), logo]));
  return SALES_SHEET_CLIENT_LOGO_NAMES.flatMap((name) => {
    const logo = byName.get(clientLogoKey(name));
    if (!logo) return [];
    return [{
      name: logo.name,
      slug: mediaSlugFromSrc(logo.src) || displaySlug(logo.name),
      src: logo.src,
      ...(logo.scale != null ? { scale: logo.scale } : {}),
    }];
  });
}

/** Side and bottom inset. Top stays a hair larger so the mast still clears. */
export const SALES_SHEET_PRINT_INSET = '0.2in';
export const SALES_SHEET_PRINT_INSET_TOP = '0.25in';

/** Nearby shops named on the reave.app back — matches /about + /#portfolio. */
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

/** Chat-thread objections on the back cover, above the client marks. */
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
    a: 'You automatically get sent access to the third-party private repositories where everything lives. If you discontinue service, everything will continue to work, only updates discontinue.',
  },
];

export function salesSheetStackLogos(overrides: SalesSheetBackLogo[] = []): SalesSheetBackLogo[] {
  return overrides.length ? overrides : salesSheetClientLogos();
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape for print HTML — &#64; keeps Cloudflare from obfuscating example addresses. */
function escPrintText(s: string): string {
  return esc(s).replace(/@/g, '&#64;');
}

function reaveIconPngHtml(src: string): string {
  return `<img class="ss-back-reave-icon" src="${esc(src)}" alt="" />`;
}

function stackLogoHtml(logo: SalesSheetBackLogo): string {
  const slug = (logo.slug || logo.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const scaleStyle =
    logo.scale != null && logo.scale > 0 && logo.scale !== 1
      ? ` style="--logo-scale: ${logo.scale}"`
      : '';
  return `<li class="ss-stack-item" data-stack="${esc(slug)}"${scaleStyle}>
  <img class="ss-stack-logo" src="${esc(logo.src)}" alt="${esc(logo.name)}" />
</li>`;
}

function modulesHtml(modules: SalesSheetBackModule[]): string {
  if (!modules.length) return '';
  const items = modules
    .map((mod) => {
      const blurb = (mod.blurb || '').trim();
      const price = (mod.priceLabel || '').trim();
      const blurbHtml = blurb ? `<span class="ss-back-mod-blurb">${escPrintText(blurb)}</span>` : '';
      const priceHtml = price ? `<span class="ss-back-mod-price">${esc(price)}</span>` : '';
      return `<li class="ss-back-mod" data-mod="${esc(mod.feature)}" data-icon="${esc(mod.icon)}">
  ${moduleIconHtml(mod.icon)}
  <span class="ss-back-mod-copy"><span class="ss-back-mod-label">${esc(mod.label)}</span>${blurbHtml}</span>
  ${priceHtml}
</li>`;
    })
    .join('');
  return `<div class="ss-back-modules" data-ss-col="modules">
    <ul class="ss-back-mod-list" aria-label="Modules">${items}</ul>
  </div>`;
}

function chatUserAvatarHtml(slug: string): string {
  return `<span class="ss-back-chat-avatar ss-back-chat-avatar--user" aria-hidden="true"><img src="/api/media/${esc(slug)}" alt="" /></span>`;
}

function chatReaveAvatarHtml(src: string): string {
  return `<span class="ss-back-chat-avatar ss-back-chat-avatar--reave" aria-hidden="true">${reaveIconPngHtml(src)}</span>`;
}

function backCoverQaHtml(iconSrc: string): string {
  const items = SALES_SHEET_BACK_COVER_QA.map((item, i) => {
    const face = SALES_SHEET_BACK_CHAT_HEADSHOTS[i % SALES_SHEET_BACK_CHAT_HEADSHOTS.length];
    return `<div class="ss-back-chat-pair" data-qa="${i + 1}">
  <div class="ss-back-chat-row ss-back-chat-row--q">
    ${chatUserAvatarHtml(face)}
    <p class="ss-back-chat-q">${esc(item.q)}</p>
  </div>
  <div class="ss-back-chat-row ss-back-chat-row--a">
    <p class="ss-back-chat-a">${esc(item.a)}</p>
    ${chatReaveAvatarHtml(iconSrc)}
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
  overflow: visible;
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
.ss-sheet-back .ss-back-modules {
  flex: 0 0 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ss-sheet-back .ss-back-mod-list {
  list-style: none;
  margin: 0;
  padding: 0.42em 0 0;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.62em;
}
.ss-sheet-back .ss-back-mod {
  position: relative;
  flex: 0 0 auto;
  height: clamp(44px, 6.2cqi, 54px);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.45em;
  width: 100%;
  box-sizing: border-box;
  padding: 0.28em 0.32em;
  overflow: visible;
  border: 1px solid var(--doc-rule);
  border-radius: 8px;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-mod-icon {
  flex: 0 0 auto;
  width: clamp(22px, 3.1cqi, 28px);
  height: clamp(22px, 3.1cqi, 28px);
  border-radius: 999px;
  background: #f3f3ef;
  border: 1px solid #e6e6e0;
  color: var(--doc-ink);
  display: grid;
  place-items: center;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-sheet-back .ss-back-mod-icon svg {
  display: block;
  width: 54%;
  height: 54%;
}
.ss-sheet-back .ss-back-mod-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.12em;
  padding-right: 1.15em;
}
.ss-sheet-back .ss-back-mod-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(8.5px, 1.32cqi, 12px);
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--doc-ink);
}
.ss-sheet-back .ss-back-mod-blurb {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  max-height: calc(1.28em * 2);
  font-size: clamp(6.5px, 0.92cqi, 8.5px);
  font-weight: 500;
  letter-spacing: -0.005em;
  line-height: 1.28;
  color: var(--doc-muted);
}
.ss-sheet-back .ss-back-mod-price {
  --ss-badge-h: 1.55em;
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  box-sizing: border-box;
  height: var(--ss-badge-h);
  display: inline-flex;
  align-items: center;
  transform: translateY(-50%) translateX(calc(var(--ss-badge-h) / 2));
  flex: none;
  padding: 0 0.55em;
  border-radius: 999px;
  background: #141414;
  color: #fff;
  font-size: clamp(6.5px, 0.95cqi, 8.5px);
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1;
  white-space: nowrap;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
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
  gap: 1.25em;
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
  object-fit: contain;
}
.ss-sheet-back .ss-back-chat-q,
.ss-sheet-back .ss-back-chat-a {
  margin: 0;
  max-width: 82%;
  padding: 0.62em 0.88em;
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
  margin: 0.35em auto 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  justify-items: center;
  column-gap: 0.4em;
  row-gap: 0.55em;
  width: 100%;
}
.ss-sheet-back .ss-stack-item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  width: 100%;
}
.ss-sheet-back .ss-stack-logo {
  display: block;
  height: calc(clamp(13px, 1.85cqi, 18px) * var(--logo-scale, 1));
  width: auto;
  max-width: 100%;
  object-fit: contain;
  filter: grayscale(1) brightness(0);
  opacity: 0.75;
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
  iconSrc?: string;
  logoHtml?: string;
  modules?: SalesSheetBackModule[];
}): string {
  const name = (opts.company?.name || 'This platform').trim();
  const stack = salesSheetStackLogos(opts.stackLogos);
  const stackItems = stack.map(stackLogoHtml).join('');
  const fallbackMark = `<span class="doc-onepager-logo-name">${esc(name)}</span>`;
  const iconSrc = (opts.iconSrc || '').trim() || SALES_SHEET_ICON_PNG;
  const logoHtml = (opts.logoHtml || '').trim() || fallbackMark;
  const localItems = SALES_SHEET_LOCAL_CLIENTS.map((client) => `<li>${esc(client)}</li>`).join('');
  const moduleTiles = modulesHtml(opts.modules || []);

  return `
<style>${backPageCss(opts.orientation)}</style>
<div class="doc-onepager-stage ss-sheet-back">
  <article class="doc-onepager" data-orientation="${opts.orientation}" data-ss-page="back">
    <div class="ss-back-cols">
      <section class="ss-back-col ss-back-col--gate" data-ss-col="gate">
        ${moduleTiles}
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
          ${backCoverQaHtml(iconSrc)}
          <ul class="ss-stack" aria-label="Clients">${stackItems}</ul>
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
