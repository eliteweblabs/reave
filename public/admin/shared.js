/**
 * Shared admin client utilities — imported by os-map-loader.js and panel modules.
 */

const AUTH_SYNC_KEY = 'reave-clerk-ssr-sync';

/** Strip sign-in redirect params so return URLs cannot loop on auth=sign-in. */
export function cleanAdminReturnUrl(pathname, search = '') {
  try {
    const url = new URL(pathname + search, window.location.origin);
    url.searchParams.delete('auth');
    url.searchParams.delete('returnTo');
    return url.pathname + url.search + url.hash;
  } catch {
    return '/admin/';
  }
}


function serverHasStaffSession() {
  return Boolean(document.body?.dataset?.userId?.trim());
}

/**
 * Never speculative-reload for cookie lag.
 * Combined with SignIn fallbackRedirectUrl="/" that caused refresh loops.
 */
export function syncSsrAfterClerkSignIn() {
  if (serverHasStaffSession()) {
    try {
      sessionStorage.removeItem(AUTH_SYNC_KEY);
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Sheet flow retired — sign-in is /login. Keep export for old imports. */
export function bindClerkSsrSessionSync() {
  /* no-op */
}

/** Dashboard fetch — always send session cookies; re-auth on 401. */
export async function adminFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...opts,
    headers: {
      Accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    const returnTo = encodeURIComponent(
      cleanAdminReturnUrl(window.location.pathname, window.location.search),
    );
    window.location.assign(`/login?redirect_url=${returnTo}`);
    throw new Error('Session expired');
  }
  return res;
}

/** Parse admin API JSON without Safari's opaque "expected pattern" failures. */
export async function readAdminJson(res, label = 'response') {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`${label}: empty response (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.trim().slice(0, 80).replace(/\s+/g, ' ');
    if (snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html') || snippet.startsWith('<')) {
      throw new Error(`${label}: server returned HTML (HTTP ${res.status})`);
    }
    throw new Error(`${label}: invalid JSON (HTTP ${res.status})`);
  }
}

export async function readApiJson(res) {
  const text = await res.text();
  if (res.ok && !text.trim()) {
    throw new Error(`Empty response (HTTP ${res.status})`);
  }
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? 'Invalid server response' : `HTTP ${res.status}`);
    }
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Shimmer skeleton — `kind`: 'list' | 'home' | 'dashboard'. */
const SK_LIST_WIDTHS = [
  [72, 58],
  [84, 46],
  [64, 52],
  [78, 44],
  [68, 50],
  [80, 42],
  [74, 48],
  [66, 54],
];

function isMobileListPanelViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
}

function listItemSkeletonRows(count = SK_LIST_WIDTHS.length) {
  return SK_LIST_WIDTHS.slice(0, count)
    .map(([titleW, subW], i) => {
      const sub =
        i % 3 !== 1
          ? `<span class="sk-bone sk-list-sub" style="width:${subW}%"></span>`
          : '';
      return (
        `<div class="ch-list-item sk-list-item">` +
        `<div class="sk-bone sk-list-icon"></div>` +
        `<span class="ch-list-content">` +
        `<span class="ch-item-row">` +
        `<span class="sk-bone sk-list-title" style="width:${titleW}%"></span>` +
        `<span class="sk-bone sk-list-date"></span>` +
        `</span>` +
        sub +
        `</span></div>`
      );
    })
    .join('');
}

/** Full sidebar list shell — search, filter tabs, and card rows (mobile footer-nav tabs). */
export function listPanelSkeletonHtml(label = 'Loading…') {
  const safeLabel = escHtml(label);
  const filters = Array(5)
    .fill(`<span class="sk-bone sk-list-filter"></span>`)
    .join('');
  return (
    `<div class="ch-sidebar sk-list-panel" role="status" aria-live="polite" aria-busy="true">` +
    `<span class="sk-sr">${safeLabel}</span>` +
    `<div class="panel-list-subheader panel-list-subheader--search-only panel-list-subheader--stacked">` +
    `<div class="panel-list-search-field control-field sk-list-search-shell">` +
    `<div class="sk-bone sk-list-search"></div>` +
    `</div>` +
    `<div class="em-filter-tabs sk-list-filters">${filters}</div>` +
    `</div>` +
    `<div class="ch-list">${listItemSkeletonRows(8)}</div>` +
    `</div>`
  );
}

export function skeletonHtml(kind = 'list', label = 'Loading…') {
  const safeLabel = escHtml(label);
  if (kind === 'home') {
    const alerts = `<div class="sk-bone sk-home-alert"></div>`.repeat(2);
    const events = Array(3)
      .fill(
        `<div class="sk-home-event">` +
          `<div class="sk-bone sk-home-event-time"></div>` +
          `<div class="sk-home-event-body">` +
            `<div class="sk-bone sk-home-event-line"></div>` +
            `<div class="sk-bone sk-home-event-line sk-home-event-line--short"></div>` +
          `</div>` +
        `</div>`,
      )
      .join('');
    const stats = `<div class="sk-bone sk-home-stat"></div>`.repeat(8);
    const uptime = `<div class="sk-bone sk-home-uptime-tile"></div>`.repeat(14);
    const inboxRows = Array(5)
      .fill(
        `<div class="sk-home-inbox-row">` +
          `<div class="sk-bone sk-home-inbox-subject"></div>` +
          `<div class="sk-bone sk-home-inbox-meta"></div>` +
        `</div>`,
      )
      .join('');
    return (
      `<div class="home-dashboard-scroll">` +
        `<div class="sk-home" role="status" aria-live="polite" aria-busy="true">` +
          `<span class="sk-sr">${safeLabel}</span>` +
          `<div class="sk-home-alerts">${alerts}</div>` +
          `<section class="sk-home-section sk-home-today">` +
            `<div class="sk-home-today-head">` +
              `<div class="sk-bone sk-home-pills"></div>` +
              `<div class="sk-bone sk-home-schedule-btn"></div>` +
            `</div>` +
            `<div class="sk-home-events">${events}</div>` +
          `</section>` +
          `<div class="sk-home-stats">${stats}</div>` +
          `<div class="sk-home-uptime">${uptime}</div>` +
          `<section class="sk-home-section sk-home-inbox">` +
            `<div class="sk-bone sk-home-panel-title"></div>` +
            `<div class="sk-home-inbox-body">${inboxRows}</div>` +
          `</section>` +
        `</div>` +
      `</div>`
    );
  }
  if (kind === 'dashboard') {
    return (
      `<div class="sk-dashboard" role="status" aria-live="polite" aria-busy="true">` +
      `<span class="sk-sr">${safeLabel}</span>` +
      `<div class="sk-stat-grid">` +
      `<div class="sk-bone sk-stat"></div>`.repeat(4) +
      `</div>` +
      `<div class="sk-bone sk-card"></div>` +
      `<div class="sk-bone sk-card sk-card--short"></div>` +
      `</div>`
    );
  }
  return (
    `<div class="sk-list" role="status" aria-live="polite" aria-busy="true">` +
    `<span class="sk-sr">${safeLabel}</span>` +
    listItemSkeletonRows() +
    `</div>`
  );
}

/** True when the panel is empty or already showing a skeleton (safe to swap in a new one). */
export function panelNeedsSkeleton(root, contentSelector) {
  if (!root) return false;
  if (root.querySelector('.sk-list, .sk-list-panel, .sk-dashboard, .sk-home')) return false;
  if (contentSelector && root.querySelector(contentSelector)) return false;
  return true;
}

/** Insert skeleton markup only for a first-load / empty panel — skips quiet refreshes. */
export function mountPanelSkeleton(root, kind, label, opts = {}) {
  if (!root || opts.quiet) return;
  if (!panelNeedsSkeleton(root, opts.contentSelector)) return;
  const html =
    kind === 'list' && isMobileListPanelViewport()
      ? listPanelSkeletonHtml(label)
      : skeletonHtml(kind, label);
  root.innerHTML = typeof opts.wrapper === 'function' ? opts.wrapper(html) : html;
}

/** Company icon used in the account menu (same fallback chain as Header.astro). */
export function companyStaffAvatarUrl() {
  return window.__companyStaffAvatarUrl || '/api/branding/icon?size=192&transparent=1';
}

const GENERIC_SENDER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'msn.com',
  'ymail.com',
]);

const TRANSACTIONAL_EMAIL_SUBDOMAINS = new Set([
  'email',
  'mail',
  'alerts',
  'notifications',
  'notify',
  'messaging',
  'e',
  'm',
  'noreply',
  'no-reply',
]);

function parseSenderEmailForIcon(from) {
  const raw = String(from || '').trim();
  const angled = raw.match(/<([^>]+)>/);
  if (angled?.[1]) return angled[1].trim();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw;
  return '';
}

/** Registrable brand domain for favicon lookup — null for personal inboxes or unparseable senders. */
export function brandDomainFromSenderEmail(from) {
  const email = parseSenderEmailForIcon(from);
  const match = email.match(/@([^@\s]+)/);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  if (domain.endsWith('bsky.social') || domain === 'bsky.app') return 'bsky.app';
  if (GENERIC_SENDER_EMAIL_DOMAINS.has(domain)) return null;
  const parts = domain.split('.');
  if (parts.length >= 3 && TRANSACTIONAL_EMAIL_SUBDOMAINS.has(parts[0])) {
    return parts.slice(1).join('.');
  }
  return domain;
}

const SIMPLE_ICONS_CDN = (slug) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${slug}.svg`;

/** Brands inferred from notification copy when sender favicon / CRM icon are unavailable. */
const NOTIFICATION_CONTENT_BRANDS = [
  {
    slug: 'bluesky',
    faviconDomain: 'bsky.app',
    matches: (text) => /\bbluesky\b/i.test(text) || /\bbsky\.(?:social|app)\b/i.test(text),
  },
  {
    slug: 'linkedin',
    faviconDomain: 'linkedin.com',
    matches: (text) => /\blinkedin\b/i.test(text),
  },
  {
    slug: 'instagram',
    faviconDomain: 'instagram.com',
    matches: (text) => /\binstagram\b/i.test(text),
  },
  {
    slug: 'x',
    faviconDomain: 'x.com',
    matches: (text) => /\b(?:twitter|x\.com)\b/i.test(text),
  },
];

function notificationContentBlob(item) {
  return [item.title, item.detail, item.subject, item.from].filter(Boolean).join(' ');
}

function brandFromNotificationContent(item) {
  const blob = notificationContentBlob(item);
  if (!blob) return null;
  return NOTIFICATION_CONTENT_BRANDS.find((brand) => brand.matches(blob)) || null;
}

function contentBrandIconUrl(item) {
  const brand = brandFromNotificationContent(item);
  if (!brand) return null;
  if (brand.faviconDomain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(brand.faviconDomain)}&sz=64`;
  }
  return SIMPLE_ICONS_CDN(brand.slug);
}

/** Google favicon URL for a sender address — null when no brand domain can be inferred. */
export function senderFaviconUrl(from, size = 64) {
  const domain = brandDomainFromSenderEmail(from);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Best icon for a dashboard notification — CRM contact, sender favicon, content brand, or company avatar. */
export function resolveReviewAlertIconUrl(item = {}) {
  const contactIcon = brandingPreviewUrl(item.iconUrl);
  if (contactIcon) return contactIcon;
  const senderIcon = item.from ? senderFaviconUrl(item.from) : null;
  if (senderIcon) return senderIcon;
  const contentIcon = contentBrandIconUrl(item);
  if (contentIcon) return contentIcon;
  return companyStaffAvatarUrl();
}

const contactAuthorIconByUid = new Map();
let contactAuthorIconPrefetchPromise = null;

function brandingPreviewUrl(url) {
  return (url || '').trim();
}

/** Cache client icon/logo URLs for sidebar author icons (work, todo, etc.). */
export function registerContactAuthorIcons(clients) {
  for (const client of clients || []) {
    if (!client?.uid) continue;
    const iconUrl =
      brandingPreviewUrl(client.iconUrl) || brandingPreviewUrl(client.logoUrl);
    if (iconUrl) contactAuthorIconByUid.set(client.uid, iconUrl);
    else contactAuthorIconByUid.delete(client.uid);
  }
}

/** Best-effort client list fetch so work/todo rows can show contact icons. */
export function prefetchContactAuthorIcons() {
  if (contactAuthorIconPrefetchPromise) return contactAuthorIconPrefetchPromise;
  contactAuthorIconPrefetchPromise = adminFetch('/api/clients')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.clients) registerContactAuthorIcons(data.clients);
    })
    .catch(() => undefined);
  return contactAuthorIconPrefetchPromise;
}

/** Wait for client branding icons before rendering sidebar rows (avoids REΛVE fallback flash). */
export async function ensureContactAuthorIconsReady() {
  await prefetchContactAuthorIcons();
}

export function resolveContactAuthorIconUrl(contactUid, explicitIconUrl) {
  const direct = brandingPreviewUrl(explicitIconUrl);
  if (direct) return direct;
  const uid = (contactUid || '').trim();
  if (uid) {
    const cached = contactAuthorIconByUid.get(uid);
    if (cached) return cached;
  }
  return companyStaffAvatarUrl();
}

/** Sidebar list row avatar — client when linked, otherwise company icon. */
export function sidebarAuthorIconHtml(opts = {}) {
  const url = resolveContactAuthorIconUrl(opts.contactUid, opts.iconUrl);
  return (
    `<span class="sidebar-list-author-icon list-select-icon" role="checkbox" aria-label="Select item">` +
    `<img class="sidebar-list-author-icon-img" src="${escHtml(url)}" alt="" loading="lazy" decoding="async" />` +
    `</span>`
  );
}

/** Email sidebar list row avatar — CRM contact, sender/recipient favicon, or company icon. */
export function emailListAuthorIconHtml(ev = {}) {
  const contactUid = String(ev.contactUid || '').trim();
  if (contactUid) return sidebarAuthorIconHtml({ contactUid });

  const firstRecipient = Array.isArray(ev.to) ? ev.to[0] : null;
  const recipientUid =
    firstRecipient && typeof firstRecipient === 'object'
      ? String(firstRecipient.uid || '').trim()
      : '';
  if (recipientUid) return sidebarAuthorIconHtml({ contactUid: recipientUid });

  const address = ev.from || ev.toEmail || firstRecipient?.email || '';
  const favicon = address ? senderFaviconUrl(address) : null;
  if (favicon) return sidebarAuthorIconHtml({ iconUrl: favicon });

  return sidebarAuthorIconHtml();
}

function stringifyNotificationDebugValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Temporary debug format: `$varname : value` per line (remove when alert sources are fixed). */
export function formatNotificationDebugHtml(record) {
  const lines = [];
  for (const [key, value] of Object.entries(record || {})) {
    const str = stringifyNotificationDebugValue(value);
    if (str == null) continue;
    lines.push(`${escHtml(key)} : ${escHtml(str)}`);
  }
  return lines.join('<br>');
}

const LINKIFY_TRAILING_PUNCT = /[.,;:!?)]+$/;

/** Turn plain-text URLs into safe anchor tags (used by work, documents, email panels). */
export function linkifyPlainText(str) {
  const escaped = escHtml(str);
  return escaped.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    let url = raw;
    let trailing = '';
    if (!raw.endsWith('...')) {
      const m = raw.match(LINKIFY_TRAILING_PUNCT);
      if (m) {
        trailing = m[0];
        url = raw.slice(0, -trailing.length);
      }
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

/** To-do priority labels — shared by dashboard and todo panel. */
export const TODO_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

/** True for legacy DATE-only values stored as UTC midnight. */
export function isUtcDateOnlyInstant(raw, d) {
  if (!d) return false;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return true;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

export function parseTodoDueInstant(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTodoDueTime(d) {
  const h = d.getHours();
  const min = d.getMinutes();
  if (h === 0 && min === 0) return null;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  if (min === 0) return `${hour12}${period}`;
  return `${hour12}:${String(min).padStart(2, '0')}${period}`;
}
