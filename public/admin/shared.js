/**
 * Shared admin client utilities — imported by os-map-loader.js and panel modules.
 */

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
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    if (window.IosSheet?.open) {
      window.IosSheet.open('sign-in-sheet');
    } else {
      window.location.assign(`/admin/?auth=sign-in&returnTo=${returnTo}`);
    }
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

/** Company icon used in the account menu (same fallback chain as Header.astro). */
export function companyStaffAvatarUrl() {
  return window.__companyStaffAvatarUrl || '/logo-icon-avatar.png';
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
    contactAuthorIconByUid.set(client.uid, iconUrl);
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
    `<span class="sidebar-list-author-icon" aria-hidden="true">` +
    `<img class="sidebar-list-author-icon-img" src="${escHtml(url)}" alt="" loading="lazy" decoding="async" />` +
    `</span>`
  );
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
