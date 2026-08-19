/**
 * Phone mock-up for a Google Places miss.
 * Prefers a real google.com Places screenshot in the screen hole; HTML list is the fallback.
 * Chrome is the media-library iPhone 17 frame overlaid on top.
 */
import { escapeHtml } from './htmlEscape';

export type PlacesMissFinding = {
  id: string;
  categoryLabel: string;
  problem: string;
  solution: string;
};

export type SalesSheetCompetitor = {
  name: string;
  rating?: number;
  reviewCount?: number;
  address: string;
};

export type SalesSheetPlacesView = {
  query: string;
  near: string;
  listed: boolean;
  matchName?: string;
  competitors: SalesSheetCompetitor[];
  source: 'places' | 'dummy';
  error?: string;
};

export const DUMMY_PLACES_COMPETITORS: SalesSheetCompetitor[] = [
  { name: 'Harbor Street Partners', rating: 4.8, reviewCount: 126, address: '18 Atlantic Ave' },
  { name: 'North Pier Advisors', rating: 4.6, reviewCount: 89, address: '440 Commercial St' },
  { name: 'Seaport Counsel', rating: 4.5, reviewCount: 74, address: '25 Northern Ave' },
];

export const PLACES_NOT_LISTED_FINDING_ID = 'places-not-listed';

export function placesNotListedFinding(businessName: string): PlacesMissFinding {
  const name = businessName.trim() || 'This business';
  return {
    id: PLACES_NOT_LISTED_FINDING_ID,
    categoryLabel: 'Maps & Directories',
    problem: `${name} is not listed on Google — nearby searches show competitors instead.`,
    solution: 'Claim Google Business Profile so map results point to you, not the shop down the street.',
  };
}

export function isPlacesMissFinding(
  finding: Pick<PlacesMissFinding, 'id' | 'categoryLabel' | 'problem'>,
): boolean {
  if (finding.id === PLACES_NOT_LISTED_FINDING_ID || finding.id === 'dummy-listings') return true;
  const blob = `${finding.categoryLabel} ${finding.problem}`.toLowerCase();
  return (
    /maps & directories|local listings|google business|google places/.test(blob) &&
    /not listed|missing from google|cannot find you|no exact address/.test(blob)
  );
}

/** Pin a Google Places miss as finding #1 and drop the weaker listings row. */
export function promotePlacesNotListedFinding(
  findings: PlacesMissFinding[],
  businessName: string,
): PlacesMissFinding[] {
  const pinned = placesNotListedFinding(businessName);
  const rest = findings.filter((f) => !isPlacesMissFinding(f));
  return [pinned, ...rest].slice(0, 3);
}

function stars(rating: number | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return '';
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`;
}

function reviewsLabel(count: number | undefined): string {
  if (count == null || !Number.isFinite(count)) return '';
  return `(${count.toLocaleString('en-US')})`;
}

/** Media-library slug for the iPhone 17 sales-sheet wrapper (736×1428, padded). */
export const IPHONE_FRAME_SLUG = 'iphone17-frame';
/** Repo copy of the iPhone 17 wrapper (island intact; screen content is inset below it). */
export const IPHONE_FRAME_SRC = `/admin/${IPHONE_FRAME_SLUG}.png`;

export type PlacesPhoneMockOpts = {
  /** Public or data URL for the device chrome. Defaults to the media-library slug. */
  frameSrc?: string;
  /** Real google.com Places SERP (data URL or http). Replaces the HTML result list. */
  screenSrc?: string;
};

/** City, ST from a full street address so the Google query matches a nearby search. */
export function shortPlaceFromAddress(address: string): string {
  const parts = address
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[parts.length - 2];
    const state = parts[parts.length - 1].replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    return state ? `${city}, ${state}` : city;
  }
  if (parts.length === 2) {
    const state = parts[1].replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    return state ? `${parts[0]}, ${state}` : parts.join(', ');
  }
  return address.trim();
}

export function googlePlacesSearchQuery(query: string, near?: string): string {
  const name = query.trim();
  const loc = (near || '').trim();
  if (!name) return loc;
  if (!loc) return name;
  if (name.toLowerCase().includes(loc.toLowerCase())) return name;
  return `${name} ${loc}`;
}

/** google.com Places tab (`udm=1`) — what customers see instead of a GBP. */
export function googlePlacesSearchUrl(query: string, near?: string): string {
  const u = new URL('https://www.google.com/search');
  u.searchParams.set('q', googlePlacesSearchQuery(query, near));
  u.searchParams.set('udm', '1');
  u.searchParams.set('hl', 'en');
  u.searchParams.set('gl', 'us');
  return u.toString();
}

/** google.com/maps search — headless Chromium can load this when Search serves a captcha. */
export function googleMapsSearchUrl(query: string, near?: string): string {
  const q = googlePlacesSearchQuery(query, near);
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

/** Inline the frame PNG so print/PDF and Playwright do not depend on a second fetch. */
export async function resolveIphoneFrameSrc(): Promise<string> {
  try {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const buf = await readFile(join(process.cwd(), 'public/admin/iphone17-frame.png'));
    if (buf.length) return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    /* fall through to media library / public URL */
  }
  try {
    const { storeGetMediaByRef } = await import('./mediaLibrary');
    const rec = await storeGetMediaByRef(IPHONE_FRAME_SLUG);
    if (rec?.dataBase64) return `data:${rec.mediaType};base64,${rec.dataBase64}`;
  } catch {
    /* public path still works on the live site */
  }
  return IPHONE_FRAME_SRC;
}

export function renderPlacesPhoneMockHtml(
  view: SalesSheetPlacesView,
  opts?: PlacesPhoneMockOpts,
): string {
  const frameSrc = escapeHtml((opts?.frameSrc || IPHONE_FRAME_SRC).trim() || IPHONE_FRAME_SRC);
  const screenSrc = (opts?.screenSrc || '').trim();
  const query = escapeHtml(view.query || 'Search');
  const near = view.near.trim() ? escapeHtml(view.near.trim()) : '';
  const competitors = (view.competitors.length ? view.competitors : DUMMY_PLACES_COMPETITORS).slice(0, 3);

  const rows = competitors
    .map((c) => {
      const rating =
        c.rating != null
          ? `<span class="ss-phone-stars">${escapeHtml(stars(c.rating))} ${escapeHtml(String(c.rating.toFixed(1)))} ${escapeHtml(reviewsLabel(c.reviewCount))}</span>`
          : '';
      return `<li class="ss-phone-row">
        <p class="ss-phone-row-name">${escapeHtml(c.name)}</p>
        ${rating}
        <p class="ss-phone-row-addr">${escapeHtml(c.address)}</p>
      </li>`;
    })
    .join('');

  const miss = !view.listed;
  const banner = miss
    ? `<div class="ss-phone-miss">
        <p class="ss-phone-miss-kicker">No Google listing</p>
        <p class="ss-phone-miss-title">${query}</p>
        <p class="ss-phone-miss-copy">Customers searching nearby do not see this business. These results come up instead.</p>
      </div>`
    : `<div class="ss-phone-hit">
        <p class="ss-phone-miss-kicker">Listed</p>
        <p class="ss-phone-miss-title">${escapeHtml(view.matchName || view.query)}</p>
        <p class="ss-phone-miss-copy">A Google Places match exists. Nearby competitors still appear in the same search.</p>
      </div>`;

  return `
<style>
.ss-phone {
  --ss-phone-screen: #f4f4f0;
  position: relative;
  box-sizing: border-box;
  width: min(100%, 210px);
  aspect-ratio: 736 / 1428;
  margin: 0 auto 0.65em;
  background: transparent;
  color: #141414;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ss-phone-screen {
  position: absolute;
  /* iphone17-frame hole is ~8.6% / 3.4% / 8.7% / 3.9%. Sit slightly under the bezel;
     the PNG’s white pad is slack if the box is a few pixels off. */
  top: 3.15%;
  right: 8.15%;
  bottom: 3.55%;
  left: 8.15%;
  z-index: 1;
  overflow: hidden;
  /* Reserve the Dynamic Island band so search chrome is not under the cutout. */
  padding-top: 7.5%;
  background: var(--ss-phone-screen);
  border-radius: 12% / 6%;
}
.ss-phone-screen:has(.ss-phone-serp) {
  background: #000;
}
.ss-phone-serp {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}
.ss-phone-frame {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
}
.ss-phone-search {
  margin: 0 8px;
  padding: 7px 10px;
  background: #fff;
  border-radius: 999px;
  border: 1px solid #e2e2dc;
  font-size: 9px;
  font-weight: 600;
  color: #222;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ss-phone-search span { color: #8a8a84; font-weight: 500; }
.ss-phone-miss, .ss-phone-hit { padding: 10px 10px 8px; }
.ss-phone-miss { background: #fff3f0; }
.ss-phone-hit { background: #eef7ef; }
.ss-phone-miss-kicker {
  margin: 0 0 2px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${miss ? '#b42318' : '#087443'};
}
.ss-phone-miss-title { margin: 0 0 4px; font-size: 12px; font-weight: 800; line-height: 1.2; }
.ss-phone-miss-copy { margin: 0; font-size: 8.5px; line-height: 1.35; color: #4a4a46; }
.ss-phone-near {
  margin: 0;
  padding: 6px 10px 2px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6b6b6b;
}
.ss-phone-list { list-style: none; margin: 0; padding: 0 0 8px; }
.ss-phone-row {
  margin: 0 8px;
  padding: 7px 2px 8px;
  border-top: 1px solid #e6e6e0;
}
.ss-phone-row-name { margin: 0 0 2px; font-size: 10px; font-weight: 700; }
.ss-phone-stars { display: block; font-size: 8px; color: #c47f00; letter-spacing: 0.02em; }
.ss-phone-row-addr { margin: 2px 0 0; font-size: 8px; color: #6b6b6b; }
.doc-onepager-col:has(.ss-phone) { overflow: visible; }
</style>
<figure class="ss-phone" data-places-source="${escapeHtml(view.source)}"${screenSrc ? ' data-places-serp="google"' : ''}>
  <div class="ss-phone-screen">
    ${
      screenSrc
        ? `<img class="ss-phone-serp" src="${escapeHtml(screenSrc)}" alt="Google Places results for ${query}" />`
        : `<p class="ss-phone-search">${query}${near ? ` <span>· ${near}</span>` : ''}</p>
    ${banner}
    <p class="ss-phone-near">Nearby results</p>
    <ol class="ss-phone-list">${rows}</ol>`
    }
  </div>
  <img class="ss-phone-frame" src="${frameSrc}" alt="" width="736" height="1428" />
</figure>`.trim();
}

export function placesPhoneScreenshotDocument(
  view: SalesSheetPlacesView,
  opts?: PlacesPhoneMockOpts,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #fff; }
    body { padding: 24px; display: flex; justify-content: center; }
  </style>
</head>
<body>${renderPlacesPhoneMockHtml(view, opts)}</body>
</html>`;
}

export function injectPhoneIntoFirstColumn(sheetHtml: string, phoneHtml: string): string {
  const mark = '<div class="doc-onepager-col">';
  const at = sheetHtml.indexOf(mark);
  if (at < 0) return sheetHtml;
  return `${sheetHtml.slice(0, at + mark.length)}${phoneHtml}${sheetHtml.slice(at + mark.length)}`;
}

export function placesPhoneShotImg(base64Png: string): string {
  return `<img class="ss-phone-shot" src="data:image/png;base64,${base64Png}" alt="Mobile Google listing mock-up" style="display:block;width:min(100%,210px);margin:0 auto 0.65em;" />`;
}

export function renderSalesSheetQrHtml(dataUrl: string, href: string): string {
  const src = dataUrl.trim();
  const link = href.trim();
  if (!src || !link) return '';
  return `
<style>
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');
.doc-onepager {
  position: relative;
  --ss-print-inset: 0.25in;
  padding: var(--ss-print-inset);
}
.doc-onepager-title,
.doc-onepager-kicker { display: none; }
.doc-onepager-mast {
  flex: 0 0 0;
  width: 0;
  min-width: 0;
  overflow: visible;
}
.ss-qr {
  position: absolute;
  top: var(--ss-print-inset);
  right: var(--ss-print-inset);
  z-index: 3;
  margin: 0;
  line-height: 0;
}
.ss-qr img {
  display: block;
  width: clamp(56px, 8.5cqi, 76px);
  height: auto;
  background: #fff;
}
.ss-qr-note {
  position: absolute;
  top: calc(100% - 2px);
  right: -2px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  color: #1a3d6e;
  pointer-events: none;
  transform: rotate(-7deg);
  transform-origin: 90% 0;
  line-height: 1;
}
.ss-qr-note svg {
  display: block;
  width: 46px;
  height: 30px;
  margin-right: 22px;
  margin-bottom: -6px;
}
.ss-qr-note span {
  font-family: Caveat, 'Segoe Script', 'Bradley Hand', cursive;
  font-size: clamp(14px, 2.15cqi, 18px);
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-shadow: 0 0 3px #fff, 0 0 6px #fff;
}
</style>
<figure class="ss-qr">
  <a href="${escapeHtml(link)}" target="_blank" rel="noopener">
    <img src="${escapeHtml(src)}" alt="the full audit" width="72" height="72" />
  </a>
  <div class="ss-qr-note" aria-hidden="true">
    <svg viewBox="0 0 48 32" fill="none" aria-hidden="true">
      <path d="M10 3.2c1.2 9.4 10.4 18.6 30.2 22.4" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/>
      <path d="M32.6 18.4 42.2 26.1 29.4 27.6z" fill="currentColor"/>
    </svg>
    <span>the full audit</span>
  </div>
</figure>`.trim();
}

export function injectAuditQrIntoHeader(sheetHtml: string, qrHtml: string): string {
  if (!qrHtml.trim()) return sheetHtml;
  const mark = '<div class="doc-onepager-mast">';
  const at = sheetHtml.indexOf(mark);
  if (at < 0) return sheetHtml;
  return `${sheetHtml.slice(0, at + mark.length)}${qrHtml}${sheetHtml.slice(at + mark.length)}`;
}
