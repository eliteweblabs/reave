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
  }
  void loadAnalyticsTab({ siteId: analyticsSiteId, view: analyticsSiteId ? 'detail' : 'accounts' });
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
    void loadAnalyticsTab({ view: analyticsSiteId ? 'detail' : 'accounts' });
  } catch (e) {
    await osAlert({
      title: 'Plausible sync failed',
      bodyHtml: `<p>${escHtml(e.message || 'Could not sync hosted apex domains')}</p>`,
    });
  } finally {
    analyticsSyncing = false;
  }
}

function bindAnalyticsControls(root, view = 'detail') {
  root.querySelectorAll('[data-analytics-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Number(btn.getAttribute('data-analytics-range'));
      if (!next || next === analyticsRangeDays) return;
      analyticsRangeDays = next;
      void loadAnalyticsTab({ view, siteId: analyticsSiteId });
    });
  });
  root.querySelectorAll('[data-analytics-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-analytics-source');
      if (!next || next === analyticsSource) return;
      analyticsSource = next;
      void loadAnalyticsTab({ view: 'detail', siteId: analyticsSiteId });
    });
  });
  root.querySelectorAll('[data-analytics-site]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const next = String(sel.value || '').trim();
      if (!next || next === analyticsSiteId) return;
      openAnalyticsSite(next);
    });
  });
  root.querySelectorAll('[data-analytics-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Disconnect Google Search Console / Analytics from this install?')) return;
      try {
        const res = await fetch('/api/admin/analytic-audit/status', { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        void loadAnalyticsTab({ view: 'detail', siteId: analyticsSiteId });
      } catch (e) {
        alert(e.message || 'Disconnect failed');
      }
    });
  });
  root.querySelectorAll('[data-analytics-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      analyticsSiteId = '';
      syncAnalyticsSiteUrl('');
      void loadAnalyticsTab({ view: 'accounts' });
    });
  });
  root.querySelectorAll('[data-analytics-sync]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void syncAnalyticsRailwaySites();
    });
  });
  root.querySelectorAll('[data-analytics-account]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = String(btn.getAttribute('data-analytics-account') || '').trim();
      if (next) openAnalyticsSite(next);
    });
  });
}

function renderAnalyticsDashboard(root, d, status) {
  const rangeLabel = ANALYTICS_RANGE_LABEL[d?.rangeDays] || `last ${d?.rangeDays || 30} days`;
  const siteId = d?.siteId || '';
  const dashboardUrl = d?.dashboardUrl || '';
  const realtime =
    d?.realtimeVisitors != null ? analyticsNumFmt(d.realtimeVisitors) : null;
  const source = d?.source || analyticsSource;
  analyticsSource = source;

  const openLink = dashboardUrl
    ? `<a class="prof-btn-secondary ana-open-link" href="${escHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">Open ${source === 'ga4' ? 'GA4' : 'Plausible'}</a>`
    : '';

  const sites = status?.plausible?.sites || [];
  if (siteId) analyticsSiteId = siteId;
  const header =
    `<div class="soc-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">Sites</h1>` +
        `<p class="soc-sub">${escHtml(siteId || 'Website analytics')} · ${escHtml(source)} · ${escHtml(rangeLabel)}` +
          (realtime != null ? ` · <span class="ana-live">${escHtml(realtime)} live</span>` : '') +
        `</p>` +
      `</div>` +
      `<div class="ana-header-actions">` +
        `<button type="button" class="prof-btn-secondary" data-analytics-back>All accounts</button>` +
        analyticsWiredBadge(d?.wired) +
        analyticsSitePicker(sites, siteId || analyticsSiteId) +
        analyticsSourceTabs(d?.availableSources) +
        analyticsRangeTabs() +
        openLink +
        analyticsGoogleConnectHtml(status) +
      `</div>` +
    `</div>`;

  if (!d?.configured && source === 'plausible' && !(status?.google?.connected)) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">Plausible is not configured, and Google is not connected.</p>` +
          `<p class="soc-empty-hint">Set <code>PLAUSIBLE_*</code> env vars, or Connect Google for GA4 / Search Console.</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root, 'detail');
    return;
  }

  if (d?.error || d?.failed) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">Analytics failed: ${escHtml(d.error || 'unknown error')}</p>` +
          `<p class="soc-empty-hint">No invented metrics — fix auth/quota and reload.</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root, 'detail');
    return;
  }

  if (!d?.configured) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">${source === 'ga4' ? 'GA4' : 'Plausible'} is not configured for this view.</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root, 'detail');
    return;
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
    `<section class="ana-section">` +
      `<h2 class="soc-section-title">Visitors over time</h2>` +
      analyticsSparkline(d?.series, 'currentColor') +
    `</section>`;

  const pages = analyticsBreakdownTable('Top pages', Array.isArray(d?.topPages) ? d.topPages : [], 'Page');
  const sources = analyticsBreakdownTable('Top sources', Array.isArray(d?.topSources) ? d.topSources : [], 'Source');

  root.innerHTML =
    `<div class="social-scroll">` + header + statsEl + chart + pages + sources + `</div>`;
  bindAnalyticsControls(root, 'detail');
}

function renderAnalyticsAccounts(root, accounts, meta) {
  const rows = Array.isArray(accounts) ? accounts : [];
  analyticsAccounts = rows;
  const registered = rows.filter((row) => row.registered).length;
  const live = rows.reduce((sum, row) => sum + (Number(row.realtimeVisitors) || 0), 0);
  const visitors = rows.reduce((sum, row) => sum + (Number(row.visitors) || 0), 0);
  const rangeLabel = ANALYTICS_RANGE_LABEL[meta?.rangeDays] || `last ${meta?.rangeDays || 30} days`;
  const railwayConfigured = meta?.railwayConfigured === true;
  const kinstaConfigured = meta?.kinstaConfigured === true;
  const hostedConfigured = railwayConfigured || kinstaConfigured;
  const header =
    `<div class="soc-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">Sites</h1>` +
        `<p class="soc-sub">${escHtml(String(rows.length))} accounts · ${escHtml(String(registered))} wired · ${escHtml(analyticsNumFmt(visitors))} visitors · ` +
          `<span class="ana-live">${escHtml(analyticsNumFmt(live))} live</span>` +
          ` · ${escHtml(rangeLabel)}</p>` +
      `</div>` +
      `<div class="ana-header-actions">` +
        analyticsRangeTabs() +
        (hostedConfigured
          ? `<button type="button" class="prof-btn-secondary" data-analytics-sync${analyticsSyncing ? ' disabled' : ''}>${analyticsSyncing ? 'Syncing…' : 'Sync hosted sites'}</button>`
          : '') +
        analyticsGoogleConnectHtml(analyticsStatus) +
      `</div>` +
    `</div>`;

  if (!meta?.configured) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">Plausible is not configured.</p>` +
          `<p class="soc-empty-hint">Set <code>PLAUSIBLE_API_BASE_URL</code> and <code>PLAUSIBLE_API_KEY</code> so Railway and Kinsta apex domains can report here.</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root, 'accounts');
    return;
  }

  if (!rows.length) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">No analytics accounts yet.</p>` +
          `<p class="soc-empty-hint">Railway and Kinsta apex domains will show here once they have a public custom domain.</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root, 'accounts');
    return;
  }

  const cards = rows
    .map((row) => {
      const liveVal = row.realtimeVisitors != null ? analyticsNumFmt(row.realtimeVisitors) : '—';
      return (
        `<button type="button" class="ana-account-card${row.registered ? '' : ' ana-account-card--off'}" data-analytics-account="${escHtml(row.siteId)}">` +
          `<div class="ana-account-top">` +
            `<span class="ana-account-name">${escHtml(row.label || row.siteId)}</span>` +
            analyticsAccountWired(row) +
          `</div>` +
          `<p class="ana-account-id">${escHtml(row.siteId)}` +
            (row.sourceLabel && row.sourceLabel !== row.siteId
              ? ` · ${escHtml(row.sourceLabel)}`
              : '') +
            ` · ${escHtml(analyticsKindLabel(row.kind))}</p>` +
          `<div class="ana-account-metrics">` +
            `<span><strong>${escHtml(row.registered ? analyticsNumFmt(row.visitors) : '—')}</strong> visitors</span>` +
            `<span><strong>${escHtml(row.registered ? analyticsNumFmt(row.pageviews) : '—')}</strong> views</span>` +
            `<span class="ana-live"><strong>${escHtml(liveVal)}</strong> live</span>` +
          `</div>` +
        `</button>`
      );
    })
    .join('');

  root.innerHTML =
    `<div class="social-scroll">` +
      header +
      `<div class="ana-account-grid">${cards}</div>` +
    `</div>`;
  bindAnalyticsControls(root, 'accounts');
}

async function loadAnalyticsTab(opts = {}) {
  const root = document.getElementById('analytics-panel');
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading analytics…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="social-scroll">${sk}</div>`,
  });

  const siteFromOpts = String(opts.siteId || '').trim();
  const siteFromUrl = parseAnalyticsSiteFromUrl();
  if (opts.view === 'accounts') {
    analyticsSiteId = '';
  } else if (siteFromOpts) {
    analyticsSiteId = siteFromOpts;
  } else if (siteFromUrl) {
    analyticsSiteId = siteFromUrl;
  }

  const view = analyticsSiteId && opts.view !== 'accounts' ? 'detail' : 'accounts';
  syncAnalyticsSiteUrl(view === 'detail' ? analyticsSiteId : '');

  try {
    if (view === 'accounts') {
      const params = new URLSearchParams({
        view: 'accounts',
        range: String(analyticsRangeDays),
      });
      const [listRes, statusRes] = await Promise.all([
        fetch(`/api/admin/analytics?${params}`, { cache: 'no-store' }),
        fetch('/api/admin/analytic-audit/status', { cache: 'no-store' }),
      ]);
      const data = await listRes.json();
      const statusData = await statusRes.json().catch(() => ({}));
      analyticsStatus = statusData?.ok ? statusData : null;
      if (!listRes.ok || !data.ok) throw new Error(data.error || `HTTP ${listRes.status}`);
      renderAnalyticsAccounts(root, data.accounts, data);
      return;
    }

    const params = new URLSearchParams({ range: String(analyticsRangeDays), source: analyticsSource });
    if (analyticsSiteId) params.set('site_id', analyticsSiteId);
    const [dashRes, statusRes] = await Promise.all([
      fetch(`/api/admin/analytics?${params}`, { cache: 'no-store' }),
      fetch('/api/admin/analytic-audit/status', { cache: 'no-store' }),
    ]);
    const data = await dashRes.json();
    const statusData = await statusRes.json().catch(() => ({}));
    analyticsStatus = statusData?.ok ? statusData : null;
    if (!dashRes.ok || !data.ok) throw new Error(data.error || `HTTP ${dashRes.status}`);
    renderAnalyticsDashboard(root, data.dashboard, analyticsStatus);
  } catch (e) {
    root.innerHTML =
      `<div class="social-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Analytics</h1>` +
        `<p class="dash-empty">Could not load analytics: ${escHtml(e.message)}</p></div>` +
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
