/**
 * Phone mock-up for a Google Places miss — HTML only, no network.
 * Used by the sales-sheet preview and by Playwright screenshot.
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

export function renderPlacesPhoneMockHtml(view: SalesSheetPlacesView): string {
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
  --ss-phone-bg: #0b0b0d;
  --ss-phone-screen: #f4f4f0;
  box-sizing: border-box;
  width: min(100%, 220px);
  margin: 0 auto 0.7em;
  padding: 10px 9px 12px;
  background: var(--ss-phone-bg);
  border-radius: 28px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.18);
  color: #141414;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.ss-phone-notch {
  width: 38%;
  height: 8px;
  margin: 0 auto 8px;
  background: #1c1c1f;
  border-radius: 999px;
}
.ss-phone-screen {
  background: var(--ss-phone-screen);
  border-radius: 18px;
  overflow: hidden;
  min-height: 210px;
}
.ss-phone-search {
  margin: 10px 8px 0;
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
.ss-phone-home {
  width: 28%;
  height: 4px;
  margin: 8px auto 0;
  background: #2a2a2e;
  border-radius: 999px;
}
.doc-onepager-col:has(.ss-phone) { overflow: visible; }
</style>
<figure class="ss-phone" data-places-source="${escapeHtml(view.source)}">
  <div class="ss-phone-notch"></div>
  <div class="ss-phone-screen">
    <p class="ss-phone-search">${query}${near ? ` <span>· ${near}</span>` : ''}</p>
    ${banner}
    <p class="ss-phone-near">Nearby results</p>
    <ol class="ss-phone-list">${rows}</ol>
  </div>
  <div class="ss-phone-home"></div>
</figure>`.trim();
}

export function placesPhoneScreenshotDocument(view: SalesSheetPlacesView): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #e4e4de; }
    body { padding: 24px; display: flex; justify-content: center; }
  </style>
</head>
<body>${renderPlacesPhoneMockHtml(view)}</body>
</html>`;
}

export function injectPhoneIntoFirstColumn(sheetHtml: string, phoneHtml: string): string {
  const mark = '<div class="doc-onepager-col">';
  const at = sheetHtml.indexOf(mark);
  if (at < 0) return sheetHtml;
  return `${sheetHtml.slice(0, at + mark.length)}${phoneHtml}${sheetHtml.slice(at + mark.length)}`;
}

export function placesPhoneShotImg(base64Png: string): string {
  return `<img class="ss-phone-shot" src="data:image/png;base64,${base64Png}" alt="Mobile Google listing mock-up" style="display:block;width:min(100%,220px);margin:0 auto 0.7em;border-radius:28px;" />`;
}
