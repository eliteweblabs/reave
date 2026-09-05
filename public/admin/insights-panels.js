/**
 * insights panels — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  syncSearchFieldAdornment,
  createSlidingPillSelect,
  createPanelBackBtn,
  createEditableHeaderTitleInput,
  createPaneSubheader,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  initSidebarLayout,
  syncAdminSplitView,
  scanPanelSidebars,
  isAdminPaneMobile,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  paneDeleteIcon,
  paneShareIcon,
} from './admin-ui.js?v=20260825h';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, mountPanelSkeleton } from './shared.js?v=20260810a';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260826a';
import { createFleetMap } from '/admin/fleet-map.js';
import { initSocialPanel, loadSocialTab } from './social-panel.js?v=20260827a';

/** Injected by os-map-loader via initInsightsPanels(). */
let shell = {};

function hasInstallFeature(id) {
  const features = window.__installConfig?.features;
  return Array.isArray(features) && features.includes(id);
}

function currentMap() {
  return typeof shell.getMap === 'function' ? shell.getMap() : shell.MAP;
}

export function initInsightsPanels(deps) {
  shell = deps;
  initSocialPanel(deps);
}

// Social inbox lives in social-panel.js (email-style list + reply pane).

const ANALYTICS_RANGE_LABEL = { 7: 'last 7 days', 30: 'last 30 days', 90: 'last 90 days' };
const ANALYTICS_SITE_KEY = 'reave-analytics-site-id';
let analyticsRangeDays = 30;
let analyticsSource = 'plausible';
let analyticsSiteId = '';
let analyticsStatus = null;
let analyticsAccounts = [];
let analyticsSyncing = false;
let analyticsReadinessGen = 0;
let analyticsLoadGen = 0;
let analyticsSearch = '';
let analyticsMeta = null;
let analyticsDetail = null;

function parseAnalyticsSiteFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('site')?.trim() || '';
  } catch {
    return '';
  }
}

function syncAnalyticsSiteUrl(siteId) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'analytics');
    if (siteId) url.searchParams.set('site', siteId);
    else url.searchParams.delete('site');
    const next = url.pathname + url.search + url.hash;
    const current = location.pathname + location.search + location.hash;
    if (next !== current) history.replaceState({}, '', next);
  } catch {
    /* ignore */
  }
}

export function openAnalyticsSite(siteId) {
  analyticsSiteId = String(siteId || '').trim();
  if (analyticsSiteId) {
    try {
      sessionStorage.setItem(ANALYTICS_SITE_KEY, analyticsSiteId);
    } catch {
      /* ignore */
    }
    if (isAdminPaneMobile()) analyticsRoot()?.classList.add('ana-pane-active');
  } else {
    try {
      sessionStorage.removeItem(ANALYTICS_SITE_KEY);
    } catch {
      /* ignore */
    }
  }
  syncAnalyticsSiteUrl(analyticsSiteId);
  void loadAnalyticsTab({ preserveSidebar: true, siteId: analyticsSiteId });
}

function analyticsWiredFromAccount(siteId) {
  const row = analyticsAccounts.find((r) => r.siteId === siteId);
  if (!row) return null;
  return {
    registered: Boolean(row.registered),
    scriptInstalled: row.scriptInstalled ?? null,
  };
}

function analyticsDetailLoadingHtml(siteId) {
  const rangeLabel = ANALYTICS_RANGE_LABEL[analyticsRangeDays] || `last ${analyticsRangeDays} days`;
  const wired = analyticsWiredFromAccount(siteId);
  const header =
    `<div class="soc-header ana-pane-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">${escHtml(siteId || 'Site')}</h1>` +
        `<p class="soc-sub">${escHtml(analyticsSource)} · ${escHtml(rangeLabel)} · <span class="ana-loading-label">Loading…</span></p>` +
      `</div>` +
      `<div class="ana-header-actions">` +
        analyticsPaneActionsHtml(analyticsStatus, {
          showBack: true,
          wired,
          showSource: true,
          availableSources: ['plausible', 'ga4'],
        }) +
      `</div>` +
    `</div>`;
  const skeleton =
    `<div class="sk-analytics-detail" role="status" aria-live="polite" aria-busy="true">` +
      `<span class="sk-sr">Loading site analytics…</span>` +
      `<div class="dash-stats soc-totals sk-analytics-stats">` +
        `<div class="sk-bone sk-analytics-stat"></div>`.repeat(4) +
      `</div>` +
      `<section class="ana-section ana-section--wide">` +
        `<div class="sk-bone sk-analytics-section-title"></div>` +
        `<div class="sk-bone sk-analytics-chart"></div>` +
      `</section>` +
      `<div class="ana-grid sk-analytics-grid">` +
        `<div class="sk-bone sk-analytics-panel"></div>`.repeat(4) +
      `</div>` +
    `</div>`;
  return header + skeleton;
}

function showAnalyticsDetailLoading(siteId) {
  const root = analyticsRoot();
  if (!root) return;
  analyticsDetail = null;
  syncAnalyticsSidebarActive();

  let pane = root.querySelector('.ch-pane');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'ch-pane';
    root.appendChild(pane);
  }

  pane.innerHTML =
    `<div class="social-scroll ana-pane-scroll">${analyticsDetailLoadingHtml(siteId)}</div>`;
  if (isAdminPaneMobile()) root.classList.add('ana-pane-active');
  bindAnalyticsControls(root);
  syncAdminSplitView('analytics');
}

function analyticsWiredBadge(wired) {
  if (!wired) return '';
  if (wired.registered && wired.scriptInstalled) {
    return `<span class="ana-wired ana-wired--on">Wired</span>`;
  }
  if (wired.registered && wired.scriptInstalled === false) {
    return `<span class="ana-wired ana-wired--partial">Registered · script missing</span>`;
  }
  if (wired.registered) {
    return `<span class="ana-wired ana-wired--partial">Registered</span>`;
  }
  return `<span class="ana-wired ana-wired--off">Not wired</span>`;
}

function analyticsSitePicker(sites, current) {
  if (!Array.isArray(sites) || !sites.length) return '';
  return (
    `<label class="ana-site-picker">` +
      `<span class="soc-sub">Site</span>` +
      `<select data-analytics-site>` +
        sites
          .map((s) => {
            const id = String(s.siteId || '');
            const label =
              (s.kind === 'railway' || s.kind === 'kinsta') && s.sourceLabel && s.sourceLabel !== id
                ? `${id} (${s.sourceLabel})`
                : s.label || id;
            return `<option value="${escHtml(id)}"${id === current ? ' selected' : ''}>${escHtml(label)}</option>`;
          })
          .join('') +
      `</select>` +
    `</label>`
  );
}

function analyticsNumFmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 100) / 10}k`.replace(/\.0k$/, 'k');
  return String(Math.round(v * 10) / 10);
}

function analyticsDurationFmt(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function analyticsPctFmt(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '0%';
  return `${Math.round(v * 10) / 10}%`;
}

function analyticsDeltaHtml(change) {
  const c = Number(change);
  if (!Number.isFinite(c) || c === 0) {
    return `<span class="soc-delta soc-delta--flat"><span class="soc-delta-val">—</span></span>`;
  }
  const up = c > 0;
  const sign = up ? '+' : '−';
  return (
    `<span class="soc-delta soc-delta--${up ? 'up' : 'down'}">` +
      `<span class="soc-delta-val">${sign}${Math.abs(Math.round(c))}%</span>` +
    `</span>`
  );
}

function analyticsSparkline(series, color) {
  const points = Array.isArray(series) ? series : [];
  if (points.length < 2) return '';
  const values = points.map((p) => Number(p.visitors) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 280;
  const h = 44;
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    `<svg class="soc-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">` +
      `<polyline fill="none" stroke="${escHtml(color)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${coords.join(' ')}"></polyline>` +
    `</svg>`
  );
}

const analyticsCountryNames =
  typeof Intl !== 'undefined' && Intl.DisplayNames
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function analyticsCountryLabel(code) {
  const raw = String(code || '').trim();
  if (!raw || raw === '(not set)') return raw || '(not set)';
  try {
    return analyticsCountryNames?.of(raw) || raw;
  } catch {
    return raw;
  }
}

function analyticsShortDate(iso) {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const parts = raw.split('-');
  if (parts.length >= 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return raw;
}

function analyticsLongDate(iso) {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function analyticsEscAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function analyticsTimeseriesChart(series) {
  const points = Array.isArray(series) ? series : [];
  if (points.length < 2) {
    return `<p class="dash-empty">Not enough data for this period.</p>`;
  }
  const visitors = points.map((p) => Number(p.visitors) || 0);
  const pageviews = points.map((p) => Number(p.pageviews) || 0);
  const max = Math.max(...visitors, ...pageviews, 1);
  const w = 640;
  const h = 132;
  const pad = { top: 10, right: 12, bottom: 26, left: 34 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const toY = (v) => pad.top + chartH - (v / max) * chartH;
  const toX = (i) => pad.left + (i / (points.length - 1)) * chartW;
  const visitorCoords = visitors.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const pageviewCoords = pageviews.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const areaPath =
    `M ${toX(0).toFixed(1)},${(pad.top + chartH).toFixed(1)} ` +
    visitorCoords.map((c) => `L ${c}`).join(' ') +
    ` L ${toX(points.length - 1).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`;
  const yMid = Math.round(max / 2);
  const yTicks = [0, yMid, max]
    .map(
      (v) =>
        `<text class="ana-chart-tick ana-chart-tick--y" x="${pad.left - 6}" y="${toY(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${escHtml(analyticsNumFmt(v))}</text>`,
    )
    .join('');
  const xStart = analyticsShortDate(points[0]?.date);
  const xEnd = analyticsShortDate(points[points.length - 1]?.date);
  const seriesJson = analyticsEscAttr(JSON.stringify(points));
  return (
    `<div class="ana-chart-wrap" data-ana-chart data-ana-series="${seriesJson}">` +
      `<div class="ana-chart-stage">` +
        `<svg class="ana-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Visitors and pageviews over time">` +
          `<line class="ana-chart-grid" x1="${pad.left}" y1="${pad.top + chartH}" x2="${pad.left + chartW}" y2="${pad.top + chartH}"></line>` +
          yTicks +
          `<path class="ana-chart-area" d="${areaPath}"></path>` +
          `<polyline class="ana-chart-line ana-chart-line--pageviews" fill="none" points="${pageviewCoords.join(' ')}"></polyline>` +
          `<polyline class="ana-chart-line ana-chart-line--visitors" fill="none" points="${visitorCoords.join(' ')}"></polyline>` +
          `<line class="ana-chart-crosshair" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + chartH}" visibility="hidden"></line>` +
          `<circle class="ana-chart-dot ana-chart-dot--visitors" r="3.5" visibility="hidden"></circle>` +
          `<circle class="ana-chart-dot ana-chart-dot--pageviews" r="3.5" visibility="hidden"></circle>` +
          `<rect class="ana-chart-hit" x="${pad.left}" y="${pad.top}" width="${chartW}" height="${chartH}"></rect>` +
          `<text class="ana-chart-tick ana-chart-tick--x" x="${pad.left}" y="${h - 6}">${escHtml(xStart)}</text>` +
          `<text class="ana-chart-tick ana-chart-tick--x" x="${pad.left + chartW}" y="${h - 6}" text-anchor="end">${escHtml(xEnd)}</text>` +
        `</svg>` +
        `<div class="ana-chart-tooltip" hidden role="tooltip">` +
          `<div class="ana-chart-tooltip-date" data-ana-tip-date></div>` +
          `<div class="ana-chart-tooltip-row">` +
            `<span class="ana-chart-tooltip-label"><span class="ana-legend-swatch ana-legend-swatch--visitors"></span>Visitors</span>` +
            `<span class="ana-chart-tooltip-val" data-ana-tip-visitors></span>` +
          `</div>` +
          `<div class="ana-chart-tooltip-row">` +
            `<span class="ana-chart-tooltip-label"><span class="ana-legend-swatch ana-legend-swatch--pageviews"></span>Pageviews</span>` +
            `<span class="ana-chart-tooltip-val" data-ana-tip-pageviews></span>` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<div class="ana-chart-legend">` +
        `<span class="ana-legend-item"><span class="ana-legend-swatch ana-legend-swatch--visitors"></span>Visitors</span>` +
        `<span class="ana-legend-item"><span class="ana-legend-swatch ana-legend-swatch--pageviews"></span>Pageviews</span>` +
      `</div>` +
    `</div>`
  );
}

function bindAnalyticsChartHover(root) {
  root.querySelectorAll('[data-ana-chart]').forEach((wrap) => {
    if (wrap.dataset.anaChartBound) return;
    wrap.dataset.anaChartBound = '1';

    let series;
    try {
      series = JSON.parse(wrap.getAttribute('data-ana-series') || '[]');
    } catch {
      return;
    }
    if (series.length < 2) return;

    const stage = wrap.querySelector('.ana-chart-stage');
    const svg = wrap.querySelector('.ana-chart');
    const tooltip = wrap.querySelector('.ana-chart-tooltip');
    const crosshair = wrap.querySelector('.ana-chart-crosshair');
    const dotVisitors = wrap.querySelector('.ana-chart-dot--visitors');
    const dotPageviews = wrap.querySelector('.ana-chart-dot--pageviews');
    const tipDate = wrap.querySelector('[data-ana-tip-date]');
    const tipVisitors = wrap.querySelector('[data-ana-tip-visitors]');
    const tipPageviews = wrap.querySelector('[data-ana-tip-pageviews]');
    if (!stage || !svg || !tooltip || !crosshair || !dotVisitors || !dotPageviews || !tipDate || !tipVisitors || !tipPageviews) {
      return;
    }

    const pad = { top: 10, right: 12, bottom: 26, left: 34 };
    const w = 640;
    const h = 132;
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const visitors = series.map((p) => Number(p.visitors) || 0);
    const pageviews = series.map((p) => Number(p.pageviews) || 0);
    const max = Math.max(...visitors, ...pageviews, 1);
    const toY = (v) => pad.top + chartH - (v / max) * chartH;
    const toX = (i) => pad.left + (i / (series.length - 1)) * chartW;

    const hide = () => {
      wrap.classList.remove('ana-chart-wrap--active');
      tooltip.hidden = true;
      crosshair.setAttribute('visibility', 'hidden');
      dotVisitors.setAttribute('visibility', 'hidden');
      dotPageviews.setAttribute('visibility', 'hidden');
    };

    const positionTooltip = (x) => {
      const stageRect = stage.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const xPx = ((x / w) * svgRect.width) + svgRect.left - stageRect.left;
      const tipW = tooltip.offsetWidth || 0;
      const left = Math.max(8, Math.min(stageRect.width - tipW - 8, xPx - tipW / 2));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = '6px';
    };

    const show = (index) => {
      const i = Math.max(0, Math.min(series.length - 1, index));
      const point = series[i] || {};
      const x = toX(i);
      wrap.classList.add('ana-chart-wrap--active');
      crosshair.setAttribute('x1', x.toFixed(1));
      crosshair.setAttribute('x2', x.toFixed(1));
      crosshair.setAttribute('y1', pad.top);
      crosshair.setAttribute('y2', pad.top + chartH);
      crosshair.setAttribute('visibility', 'visible');
      dotVisitors.setAttribute('cx', x.toFixed(1));
      dotVisitors.setAttribute('cy', toY(visitors[i]).toFixed(1));
      dotVisitors.setAttribute('visibility', 'visible');
      dotPageviews.setAttribute('cx', x.toFixed(1));
      dotPageviews.setAttribute('cy', toY(pageviews[i]).toFixed(1));
      dotPageviews.setAttribute('visibility', 'visible');
      tipDate.textContent = analyticsLongDate(point.date);
      tipVisitors.textContent = analyticsNumFmt(visitors[i]);
      tipPageviews.textContent = analyticsNumFmt(pageviews[i]);
      tooltip.hidden = false;
      positionTooltip(x);
    };

    const indexFromClientX = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * w;
      const chartX = relX - pad.left;
      if (chartX < 0 || chartX > chartW) return -1;
      const ratio = chartX / chartW;
      return Math.round(ratio * (series.length - 1));
    };

    const onMove = (ev) => {
      const index = indexFromClientX(ev.clientX);
      if (index < 0) {
        hide();
        return;
      }
      show(index);
    };

    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', hide);
    wrap.addEventListener('touchstart', (ev) => {
      const touch = ev.touches[0];
      if (!touch) return;
      const index = indexFromClientX(touch.clientX);
      if (index >= 0) show(index);
    }, { passive: true });
    wrap.addEventListener('touchmove', (ev) => {
      const touch = ev.touches[0];
      if (!touch) return;
      const index = indexFromClientX(touch.clientX);
      if (index < 0) hide();
      else show(index);
    }, { passive: true });
    wrap.addEventListener('touchend', hide);
    wrap.addEventListener('touchcancel', hide);
  });
}

function analyticsBarChart(rows, opts = {}) {
  const data = (Array.isArray(rows) ? rows : []).slice(0, opts.limit || 8);
  if (!data.length) return '';
  const max = Math.max(...data.map((row) => Number(row.visitors) || 0), 1);
  const formatLabel = typeof opts.formatLabel === 'function' ? opts.formatLabel : (v) => v;
  return (
    `<div class="ana-bar-chart">` +
      data
        .map((row) => {
          const visitors = Number(row.visitors) || 0;
          const pct = Math.max((visitors / max) * 100, visitors > 0 ? 4 : 0);
          const label = formatLabel(row.label);
          const pageviews = Number(row.pageviews) || 0;
          const hint =
            pageviews > 0
              ? `${analyticsNumFmt(visitors)} visitors · ${analyticsNumFmt(pageviews)} views`
              : `${analyticsNumFmt(visitors)} visitors`;
          return (
            `<div class="ana-bar-row" title="${escHtml(hint)}">` +
              `<span class="ana-bar-label">${escHtml(label)}</span>` +
              `<div class="ana-bar-track"><div class="ana-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>` +
              `<span class="ana-bar-val">${escHtml(analyticsNumFmt(visitors))}</span>` +
            `</div>`
          );
        })
        .join('') +
    `</div>`
  );
}

function analyticsBreakdownPanel(title, rows, opts = {}) {
  if (!Array.isArray(rows) || !rows.length) return '';
  return (
    `<section class="ana-section ana-section--chart">` +
      `<h2 class="soc-section-title">${escHtml(title)}</h2>` +
      analyticsBarChart(rows, opts) +
    `</section>`
  );
}

function analyticsRangeTabs() {
  return (
    `<div class="soc-range" role="tablist" aria-label="Reporting window">` +
      [7, 30, 90]
        .map(
          (d) =>
            `<button type="button" class="soc-range-btn${d === analyticsRangeDays ? ' active' : ''}" data-analytics-range="${d}">${d}d</button>`,
        )
        .join('') +
    `</div>`
  );
}

function analyticsSourceTabs(available) {
  const sources = Array.isArray(available) && available.length
    ? available
    : ['plausible', 'ga4'];
  return (
    `<div class="soc-range" role="tablist" aria-label="Sites source">` +
      sources
        .map(
          (s) =>
            `<button type="button" class="soc-range-btn${s === analyticsSource ? ' active' : ''}" data-analytics-source="${escHtml(s)}">${s === 'ga4' ? 'GA4' : 'Plausible'}</button>`,
        )
        .join('') +
    `</div>`
  );
}

function analyticsGoogleConnectHtml(status) {
  if (!status) return '';
  if (status.google?.connected) {
    const label = status.google.accountLabel || 'Google connected';
    return (
      `<div class="ana-google-row">` +
        `<span class="soc-sub">${escHtml(label)}</span>` +
        `<button type="button" class="prof-btn-secondary" data-analytics-disconnect>Disconnect</button>` +
      `</div>`
    );
  }
  if (!status.googleOAuthConfigured) {
    return `<p class="soc-empty-hint">Set <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> to connect Search Console &amp; GA4.</p>`;
  }
  return `<a class="prof-btn-secondary" href="${escHtml(status.connectUrl || '/api/admin/analytic-audit/connect')}">Connect Google</a>`;
}

function analyticsMetricCard(value, label, hint, change) {
  return (
    `<div class="dash-stat dash-stat--muted">` +
      `<span class="dash-stat-value">${escHtml(String(value))}</span>` +
      `<span class="dash-stat-label">${escHtml(label)}</span>` +
      (hint ? `<span class="dash-stat-hint">${escHtml(hint)}</span>` : '') +
      (change != null ? `<span class="ana-metric-delta">${analyticsDeltaHtml(change)}</span>` : '') +
    `</div>`
  );
}

function analyticsBreakdownTable(title, rows, labelCol = 'Source') {
  if (!rows.length) {
    return (
      `<section class="ana-section">` +
        `<h2 class="soc-section-title">${escHtml(title)}</h2>` +
        `<p class="dash-empty">No data for this period.</p>` +
      `</section>`
    );
  }
  return (
    `<section class="ana-section">` +
      `<h2 class="soc-section-title">${escHtml(title)}</h2>` +
      `<div class="ana-table-wrap">` +
        `<table class="ana-table">` +
          `<thead><tr><th>${escHtml(labelCol)}</th><th>Visitors</th><th>Pageviews</th></tr></thead>` +
          `<tbody>` +
            rows
              .map(
                (row) =>
                  `<tr>` +
                    `<td class="ana-table-label">${escHtml(row.label)}</td>` +
                    `<td>${escHtml(analyticsNumFmt(row.visitors))}</td>` +
                    `<td>${escHtml(analyticsNumFmt(row.pageviews))}</td>` +
                  `</tr>`,
              )
              .join('') +
          `</tbody>` +
        `</table>` +
      `</div>` +
    `</section>`
  );
}

function analyticsKindLabel(kind) {
  if (kind === 'agency') return 'Agency';
  if (kind === 'kinsta') return 'Kinsta';
  return 'Railway';
}

function analyticsAccountWired(row) {
  if (row?.registered) return `<span class="ana-wired ana-wired--on">Wired</span>`;
  return `<span class="ana-wired ana-wired--off">Not in Plausible</span>`;
}

async function syncAnalyticsRailwaySites() {
  if (analyticsSyncing) return;
  analyticsSyncing = true;
  try {
    const res = await fetch('/api/admin/analytics/sync', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data?.created && !data?.skipped) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const created = data.created ?? 0;
    const skipped = data.skipped ?? 0;
    const failed = data.failed ?? 0;
    const manual = Array.isArray(data.manualItems) ? data.manualItems : [];
    const manualLines = manual
      .slice(0, 20)
      .map((item) => {
        const href = item.addUrl || '#';
        return (
          `<li><strong>${escHtml(item.label || item.siteId)}</strong>` +
          ` <span class="dash-muted-inline">${escHtml(item.siteId)}</span>` +
          (href !== '#'
            ? ` <a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">Add in Plausible ↗</a>`
            : '') +
          `</li>`
        );
      })
      .join('');
    const warn = Array.isArray(data.warnings) && data.warnings.length
      ? `<p class="soc-empty-hint">${escHtml(data.warnings[0])}</p>`
      : '';
    await osAlert({
      title: manual.length ? 'Plausible — add sites' : 'Plausible sync',
      bodyHtml:
        `<p><strong>${created}</strong> created · <strong>${skipped}</strong> already registered · <strong>${failed}</strong> need a manual add</p>` +
        warn +
        (manualLines ? `<ul class="meeting-confirm-steps">${manualLines}</ul>` : ''),
    });
    void loadAnalyticsTab({ preserveSidebar: true });
  } catch (e) {
    await osAlert({
      title: 'Plausible sync failed',
      bodyHtml: `<p>${escHtml(e.message || 'Could not sync hosted apex domains')}</p>`,
    });
  } finally {
    analyticsSyncing = false;
  }
}

function analyticsRoot() {
  return document.getElementById('analytics-panel');
}

function filteredAnalyticsAccounts() {
  const q = analyticsSearch.trim().toLowerCase();
  const rows = Array.isArray(analyticsAccounts) ? analyticsAccounts : [];
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = [
      row.siteId,
      row.label,
      row.sourceLabel,
      analyticsKindLabel(row.kind),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function summarizeAnalyticsClient(accounts) {
  const rows = Array.isArray(accounts) ? accounts : [];
  const registered = rows.filter((row) => row.registered);
  return {
    siteCount: rows.length,
    registeredCount: registered.length,
    unregisteredCount: rows.length - registered.length,
    visitors: registered.reduce((sum, row) => sum + (Number(row.visitors) || 0), 0),
    pageviews: registered.reduce((sum, row) => sum + (Number(row.pageviews) || 0), 0),
    realtimeVisitors: registered.reduce((sum, row) => sum + (Number(row.realtimeVisitors) || 0), 0),
  };
}

function createAnalyticsListItem(row, { overview = false } = {}) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item';
  if (overview) {
    item.className += ' ana-list-overview';
    item.dataset.analyticsOverview = '1';
    const active = !analyticsSiteId;
    if (active) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    }
    const summary = summarizeAnalyticsClient(analyticsAccounts);
    item.innerHTML =
      `<span class="ch-list-content">` +
        `<span class="ch-item-row">` +
          `<span class="ch-item-title">All sites</span>` +
          `<span class="ch-item-date">${escHtml(analyticsNumFmt(summary.realtimeVisitors))} live</span>` +
        `</span>` +
        `<span class="ana-item-meta">${escHtml(String(summary.registeredCount))} wired · ${escHtml(analyticsNumFmt(summary.visitors))} visitors</span>` +
      `</span>`;
    item.addEventListener('click', () => {
      openAnalyticsSite('');
      if (isAdminPaneMobile()) analyticsRoot()?.classList.add('ana-pane-active');
    });
    return item;
  }

  const active = row.siteId === analyticsSiteId;
  if (active) {
    item.classList.add('active');
    item.setAttribute('aria-current', 'page');
  }
  item.dataset.analyticsSite = row.siteId;
  const liveVal =
    row.realtimeVisitors != null ? analyticsNumFmt(row.realtimeVisitors) : '—';
  const visitorsVal = row.registered ? analyticsNumFmt(row.visitors) : '—';
  item.innerHTML =
    `<span class="ch-list-content">` +
      `<span class="ch-item-row">` +
        `<span class="ch-item-title">${escHtml(row.label || row.siteId)}</span>` +
        `<span class="ch-item-date">${escHtml(visitorsVal)}</span>` +
      `</span>` +
      `<span class="ana-item-meta">${escHtml(row.siteId)} · ${escHtml(analyticsKindLabel(row.kind))}` +
        (row.registered ? '' : ' · not wired') +
        (row.realtimeVisitors != null ? ` · <span class="ana-live">${escHtml(liveVal)} live</span>` : '') +
      `</span>` +
    `</span>`;
  item.addEventListener('click', () => openAnalyticsSite(row.siteId));
  return item;
}

function fillAnalyticsSidebarList(listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  const rows = filteredAnalyticsAccounts();
  listEl.appendChild(createAnalyticsListItem(null, { overview: true }));
  if (!rows.length) {
    listEl.appendChild(
      createCenteredListEmpty({
        title: analyticsSearch.trim() ? 'No matching sites' : 'No sites yet',
        body: analyticsSearch.trim()
          ? 'Try another domain or project name.'
          : 'Railway and Kinsta apex domains appear here once they have a public custom domain.',
      }),
    );
    return;
  }
  for (const row of rows) listEl.appendChild(createAnalyticsListItem(row));
}

function syncAnalyticsSidebarActive() {
  const root = analyticsRoot();
  if (!root) return;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const on =
      (el.dataset.analyticsOverview && !analyticsSiteId) ||
      el.dataset.analyticsSite === analyticsSiteId;
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function renderAnalyticsSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';
  const subheader = listSearchAddNew({
    itemCount: filteredAnalyticsAccounts().length,
    search: {
      value: analyticsSearch,
      placeholder: 'Search sites…',
      onInput: (value) => {
        analyticsSearch = value;
        const list = analyticsRoot()?.querySelector('.ch-sidebar .ch-list');
        if (list) fillAnalyticsSidebarList(list);
        const countEl = analyticsRoot()?.querySelector('.panel-list-search-hint');
        if (countEl) countEl.textContent = `${filteredAnalyticsAccounts().length} sites`;
      },
    },
    addNew: false,
  });
  if (subheader) sidebar.appendChild(subheader.el);
  const list = document.createElement('div');
  list.className = 'ch-list';
  fillAnalyticsSidebarList(list);
  sidebar.appendChild(list);
  return sidebar;
}

function analyticsPaneActionsHtml(status, opts = {}) {
  const meta = analyticsMeta || {};
  const hostedConfigured = meta.railwayConfigured || meta.kinstaConfigured;
  const backBtn =
    opts.showBack && isAdminPaneMobile()
      ? `<button type="button" class="prof-btn-secondary" data-analytics-back>Sites</button>`
      : '';
  return (
    backBtn +
    (opts.wired != null ? analyticsWiredBadge(opts.wired) : '') +
    (opts.showSource ? analyticsSourceTabs(opts.availableSources || ['plausible', 'ga4']) : '') +
    analyticsRangeTabs() +
    (opts.openLink || '') +
    (opts.showSync && hostedConfigured
      ? `<button type="button" class="prof-btn-secondary" data-analytics-sync${analyticsSyncing ? ' disabled' : ''}>${analyticsSyncing ? 'Syncing…' : 'Sync hosted sites'}</button>`
      : '') +
    analyticsGoogleConnectHtml(status)
  );
}

function buildAnalyticsOverviewHtml(accounts, meta, status) {
  const rows = Array.isArray(accounts) ? accounts : [];
  const summary = summarizeAnalyticsClient(rows);
  const rangeLabel = ANALYTICS_RANGE_LABEL[meta?.rangeDays] || `last ${meta?.rangeDays || 30} days`;
  const header =
    `<div class="soc-header ana-pane-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">All sites</h1>` +
        `<p class="soc-sub">${escHtml(String(summary.siteCount))} accounts · ${escHtml(String(summary.registeredCount))} wired · ${escHtml(rangeLabel)} · ` +
          `<span class="ana-live">${escHtml(analyticsNumFmt(summary.realtimeVisitors))} live</span>` +
        `</p>` +
      `</div>` +
      `<div class="ana-header-actions">` +
        analyticsPaneActionsHtml(status, { showSync: true }) +
      `</div>` +
    `</div>`;

  if (!meta?.configured) {
    return (
      header +
      `<div class="prof-card soc-empty-card">` +
        `<p class="dash-empty">Plausible is not configured.</p>` +
        `<p class="soc-empty-hint">Set <code>PLAUSIBLE_API_BASE_URL</code> and <code>PLAUSIBLE_API_KEY</code> so Railway and Kinsta apex domains can report here.</p>` +
      `</div>`
    );
  }

  if (!rows.length) {
    return (
      header +
      `<div class="prof-card soc-empty-card">` +
        `<p class="dash-empty">No analytics accounts yet.</p>` +
        `<p class="soc-empty-hint">Railway and Kinsta apex domains will show here once they have a public custom domain.</p>` +
      `</div>`
    );
  }

  const topSites = rows
    .filter((row) => row.registered)
    .slice()
    .sort((a, b) => (Number(b.visitors) || 0) - (Number(a.visitors) || 0))
    .slice(0, 12)
    .map((row) => ({
      label: row.label || row.siteId,
      visitors: Number(row.visitors) || 0,
      pageviews: Number(row.pageviews) || 0,
    }));

  const statsEl =
    `<div class="dash-stats soc-totals">` +
      analyticsMetricCard(analyticsNumFmt(summary.visitors), 'Visitors', 'fleet total', null) +
      analyticsMetricCard(analyticsNumFmt(summary.pageviews), 'Pageviews', rangeLabel, null) +
      analyticsMetricCard(analyticsNumFmt(summary.realtimeVisitors), 'Live now', 'all wired sites', null) +
      analyticsMetricCard(
        `${summary.registeredCount}/${summary.siteCount}`,
        'Wired',
        'registered in Plausible',
        null,
      ) +
    `</div>`;

  const sitesPanel = analyticsBreakdownPanel('Top sites', topSites);
  const unwired = rows.filter((row) => !row.registered);
  const unwiredEl =
    unwired.length > 0
      ? `<section class="ana-section ana-section--chart">` +
          `<h2 class="soc-section-title">Not wired (${unwired.length})</h2>` +
          `<ul class="ana-unwired-list">` +
            unwired
              .slice(0, 8)
              .map(
                (row) =>
                  `<li><button type="button" class="ana-unwired-link" data-analytics-site="${escHtml(row.siteId)}">${escHtml(row.label || row.siteId)}</button></li>`,
              )
              .join('') +
          `</ul>` +
        `</section>`
      : '';

  return header + statsEl + sitesPanel + unwiredEl;
}

function buildAnalyticsDetailHtml(d, status, readiness, readinessLoading) {
  const rangeLabel = ANALYTICS_RANGE_LABEL[d?.rangeDays] || `last ${d?.rangeDays || 30} days`;
  const siteId = d?.siteId || analyticsSiteId || '';
  if (!d && siteId) return analyticsDetailLoadingHtml(siteId);
  const dashboardUrl = d?.dashboardUrl || '';
  const realtime =
    d?.realtimeVisitors != null ? analyticsNumFmt(d.realtimeVisitors) : null;
  const source = d?.source || analyticsSource;
  analyticsSource = source;

  const openLink = dashboardUrl
    ? `<a class="prof-btn-secondary ana-open-link" href="${escHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">Open ${source === 'ga4' ? 'GA4' : 'Plausible'}</a>`
    : '';

  if (siteId) analyticsSiteId = siteId;
  const header =
    `<div class="soc-header ana-pane-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">${escHtml(siteId || 'Site')}</h1>` +
        `<p class="soc-sub">${escHtml(source)} · ${escHtml(rangeLabel)}` +
          (realtime != null ? ` · <span class="ana-live">${escHtml(realtime)} live</span>` : '') +
        `</p>` +
      `</div>` +
      `<div class="ana-header-actions">` +
        analyticsPaneActionsHtml(status, {
          showBack: true,
          wired: d?.wired,
          showSource: true,
          availableSources: d?.availableSources,
          openLink,
        }) +
      `</div>` +
    `</div>`;

  if (!d?.configured && source === 'plausible' && !(status?.google?.connected)) {
    return (
      header +
      `<div class="prof-card soc-empty-card">` +
        `<p class="dash-empty">Plausible is not configured, and Google is not connected.</p>` +
        `<p class="soc-empty-hint">Set <code>PLAUSIBLE_*</code> env vars, or Connect Google for GA4 / Search Console.</p>` +
      `</div>`
    );
  }

  if (d?.error || d?.failed) {
    return (
      header +
      `<div class="prof-card soc-empty-card">` +
        `<p class="dash-empty">Analytics failed: ${escHtml(d.error || 'unknown error')}</p>` +
        `<p class="soc-empty-hint">No invented metrics — fix auth/quota and reload.</p>` +
      `</div>`
    );
  }

  if (!d?.configured) {
    return (
      header +
      `<div class="prof-card soc-empty-card">` +
        `<p class="dash-empty">${source === 'ga4' ? 'GA4' : 'Plausible'} is not configured for this view.</p>` +
      `</div>`
    );
  }

  const m = d?.metrics || {};
  const statsEl =
    `<div class="dash-stats soc-totals">` +
      analyticsMetricCard(analyticsNumFmt(m.visitors?.value ?? 0), 'Visitors', 'unique', m.visitors?.change) +
      analyticsMetricCard(analyticsNumFmt(m.pageviews?.value ?? 0), 'Pageviews', rangeLabel, m.pageviews?.change) +
      analyticsMetricCard(analyticsPctFmt(m.bounceRate?.value ?? 0), 'Bounce rate', 'sessions', m.bounceRate?.change) +
      analyticsMetricCard(analyticsDurationFmt(m.visitDuration?.value ?? 0), 'Visit duration', 'avg session', m.visitDuration?.change) +
    `</div>`;

  const chart =
    `<section class="ana-section ana-section--wide">` +
      `<h2 class="soc-section-title">Traffic over time</h2>` +
      analyticsTimeseriesChart(d?.series) +
    `</section>`;

  const breakdownGrid =
    `<div class="ana-grid">` +
      analyticsBreakdownPanel('Top sources', d?.topSources) +
      analyticsBreakdownPanel('Top pages', d?.topPages) +
      analyticsBreakdownPanel('Countries', d?.topCountries, { formatLabel: analyticsCountryLabel }) +
      analyticsBreakdownPanel('Devices', d?.topDevices) +
      analyticsBreakdownPanel('Browsers', d?.topBrowsers) +
    `</div>`;
  const readinessEl = renderSiteReadinessReport(readiness, { loading: readinessLoading });

  return header + statsEl + chart + breakdownGrid + readinessEl;
}

function renderAnalyticsPane(readiness = null, readinessLoading = false) {
  const root = analyticsRoot();
  if (!root) return;
  let pane = root.querySelector('.ch-pane');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'ch-pane';
    root.appendChild(pane);
  }

  const body = analyticsSiteId
    ? buildAnalyticsDetailHtml(analyticsDetail, analyticsStatus, readiness, readinessLoading)
    : buildAnalyticsOverviewHtml(analyticsAccounts, analyticsMeta, analyticsStatus);

  pane.innerHTML = `<div class="social-scroll ana-pane-scroll">${body}</div>`;
  if (isAdminPaneMobile()) {
    root.classList.toggle('ana-pane-active', Boolean(analyticsSiteId));
  } else {
    root.classList.remove('ana-pane-active');
  }
  bindAnalyticsControls(root);
  syncAdminSplitView('analytics');
}

function renderAnalyticsPanel(opts = {}) {
  const root = analyticsRoot();
  if (!root) return;

  if (!opts.preserveSidebar || !root.querySelector('.ch-sidebar')) {
    root.innerHTML = '';
    root.appendChild(renderAnalyticsSidebar());
    initSidebarLayout();
    scanPanelSidebars();
  } else {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list && !opts.skipList) fillAnalyticsSidebarList(list);
    syncAnalyticsSidebarActive();
  }

  renderAnalyticsPane(opts.readiness, opts.readinessLoading);
}

function bindAnalyticsControls(root) {
  root.querySelectorAll('[data-analytics-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Number(btn.getAttribute('data-analytics-range'));
      if (!next || next === analyticsRangeDays) return;
      analyticsRangeDays = next;
      void loadAnalyticsTab({ preserveSidebar: true });
    });
  });
  root.querySelectorAll('[data-analytics-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-analytics-source');
      if (!next || next === analyticsSource) return;
      analyticsSource = next;
      if (!analyticsSiteId) return;
      void loadAnalyticsTab({ preserveSidebar: true, preserveDetail: false });
    });
  });
  root.querySelectorAll('[data-analytics-site]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = String(btn.getAttribute('data-analytics-site') || '').trim();
      if (next) openAnalyticsSite(next);
    });
  });
  root.querySelectorAll('[data-analytics-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Disconnect Google Search Console / Analytics from this install?')) return;
      try {
        const res = await fetch('/api/admin/analytic-audit/status', { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        void loadAnalyticsTab({ preserveSidebar: true });
      } catch (e) {
        alert(e.message || 'Disconnect failed');
      }
    });
  });
  root.querySelectorAll('[data-analytics-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      analyticsSiteId = '';
      syncAnalyticsSiteUrl('');
      analyticsRoot()?.classList.remove('ana-pane-active');
      renderAnalyticsPanel({ preserveSidebar: true });
    });
  });
  root.querySelectorAll('[data-analytics-sync]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void syncAnalyticsRailwaySites();
    });
  });
  bindAnalyticsChartHover(root);
}

function readinessStatusLabel(status) {
  if (status === 'ok') return 'Likely Good';
  if (status === 'warn') return 'Needs Attention';
  if (status === 'crit') return 'Not Started';
  if (status === 'pending') return 'Scanning…';
  return 'Not Verified';
}

function readinessStatusClass(status) {
  if (status === 'ok') return 'site-ready--ok';
  if (status === 'warn') return 'site-ready--warn';
  if (status === 'crit') return 'site-ready--crit';
  if (status === 'pending') return 'site-ready--pending';
  return 'site-ready--unknown';
}

function renderSiteReadinessReport(readiness, opts = {}) {
  const items = Array.isArray(readiness?.items) ? readiness.items : [];
  if (!items.length) {
    return (
      `<section class="ana-section site-ready-section">` +
        `<h2 class="soc-section-title">Website readiness</h2>` +
        `<p class="dash-empty">${escHtml(opts.loading ? 'Scanning site checklist…' : 'Checklist not available yet.')}</p>` +
      `</section>`
    );
  }
  const summary = `${readiness.okCount}/${readiness.totalCount} items look good`;
  const rows = items
    .map(
      (item) =>
        `<tr class="${readinessStatusClass(item.status)}">` +
          `<td class="ana-table-label">${escHtml(item.label)}</td>` +
          `<td><span class="site-ready-badge site-ready-badge--${escHtml(item.status)}">${escHtml(readinessStatusLabel(item.status))}</span></td>` +
          `<td>${escHtml(item.effort || '—')}</td>` +
          `<td>${escHtml(item.impact || '—')}</td>` +
          `<td class="site-ready-detail">${escHtml(item.detail || '')}</td>` +
        `</tr>`,
    )
    .join('');
  return (
    `<section class="ana-section site-ready-section">` +
      `<div class="site-ready-head">` +
        `<h2 class="soc-section-title">Website readiness</h2>` +
        `<p class="site-ready-sub">${escHtml(summary)} · engagement above · full audit items below</p>` +
      `</div>` +
      `<div class="ana-table-wrap">` +
        `<table class="ana-table site-ready-table">` +
          `<thead><tr><th>Item</th><th>Status</th><th>Effort</th><th>Impact</th><th>Details</th></tr></thead>` +
          `<tbody>${rows}</tbody>` +
        `</table>` +
      `</div>` +
    `</section>`
  );
}

function patchAnalyticsReadiness(root, readiness, loading = false) {
  const scroll = root.querySelector('.ch-pane .ana-pane-scroll, .ch-pane .social-scroll');
  if (!scroll) return;
  const html = renderSiteReadinessReport(readiness, { loading });
  const existing = scroll.querySelector('.site-ready-section');
  if (existing) existing.outerHTML = html;
  else scroll.insertAdjacentHTML('beforeend', html);
}

/** Cached checklist first, then full PageSpeed/link crawl — never blocks charts. */
async function refreshAnalyticsReadiness(root, siteId) {
  const gen = ++analyticsReadinessGen;
  const site = String(siteId || '').trim();
  if (!site) return;

  patchAnalyticsReadiness(root, null, true);

  const fetchReadiness = async (full) => {
    const params = new URLSearchParams({ site_id: site });
    if (full) params.set('full', '1');
    const res = await fetch(`/api/admin/sites/readiness?${params}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (gen !== analyticsReadinessGen) return null;
    if (!res.ok || !data.ok) return null;
    return data.readiness;
  };

  try {
    const cached = await fetchReadiness(false);
    if (cached) patchAnalyticsReadiness(root, cached, false);
  } catch {
    /* readiness is optional — charts already rendered */
  }

  try {
    const full = await fetchReadiness(true);
    if (full) patchAnalyticsReadiness(root, full, false);
  } catch {
    /* PageSpeed / link crawl can fail without blocking analytics */
  }
}

async function loadAnalyticsTab(opts = {}) {
  const root = analyticsRoot();
  if (!root) return;

  const preserveSidebar = opts.preserveSidebar === true && root.querySelector('.ch-sidebar');
  if (!preserveSidebar) {
    mountPanelSkeleton(root, 'list', 'Loading sites…', {
      contentSelector: '.ch-list',
      wrapper: (sk) => `<div class="ch-sidebar">${sk}</div><div class="ch-pane"></div>`,
    });
  }

  const siteFromOpts = opts.siteId !== undefined ? String(opts.siteId || '').trim() : null;
  const siteFromUrl = parseAnalyticsSiteFromUrl();
  if (siteFromOpts !== null) {
    analyticsSiteId = siteFromOpts;
  } else if (siteFromUrl && !preserveSidebar) {
    analyticsSiteId = siteFromUrl;
  }
  syncAnalyticsSiteUrl(analyticsSiteId);

  const loadGen = ++analyticsLoadGen;
  if (analyticsSiteId && preserveSidebar) {
    showAnalyticsDetailLoading(analyticsSiteId);
  }

  try {
    const accountsParams = new URLSearchParams({
      view: 'accounts',
      range: String(analyticsRangeDays),
    });
    const dashParams = new URLSearchParams({
      range: String(analyticsRangeDays),
      source: analyticsSource,
    });
    if (analyticsSiteId) dashParams.set('site_id', analyticsSiteId);

    const fetches = [
      fetch(`/api/admin/analytics?${accountsParams}`, { cache: 'no-store' }),
      fetch('/api/admin/analytic-audit/status', { cache: 'no-store' }),
      analyticsSiteId
        ? fetch(`/api/admin/analytics?${dashParams}`, { cache: 'no-store' })
        : Promise.resolve(null),
    ];
    const [listRes, statusRes, dashRes] = await Promise.all(fetches);
    const listData = await listRes.json();
    const statusData = await statusRes.json().catch(() => ({}));
    analyticsStatus = statusData?.ok ? statusData : null;
    if (!listRes.ok || !listData.ok) throw new Error(listData.error || `HTTP ${listRes.status}`);

    analyticsAccounts = Array.isArray(listData.accounts) ? listData.accounts : [];
    analyticsMeta = {
      configured: listData.configured,
      rangeDays: listData.rangeDays,
      railwayConfigured: listData.railwayConfigured,
      kinstaConfigured: listData.kinstaConfigured,
    };

    if (analyticsSiteId && dashRes) {
      const dashData = await dashRes.json();
      if (!dashRes.ok || !dashData.ok) throw new Error(dashData.error || `HTTP ${dashRes.status}`);
      analyticsDetail = dashData.dashboard;
    } else {
      analyticsDetail = null;
    }

    if (loadGen !== analyticsLoadGen) return;

    renderAnalyticsPanel({
      preserveSidebar,
      readiness: null,
      readinessLoading: Boolean(analyticsSiteId),
    });

    if (analyticsSiteId) void refreshAnalyticsReadiness(root, analyticsSiteId);
  } catch (e) {
    if (loadGen !== analyticsLoadGen) return;
    root.innerHTML =
      `<div class="ch-pane" style="display:flex">` +
        `<div class="social-scroll"><div class="prof-card">` +
          `<h1 class="prof-title">Sites</h1>` +
          `<p class="dash-empty">Could not load analytics: ${escHtml(e.message)}</p>` +
        `</div></div>` +
      `</div>`;
  }
}

let fleetMapInstance = null;
let fleetPollTimer = null;
let fleetLocationWatchId = null;
let fleetLocationReporterStarted = false;
let fleetLastPingAt = 0;

function stopFleetPoll() {
  if (fleetPollTimer != null) {
    clearInterval(fleetPollTimer);
    fleetPollTimer = null;
  }
}

export function teardownFleetMap() {
  stopFleetPoll();
  if (fleetMapInstance) {
    fleetMapInstance.destroy();
    fleetMapInstance = null;
  }
}

function stopFleetLocationWatch() {
  if (fleetLocationWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(fleetLocationWatchId);
    fleetLocationWatchId = null;
  }
}

async function pingFleetLocation(position) {
  const now = Date.now();
  if (now - fleetLastPingAt < 15000) return;
  fleetLastPingAt = now;
  const body = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    heading: position.coords.heading,
    speed: position.coords.speed,
    accuracy: position.coords.accuracy,
  };
  try {
    await fetch('/api/fleet/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* ignore transient network errors */
  }
}

function startFleetLocationWatch() {
  if (!navigator.geolocation || fleetLocationWatchId != null) return;
  fleetLocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      void pingFleetLocation(pos);
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
  );
}

async function initFleetLocationReporter() {
  if (!hasInstallFeature('fleet_tracking')) return;
  if (fleetLocationReporterStarted) return;
  try {
    const res = await fetch('/api/fleet/vehicles?mine=1', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.vehicles) || !data.vehicles.length) return;
    fleetLocationReporterStarted = true;
    startFleetLocationWatch();
  } catch {
    /* fleet feature off or not configured */
  }
}

function fleetStatusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'offline') return 'Offline';
  if (status === 'idle') return 'Idle';
  return status || 'Unknown';
}

function fleetStatusClass(status) {
  if (status === 'active') return 'fl-status--active';
  if (status === 'offline') return 'fl-status--offline';
  return 'fl-status--idle';
}

function formatFleetSeen(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

function renderFleetDashboard(root, data) {
  const summary = data.summary || {};
  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  const listHtml = vehicles.length
    ? vehicles
        .map(
          (v) =>
            `<li class="fl-vehicle-item" data-vehicle-id="${escHtml(v.id)}">` +
            `<div class="fl-vehicle-main">` +
            `<span class="fl-vehicle-name">${escHtml(v.name)}</span>` +
            (v.plate ? `<span class="fl-vehicle-plate">${escHtml(v.plate)}</span>` : '') +
            `<span class="fl-status ${fleetStatusClass(v.status)}">${escHtml(fleetStatusLabel(v.status))}</span>` +
            `</div>` +
            `<div class="fl-vehicle-meta">` +
            `<span>${v.lastLat != null ? 'On map' : 'No GPS yet'}</span>` +
            `<span>${escHtml(formatFleetSeen(v.lastSeenAt))}</span>` +
            (v.assignedUserId ? `<span class="fl-user-id" title="Assigned Clerk user">${escHtml(v.assignedUserId.slice(0, 12))}…</span>` : '') +
            `</div>` +
            `</li>`,
        )
        .join('')
    : '<li class="dash-empty">No vehicles yet — add one below.</li>';

  root.innerHTML =
    `<div class="social-scroll fl-scroll">` +
    `<div class="prof-card fl-header">` +
    `<div class="fl-header-row">` +
    `<div><h1 class="prof-title">Fleet</h1>` +
    `<p class="home-dashboard-sub">${summary.active ?? 0} active · ${summary.offline ?? 0} offline · ${summary.located ?? 0} on map</p></div>` +
    `<button type="button" class="de-btn fl-add-btn">Add vehicle</button>` +
    `</div></div>` +
    `<div class="fl-layout">` +
    `<div class="fl-map-host" id="fleet-map-host" aria-label="Fleet map"></div>` +
    `<aside class="fl-sidebar">` +
    `<h2 class="fl-sidebar-title">Vehicles</h2>` +
    `<ul class="fl-vehicle-list">${listHtml}</ul>` +
    `<p class="fl-hint">Assign a Clerk user id to each vehicle. When that user is signed into ${escHtml(shell.companyBrand().projectLabel)}, their device reports GPS automatically.</p>` +
    `</aside></div></div>`;

  const mapHost = root.querySelector('#fleet-map-host');
  if (fleetMapInstance) {
    fleetMapInstance.destroy();
    fleetMapInstance = null;
  }
  if (mapHost) {
    fleetMapInstance = createFleetMap(mapHost, {
      token: window.__mapboxAccessToken,
      vehicles,
    });
  }

  root.querySelector('.fl-add-btn')?.addEventListener('click', () => {
    void showAddFleetVehicleDialog(() => loadFleetTab());
  });
}

async function showAddFleetVehicleDialog(onSaved) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return;

  await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(false);
    };

    titleEl.textContent = 'Add vehicle';
    bodyEl.innerHTML =
      `<div class="fl-add-form">` +
      `<label class="de-label" for="fl-add-name">Name</label>` +
      `<input id="fl-add-name" class="de-input" type="text" placeholder="Van 3" required />` +
      `<label class="de-label" for="fl-add-plate">Plate (optional)</label>` +
      `<input id="fl-add-plate" class="de-input" type="text" placeholder="ABC-1234" />` +
      `<label class="de-label" for="fl-add-user">Clerk user id (optional)</label>` +
      `<input id="fl-add-user" class="de-input" type="text" placeholder="user_…" />` +
      `<p class="fl-hint">Assign a driver so their ${escHtml(shell.companyBrand().projectLabel)} session reports GPS for this vehicle.</p>` +
      `</div>`;
    actionsEl.innerHTML = '';

    const nameInput = bodyEl.querySelector('#fl-add-name');
    const plateInput = bodyEl.querySelector('#fl-add-plate');
    const userInput = bodyEl.querySelector('#fl-add-user');

    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish(false));
    const addBtn = mkBtn('Add', 'os-dialog-btn--primary', async () => {
      const name = nameInput instanceof HTMLInputElement ? nameInput.value.trim() : '';
      if (!name) {
        nameInput?.focus();
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        const res = await fetch('/api/fleet/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            plate: plateInput instanceof HTMLInputElement ? plateInput.value.trim() || undefined : undefined,
            assignedUserId: userInput instanceof HTMLInputElement ? userInput.value.trim() || undefined : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        finish(true);
        if (typeof onSaved === 'function') await onSaved();
      } catch (e) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add';
        await shell.osAlert({ title: 'Could not add vehicle', bodyHtml: escHtml(e.message || String(e)) });
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    nameInput?.focus();
  });
}

async function loadFleetTab() {
  if (!hasInstallFeature('fleet_tracking')) return;
  const root = document.getElementById('fleet-panel');
  if (!root) return;
  stopFleetPoll();
  mountPanelSkeleton(root, 'dashboard', 'Loading fleet…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="social-scroll">${sk}</div>`,
  });

  try {
    const res = await fetch('/api/fleet/map', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderFleetDashboard(root, data);
    void initFleetLocationReporter();
    fleetPollTimer = setInterval(() => {
      if (currentMap().type !== 'fleet') return;
      void loadFleetTabQuiet();
    }, 15000);
  } catch (e) {
    if (fleetMapInstance) {
      fleetMapInstance.destroy();
      fleetMapInstance = null;
    }
    root.innerHTML =
      `<div class="social-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Fleet</h1>` +
        `<p class="dash-empty">Could not load fleet: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

async function loadFleetTabQuiet() {
  const root = document.getElementById('fleet-panel');
  if (!root || currentMap().type !== 'fleet') return;
  try {
    const res = await fetch('/api/fleet/map', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    if (fleetMapInstance && Array.isArray(data.vehicles)) {
      fleetMapInstance.setVehicles(data.vehicles);
    }
    const summary = data.summary || {};
    const sub = root.querySelector('.home-dashboard-sub');
    if (sub) {
      sub.textContent = `${summary.active ?? 0} active · ${summary.offline ?? 0} offline · ${summary.located ?? 0} on map`;
    }
  } catch {
    /* ignore poll errors */
  }
}
export {
  loadSocialTab,
  loadAnalyticsTab,
  loadFleetTab,
  loadFleetTabQuiet,
  initFleetLocationReporter,
  stopFleetPoll,
};
