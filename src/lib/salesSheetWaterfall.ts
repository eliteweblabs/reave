import { escapeHtml } from './htmlEscape';
import type { LighthouseNetworkRequest } from './lighthouseClient';

export type SalesSheetWaterfallRow = {
  name: string;
  type: string;
  startMs: number;
  endMs: number;
  transferSize: number;
};

const TYPE_COLOR: Record<string, string> = {
  Document: '#1a73e8',
  Stylesheet: '#a142f4',
  Script: '#e37400',
  Image: '#c5221f',
  Font: '#d01884',
  Media: '#188038',
  XHR: '#007b83',
  Fetch: '#007b83',
  Other: '#5f6368',
};

function typeColor(type: string): string {
  return TYPE_COLOR[type] || TYPE_COLOR.Other;
}

function requestName(url: string, host: string): string {
  try {
    const parsed = new URL(url, `https://${host}`);
    const path = decodeURIComponent(parsed.pathname || '/');
    const leaf = path.split('/').filter(Boolean).pop() || parsed.hostname.replace(/^www\./, '') || host;
    return leaf.length > 28 ? `${leaf.slice(0, 26)}…` : leaf;
  } catch {
    const leaf = url.split('?')[0].split('/').filter(Boolean).pop() || url;
    return leaf.length > 28 ? `${leaf.slice(0, 26)}…` : leaf;
  }
}

export function waterfallRowsFromRequests(
  requests: LighthouseNetworkRequest[],
  host: string,
  limit = 12,
): SalesSheetWaterfallRow[] {
  return requests.slice(0, limit).map((row) => ({
    name: requestName(row.url, host),
    type: row.resourceType || 'Other',
    startMs: row.startMs,
    endMs: row.endMs,
    transferSize: row.transferSize,
  }));
}

/** Representative slow-homepage waterfall when PSI has not run. */
export function dummySpeedWaterfall(host: string): SalesSheetWaterfallRow[] {
  const h = host || 'this.site';
  return waterfallRowsFromRequests(
    [
      { url: `https://${h}/`, startMs: 0, endMs: 860, transferSize: 42_000, resourceType: 'Document' },
      { url: `https://${h}/assets/app.css`, startMs: 160, endMs: 1_420, transferSize: 96_000, resourceType: 'Stylesheet' },
      { url: `https://${h}/assets/vendor.js`, startMs: 210, endMs: 3_280, transferSize: 380_000, resourceType: 'Script' },
      { url: `https://${h}/assets/app.js`, startMs: 420, endMs: 3_760, transferSize: 210_000, resourceType: 'Script' },
      { url: `https://${h}/fonts/display.woff2`, startMs: 640, endMs: 2_100, transferSize: 64_000, resourceType: 'Font' },
      { url: `https://${h}/img/hero.jpg`, startMs: 900, endMs: 5_420, transferSize: 920_000, resourceType: 'Image' },
      { url: `https://${h}/img/team.jpg`, startMs: 1_180, endMs: 4_160, transferSize: 410_000, resourceType: 'Image' },
      { url: `https://${h}/analytics.js`, startMs: 1_640, endMs: 3_020, transferSize: 48_000, resourceType: 'Script' },
      { url: `https://${h}/api/config`, startMs: 2_080, endMs: 4_640, transferSize: 8_400, resourceType: 'Fetch' },
      { url: `https://${h}/img/bg.jpg`, startMs: 2_400, endMs: 5_880, transferSize: 1_120_000, resourceType: 'Image' },
    ],
    h,
  );
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function renderSpeedWaterfallHtml(
  rows: SalesSheetWaterfallRow[],
  host: string,
  lcp?: string,
): string {
  const list = rows.length ? rows : dummySpeedWaterfall(host);
  const maxEnd = Math.max(1, ...list.map((row) => row.endMs));
  const ticks = [0, maxEnd / 2, maxEnd];
  const bars = list
    .map((row) => {
      const left = (row.startMs / maxEnd) * 100;
      const width = Math.max(2.4, ((row.endMs - row.startMs) / maxEnd) * 100);
      return `<div class="ss-wf-row">
  <span class="ss-wf-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
  <span class="ss-wf-track"><span class="ss-wf-bar" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${typeColor(row.type)}"></span></span>
</div>`;
    })
    .join('');
  return `<div class="ss-phone-body ss-wf">
      <header class="ss-wf-head">
        <strong>Network</strong>
        <span>Google™ PageSpeed</span>
      </header>
      <p class="ss-wf-meta">${escapeHtml(host)} · ${list.length} req · ${formatMs(maxEnd)}${lcp ? ` · LCP ${escapeHtml(lcp)}` : ''}</p>
      <div class="ss-wf-scale" aria-hidden="true">${ticks
        .map((t) => `<span>${formatMs(t)}</span>`)
        .join('')}</div>
      <div class="ss-wf-rows">${bars}</div>
    </div>`;
}
