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
} from './admin-ui.js?v=20260805a';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, mountPanelSkeleton } from './shared.js?v=20260805j';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260728q';
import { createFleetMap } from '/admin/fleet-map.js';

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
}

// ---- extracted from os-map-loader.js:4066-4833 ----
// ---- Social media dashboard ----
let socialRangeDays = 30;

const SOCIAL_PLATFORM_UI = {
  twitter: { slug: 'x', color: '#1d9bf0' },
  instagram: { slug: 'instagram', color: '#e1306c' },
  linkedin: { slug: 'linkedin', color: '#0a66c2' },
  facebook: { slug: 'facebook', color: '#1877f2' },
  youtube: { slug: 'youtube', color: '#ff0000' },
  tiktok: { slug: 'tiktok', color: '#ff0050' },
  bluesky: { slug: 'bluesky', color: '#0085ff' },
  threads: { slug: 'threads', color: '#000000' },
  pinterest: { slug: 'pinterest', color: '#bd081c' },
  snapchat: { slug: 'snapchat', color: '#fffc00' },
  discord: { slug: 'discord', color: '#5865f2' },
  reddit: { slug: 'reddit', color: '#ff4500' },
  github: { slug: 'github', color: '#181717' },
  twitch: { slug: 'twitch', color: '#9146ff' },
  telegram: { slug: 'telegram', color: '#26a5e4' },
  whatsapp: { slug: 'whatsapp', color: '#25d366' },
  substack: { slug: 'substack', color: '#ff6719' },
  yelp: { slug: 'yelp', color: '#d32323' },
  googlebusiness: { slug: 'google', color: '#4285f4' },
};

// LinkedIn was removed from Simple Icons v14 — pin the last release that had it.
const SIMPLE_ICONS_PINNED = {
  linkedin: '13.19.0',
};
const ICON_CDN = (slug) => {
  const version = SIMPLE_ICONS_PINNED[slug] || 'v16';
  return `https://cdn.jsdelivr.net/npm/simple-icons@${version}/icons/${slug}.svg`;
};

const SOCIAL_RANGE_LABEL = { 7: 'last 7 days', 30: 'last 30 days', 90: 'last 90 days' };

function socialNumFmt(n) {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
  }
  return String(Math.round(num));
}

function socialDeltaHtml(delta, label) {
  const abs = Number(delta?.absolute) || 0;
  const pct = Number(delta?.percent) || 0;
  const dir = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  const icon = dir === 'down' ? 'trending-down' : 'trending-up';
  const sign = abs > 0 ? '+' : abs < 0 ? '−' : '';
  const pctSign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return (
    `<span class="soc-delta soc-delta--${dir}">` +
      (dir === 'flat' ? '' : shell.navIcon(icon, 14)) +
      `<span class="soc-delta-val">${sign}${socialNumFmt(Math.abs(abs))}</span>` +
      `<span class="soc-delta-pct">${pctSign}${Math.abs(pct)}%</span>` +
      (label ? `<span class="soc-delta-label">${escHtml(label)}</span>` : '') +
    `</span>`
  );
}

function socialSparkline(series, color) {
  const pts = Array.isArray(series) ? series : [];
  if (pts.length < 2) return '';
  const W = 240;
  const H = 48;
  const pad = 3;
  const values = pts.map((p) => Number(p.value) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - pad * 2) / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (H - pad * 2) * (1 - (v - min) / span);
    return [x, y];
  });
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area =
    `${pad},${H - pad} ` + line + ` ${(W - pad).toFixed(1)},${H - pad}`;
  return (
    `<svg class="soc-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
      `<polygon class="soc-spark-fill" points="${area}" fill="${color}" opacity="0.12" />` +
      `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />` +
    `</svg>`
  );
}

function socialPlatformIcon(platform) {
  const ui = SOCIAL_PLATFORM_UI[platform];
  if (!ui) return `<span class="soc-icon soc-icon--fallback"></span>`;
  return (
    `<span class="soc-icon" style="--soc-color:${ui.color};` +
    `--soc-icon:url('${ICON_CDN(ui.slug)}')"></span>`
  );
}

function socialMiniStat(value, label) {
  return (
    `<div class="soc-mini">` +
      `<span class="soc-mini-value">${escHtml(socialNumFmt(value))}</span>` +
      `<span class="soc-mini-label">${escHtml(label)}</span>` +
    `</div>`
  );
}

function socialPlatformCard(p) {
  const ui = SOCIAL_PLATFORM_UI[p.platform] || { color: '#64748b' };
  return (
    `<div class="soc-card" style="--soc-accent:${ui.color}">` +
      `<div class="soc-card-head">` +
        socialPlatformIcon(p.platform) +
        `<div class="soc-card-id">` +
          `<span class="soc-card-name">${escHtml(p.label)}</span>` +
          `<a class="soc-card-handle" href="${escHtml(p.url)}" target="_blank" rel="noopener noreferrer">@${escHtml(p.handle)}</a>` +
        `</div>` +
      `</div>` +
      `<div class="soc-card-followers">` +
        `<span class="soc-card-count">${escHtml(socialNumFmt(p.followers))}</span>` +
        `<span class="soc-card-count-label">${escHtml(p.followersLabel || 'Followers')}</span>` +
      `</div>` +
      `<div class="soc-card-deltas">` +
        socialDeltaHtml(p.change?.week, 'wk') +
        socialDeltaHtml(p.change?.month, 'mo') +
      `</div>` +
      socialSparkline(p.followerSeries, ui.color) +
      `<div class="soc-card-mini">` +
        socialMiniStat(p.posts, 'Posts') +
        socialMiniStat(p.mentions, 'Mentions') +
        socialMiniStat(p.reactions, 'Reactions') +
        socialMiniStat(`${p.engagementRate}%`, 'Engagement') +
      `</div>` +
    `</div>`
  );
}

function socialHashtagRow(h) {
  return (
    `<div class="soc-tag-row">` +
      `<span class="soc-tag-name">${escHtml(h.tag)}</span>` +
      `<div class="soc-tag-metrics">` +
        `<span class="soc-tag-metric"><b>${escHtml(socialNumFmt(h.mentions))}</b> mentions</span>` +
        `<span class="soc-tag-metric"><b>${escHtml(socialNumFmt(h.reach))}</b> reach</span>` +
        socialDeltaHtml(h.change, '') +
      `</div>` +
    `</div>`
  );
}

function socialRangeTabs() {
  return (
    `<div class="soc-range" role="tablist" aria-label="Reporting window">` +
      [7, 30, 90]
        .map(
          (d) =>
            `<button type="button" class="soc-range-btn${d === socialRangeDays ? ' active' : ''}" data-social-range="${d}">${d}d</button>`,
        )
        .join('') +
    `</div>`
  );
}

function renderSocialDashboard(root, d) {
  const platforms = Array.isArray(d?.platforms) ? d.platforms : [];
  const totals = d?.totals || {};
  const hashtags = Array.isArray(d?.hashtags) ? d.hashtags : [];
  const rangeLabel = SOCIAL_RANGE_LABEL[d?.rangeDays] || `last ${d?.rangeDays || 30} days`;

  const providerNote = d?.live
    ? ''
    : `<span class="soc-badge soc-badge--demo">Demo data</span>`;

  const header =
    `<div class="soc-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">Social ${providerNote}</h1>` +
        `<p class="soc-sub">Followers, engagement and mentions across your connected profiles · ${escHtml(rangeLabel)}</p>` +
      `</div>` +
      socialRangeTabs() +
    `</div>`;

  if (!platforms.length) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">No social profiles are connected yet.</p>` +
          `<p class="soc-empty-hint">Add your handles under <b>Socials</b> and they'll show up here automatically.</p>` +
          `<button type="button" class="prof-btn-secondary" data-social-open-settings>Open Socials settings</button>` +
        `</div>` +
      `</div>`;
    bindSocialControls(root);
    return;
  }

  const statsEl =
    `<div class="dash-stats soc-totals">` +
      buildSocialTotal(socialNumFmt(totals.followers ?? 0), 'Total followers', d.accounts + ' profiles') +
      buildSocialTotalDelta(totals.followersChangeWeek, 'Followers this week') +
      buildSocialTotalDelta(totals.followersChangeMonth, 'Followers this month') +
      buildSocialTotal(socialNumFmt(totals.posts ?? 0), 'Posts', rangeLabel) +
      buildSocialTotal(socialNumFmt(totals.mentions ?? 0), 'Mentions', rangeLabel) +
      buildSocialTotal(socialNumFmt(totals.reactions ?? 0), 'Reactions', rangeLabel) +
    `</div>`;

  const cards =
    `<div class="soc-grid">` + platforms.map(socialPlatformCard).join('') + `</div>`;

  const tags = hashtags.length
    ? `<div class="soc-section">` +
        `<h2 class="soc-section-title">Tracked hashtags</h2>` +
        `<div class="soc-tags">` + hashtags.map(socialHashtagRow).join('') + `</div>` +
      `</div>`
    : '';

  root.innerHTML =
    `<div class="social-scroll">` + header + statsEl + cards + tags + `</div>`;
  bindSocialControls(root);
}

function buildSocialTotal(value, label, hint) {
  return (
    `<div class="dash-stat dash-stat--muted">` +
      `<span class="dash-stat-value">${escHtml(String(value))}</span>` +
      `<span class="dash-stat-label">${escHtml(label)}</span>` +
      (hint ? `<span class="dash-stat-hint">${escHtml(hint)}</span>` : '') +
    `</div>`
  );
}

function buildSocialTotalDelta(delta, label) {
  const abs = Number(delta?.absolute) || 0;
  const dir = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  const sign = abs > 0 ? '+' : abs < 0 ? '−' : '';
  const pct = Number(delta?.percent) || 0;
  const pctSign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return (
    `<div class="dash-stat dash-stat--muted soc-total-delta soc-total-delta--${dir}">` +
      `<span class="dash-stat-value">${sign}${escHtml(socialNumFmt(Math.abs(abs)))}</span>` +
      `<span class="dash-stat-label">${escHtml(label)}</span>` +
      `<span class="dash-stat-hint">${pctSign}${Math.abs(pct)}%</span>` +
    `</div>`
  );
}

function bindSocialControls(root) {
  root.querySelectorAll('[data-social-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Number(btn.getAttribute('data-social-range'));
      if (!next || next === socialRangeDays) return;
      socialRangeDays = next;
      void loadSocialTab();
    });
  });
  const settingsBtn = root.querySelector('[data-social-open-settings]');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => shell.setActiveMap('socials'));
  }
}

async function loadSocialTab() {
  const root = document.getElementById('social-panel');
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading social dashboard…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="social-scroll">${sk}</div>`,
  });

  try {
    const res = await fetch(`/api/admin/social?range=${socialRangeDays}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderSocialDashboard(root, data.dashboard);
  } catch (e) {
    root.innerHTML =
      `<div class="social-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Social</h1>` +
        `<p class="dash-empty">Could not load social dashboard: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

const ANALYTICS_RANGE_LABEL = { 7: 'last 7 days', 30: 'last 30 days', 90: 'last 90 days' };
let analyticsRangeDays = 30;

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

function bindAnalyticsControls(root) {
  root.querySelectorAll('[data-analytics-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Number(btn.getAttribute('data-analytics-range'));
      if (!next || next === analyticsRangeDays) return;
      analyticsRangeDays = next;
      void loadAnalyticsTab();
    });
  });
}

function renderAnalyticsDashboard(root, d) {
  const rangeLabel = ANALYTICS_RANGE_LABEL[d?.rangeDays] || `last ${d?.rangeDays || 30} days`;
  const siteId = d?.siteId || '';
  const dashboardUrl = d?.dashboardUrl || '';
  const realtime =
    d?.realtimeVisitors != null ? analyticsNumFmt(d.realtimeVisitors) : null;

  const openLink = dashboardUrl
    ? `<a class="prof-btn-secondary ana-open-link" href="${escHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer">Open in Plausible</a>`
    : '';

  const header =
    `<div class="soc-header">` +
      `<div class="soc-header-titles">` +
        `<h1 class="soc-title">Analytics</h1>` +
        `<p class="soc-sub">${escHtml(siteId || 'Site analytics')} · ${escHtml(rangeLabel)}` +
          (realtime != null ? ` · <span class="ana-live">${escHtml(realtime)} live</span>` : '') +
        `</p>` +
      `</div>` +
      `<div class="ana-header-actions">` + analyticsRangeTabs() + openLink + `</div>` +
    `</div>`;

  if (!d?.configured) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">Plausible is not configured on this deployment.</p>` +
          `<p class="soc-empty-hint">Set <code>PLAUSIBLE_API_BASE_URL</code>, <code>PLAUSIBLE_API_KEY</code>, and optionally <code>PLAUSIBLE_SITE_ID</code> on Railway.</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root);
    return;
  }

  if (d?.error) {
    root.innerHTML =
      `<div class="social-scroll">` +
        header +
        `<div class="prof-card soc-empty-card">` +
          `<p class="dash-empty">Could not load analytics: ${escHtml(d.error)}</p>` +
        `</div>` +
      `</div>`;
    bindAnalyticsControls(root);
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
      analyticsSparkline(d?.series, '#6366f1') +
    `</section>`;

  const pages = analyticsBreakdownTable('Top pages', Array.isArray(d?.topPages) ? d.topPages : [], 'Page');
  const sources = analyticsBreakdownTable('Top sources', Array.isArray(d?.topSources) ? d.topSources : [], 'Source');

  root.innerHTML =
    `<div class="social-scroll">` + header + statsEl + chart + pages + sources + `</div>`;
  bindAnalyticsControls(root);
}

async function loadAnalyticsTab() {
  const root = document.getElementById('analytics-panel');
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading analytics…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="social-scroll">${sk}</div>`,
  });

  try {
    const res = await fetch(`/api/admin/analytics?range=${analyticsRangeDays}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderAnalyticsDashboard(root, data.dashboard);
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
  socialRangeDays,
  loadSocialTab,
  loadAnalyticsTab,
  loadFleetTab,
  loadFleetTabQuiet,
  initFleetLocationReporter,
  stopFleetPoll,
};
