import { MAPS, SYSTEM_MAP_KEYS, SYSTEM_TAB_SLOT, CHAT_MAP_KEYS, CHAT_TAB_SLOT } from '/admin/os-map-data.js';
import { createClientMap } from '/admin/client-map.js';

function companyBrand() {
  return (
    window.__companyBrand || {
      name: 'Business OS',
      domain: window.location.hostname,
      siteUrl: `${window.location.origin}/`,
      inboundEmailExample: 'inbox@mail.example.com',
      projectLabel: 'Business OS App',
    }
  );
}

function applyCompanyBrandingToMaps() {
  const brand = companyBrand();
  const domain = brand.domain || window.location.hostname;
  const projectLabel = brand.projectLabel || `${brand.name} App`;
  for (const map of Object.values(MAPS)) {
    for (const node of map.nodes || []) {
      if (typeof node.sub === 'string') {
        node.sub = node.sub
          .replace(/reave\.app/g, domain)
          .replace(/ap\.reave\.app/g, domain ? `ap.${domain}` : 'ap.example.com')
          .replace(/cal\.reave\.app/g, domain ? `cal.${domain}` : 'cal.example.com');
      }
      if (typeof node.title === 'string') {
        node.title = node.title.replace(/Reave App/g, projectLabel);
      }
    }
    for (const group of map.groups || []) {
      if (typeof group.title === 'string') {
        group.title = group.title.replace(/Reave App/g, projectLabel);
      }
    }
  }
}

applyCompanyBrandingToMaps();
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
} from './admin-ui.js?v=20260719e';
import { showAdminConfirmBanner } from './push-client.js?v=20250715b';

const GRID = 12;
const STORE = 'os-map-pos-v2';
const MAP_STORE = 'os-map-active-v1';
const TAB_ORDER_STORE = 'os-map-tab-order-v1';
const SYSTEM_MAP_SET = new Set(SYSTEM_MAP_KEYS);
const CHAT_MAP_SET = new Set(CHAT_MAP_KEYS);
const MOBILE_TABS_MQ = window.matchMedia('(max-width: 639px)');
const COMPACT_TABS_MQ = window.matchMedia('(max-width: 1280px)');
const userId = document.body?.dataset?.userId?.trim() || '';
const isDeploymentOwnerClient = document.body?.dataset?.isOwner === '1';
const KNOWLEDGE_API = '/api/admin/knowledge';
const SIDEBAR_LIST_GRIP =
  '<span class="td-list-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>';
const SVGNS = 'http://www.w3.org/2000/svg';

/** Dashboard fetch — always send session cookies; re-auth on 401. */
async function adminFetch(url, opts = {}) {
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
async function readAdminJson(res, label = 'response') {
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

function titleFromKnowledgeMarkdown(content, slug) {
  const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const fromHeading = first.replace(/^#\s*/, '').trim();
  if (fromHeading) return fromHeading.slice(0, 200);
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const PINCH_ZOOM = true;

// Real brand logos via Simple Icons (https://simpleicons.org), pinned to a
// major version. We render the SVG as a CSS mask so each glyph can be tinted to
// its node's hue, keeping the full-spectrum look on the dark canvas.
const ICON_CDN = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${slug}.svg`;

const MAP_ICON_KEYS = {
  home: 'home',
  system: 'monitor',
  tooling: 'wrench',
  todo: 'check-square',
  documents: 'file-text',
  knowledge: 'book-open',
  chats: 'agent',
  email: 'mail',
  rules: 'zap',
  newsletter: 'send',
  work: 'briefcase',
  schedule: 'calendar',
  clients: 'users',
  social: 'trending-up',
  analytics: 'bar-chart-2',
  finance: 'wallet',
  profile: 'user',
  company: 'building-2',
  socials: 'link-2',
  industries: 'target',
  vapi: 'mic',
};

/** Admin settings pages — one map tab per section. */
const SETTINGS_MAP_TYPES = new Set(['profile', 'company', 'socials', 'industries', 'vapi']);

function installFooterNav() {
  const nav = window.__installConfig?.footerNav;
  return Array.isArray(nav) && nav.length ? nav : null;
}

function normalizeFooterNavKeys(keys) {
  const result = [];
  for (const raw of keys) {
    if (typeof raw !== 'string') continue;
    if (raw === SYSTEM_TAB_SLOT || SYSTEM_MAP_SET.has(raw)) {
      if (!result.includes(SYSTEM_TAB_SLOT)) result.push(SYSTEM_TAB_SLOT);
      continue;
    }
    if (raw === CHAT_TAB_SLOT) {
      if (!result.includes(CHAT_TAB_SLOT)) result.push(CHAT_TAB_SLOT);
      continue;
    }
    if (MAPS[raw] && !result.includes(raw)) result.push(raw);
  }
  return result.length ? result : [SYSTEM_TAB_SLOT, 'home'];
}

function isSettingsMapType(type) {
  return SETTINGS_MAP_TYPES.has(type);
}

function settingsPanelRoot() {
  return document.getElementById('settings-panel');
}

/** Home dashboard tiles that live in the footer nav — omit from the grid. */
const HOME_DASHBOARD_FOOTER_KEYS = new Set(['chats', 'email', 'work', 'schedule', 'clients']);

const LEGACY_EMOJI_ICON = {
  '🔔': 'bell',
  '📊': 'database',
  '💬': 'agent',
  '📋': 'file-text',
  '⚡': 'zap',
  '📚': 'book-open',
  '🔧': 'wrench',
  '👥': 'users',
  '✈️': 'send',
  '🖥️': 'monitor',
  '📄': 'file-text',
  '📬': 'mail',
  '💼': 'briefcase',
  '✅': 'check-square',
};

const NAV_ICON_PATHS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  'check-square': '<path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5"/><path d="m9 11 3 3L22 4"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  'calendar-check':
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  agent:
    '<path d="M14 18a2 2 0 0 0-4 0"/>' +
    '<path d="m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11"/>' +
    '<path d="M2 11h20"/>' +
    '<circle cx="17" cy="18" r="3"/>' +
    '<circle cx="7" cy="18" r="3"/>',
};

function navIcon(name, size = 20) {
  const paths = NAV_ICON_PATHS[name];
  if (!paths) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function mapIconName(key) {
  return MAP_ICON_KEYS[key] || 'monitor';
}

function chipIconName(n) {
  if (n._checked !== undefined) return n._checked ? 'check-square' : 'square';
  return LEGACY_EMOJI_ICON[n.icon] || null;
}

function chipHtml(n) {
  if (n.brand) {
    return `<span class="chip brand"><i class="bi" style="--icon:url('${ICON_CDN(n.brand)}')"></i></span>`;
  }
  const iconKey = chipIconName(n);
  if (iconKey) {
    return `<span class="chip chip-svg">${navIcon(iconKey, 14)}</span>`;
  }
  return `<span class="chip">${n.icon ?? '•'}</span>`;
}

function placeholderHtml(iconName, bodyHtml) {
  return `<div class="de-placeholder-icon">${navIcon(iconName, 40)}</div>${bodyHtml}`;
}

/** Detail-pane empty state — icon, message, optional Create New action (matches to-do). */
function createDetailEmptyPlaceholder({ iconName, bodyHtml, btnLabel = 'Create New', onCreate }) {
  const placeholder = document.createElement('div');
  placeholder.className = 'de-placeholder';
  placeholder.innerHTML = placeholderHtml(iconName, bodyHtml);
  if (onCreate) {
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'de-placeholder-create-btn';
    createBtn.textContent = btnLabel;
    createBtn.addEventListener('click', () => onCreate());
    placeholder.appendChild(createBtn);
  }
  return placeholder;
}

function mapPaneTitle(mapKey) {
  return MAPS[mapKey]?.title || mapKey || '';
}

/** Empty detail pane: subheader title + centered placeholder with create action. */
function appendEmptyDetailPane(pane, { mapKey, iconName, bodyHtml, btnLabel = 'Create New', onCreate }) {
  const { header } = createPaneSubheader({ title: mapPaneTitle(mapKey) });
  pane.appendChild(header);
  const body = document.createElement('div');
  body.className = 'de-pane-empty-body';
  body.appendChild(createDetailEmptyPlaceholder({ iconName, bodyHtml, btnLabel, onCreate }));
  pane.appendChild(body);
}

function paneDeleteIcon({ label, onClick, confirmDelete = true }) {
  return createIosIconBtn({
    iconKey: 'trash',
    label,
    className: 'ios-icon-btn ch-delete-btn',
    confirmDelete,
    onClick,
  });
}

function paneShareIcon({ label, onClick }) {
  return createIosIconBtn({
    iconKey: 'share',
    label,
    className: 'ios-icon-btn de-share-btn',
    onClick,
  });
}

function deBtnIconSvg(iconKey, size = 16) {
  const svg = IOS_ICONS[iconKey];
  if (!svg) return '';
  return svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
}

function setDeBtnLabel(btn, label, iconKey) {
  const key = iconKey ?? btn.dataset.deBtnIcon ?? '';
  if (iconKey) btn.dataset.deBtnIcon = iconKey;
  btn.innerHTML =
    (key ? `<span class="de-btn-icon" aria-hidden="true">${deBtnIconSvg(key)}</span>` : '') +
    `<span class="de-btn-label">${label}</span>`;
}

function getDeBtnLabel(btn) {
  return btn.querySelector('.de-btn-label')?.textContent?.trim() || '';
}

function updateDeBtnLabel(btn, label) {
  const el = btn.querySelector('.de-btn-label');
  if (el) el.textContent = label;
  else btn.textContent = label;
}

function todoChipHtml(checked) {
  return navIcon(checked ? 'check-square' : 'square', 14);
}

const wrap = document.getElementById('wrap');
const world = document.getElementById('world');
const edgesSvg = document.getElementById('edges');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap = (v) => Math.round(v / GRID) * GRID;

let z = 1;
let panX = 0;
let panY = 0;

// ---- live health (System tab only) ----
const HEALTH_URL = '/api/health';
const HEALTH_INTERVAL_MS = 20000;
const STATUS_LABELS = {
  up: 'Online',
  down: 'Down',
  degraded: 'Degraded',
  configured: 'Configured',
  unconfigured: 'Not set',
  unknown: 'Unknown',
};
let healthTimer = null;
let healthAbort = null;
let lastChecked = null;

// ---- active map state (rebuilt on tab switch) ----
let activeKey = loadActiveKey();
let MAP = MAPS[activeKey];
let cachedTabOrder = null;
let searchOverlayOpen = false;
let searchDebounceTimer = null;
let footerNavCollapsed = false;
let footerIndicatorDragging = false;
let footerIndicatorSuppressClick = false;
let byId = new Map();
let nodeEls = new Map();
let edgeEls = [];
let labelEls = [];
let groupEls = new Map();

function storeKey() {
  return `${STORE}:${activeKey}`;
}

// ---- build the active map into the world ----
function buildMap() {
  byId = new Map();
  nodeEls = new Map();
  edgeEls = [];
  labelEls = [];
  groupEls = new Map();

  // Clear everything except the persistent <svg id="edges">.
  for (const child of Array.from(world.children)) {
    if (child !== edgesSvg) world.removeChild(child);
  }
  while (edgesSvg.firstChild) edgesSvg.removeChild(edgesSvg.firstChild);

  MAP.nodes.forEach((n) => byId.set(n.id, { ...n }));
  loadPositions();

  // groups
  for (const g of MAP.groups) {
    const el = document.createElement('div');
    el.className = 'group';
    el.style.setProperty('--h', g.hue);
    const label = document.createElement('div');
    label.className = 'g-label';
    label.textContent = g.title;
    el.appendChild(label);
    world.appendChild(el);
    groupEls.set(g.id, el);
    attachGroupDrag(g, label);
  }

  // edges (paths + labels)
  for (const e of MAP.edges) {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', `edge${e.dashed ? '' : ' solid'}`);
    const hue = (byId.get(e.from) || {}).hue ?? 210;
    path.setAttribute('stroke', `hsl(${hue} 80% 62% / ${e.ghost ? 0.4 : 0.9})`);
    edgesSvg.appendChild(path);
    edgeEls.push({ e, path });

    if (e.label) {
      const lab = document.createElement('div');
      lab.className = 'elabel';
      lab.textContent = e.label;
      world.appendChild(lab);
      labelEls.push({ e, lab });
    }
  }

  // nodes
  for (const n of byId.values()) {
    const el = document.createElement('div');
    el.className = `node${n.ghost ? ' ghost' : ''}${n.cls ? ` ${n.cls}` : ''}`;
    el.style.setProperty('--h', n.hue);
    if (n.wide) el.style.width = `${n.wide}px`;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.innerHTML = `
      ${n.badge ? `<div class="rule-badge">${n.badge}</div>` : ''}
      <div class="row">
        ${chipHtml(n)}
        <span class="ttl">${n.title}</span>
      </div>
      ${n.sub ? `<div class="sub${n.subMultiline ? ' sub-multi' : ''}">${n.sub}</div>` : ''}
      ${n.status ? `<div class="status st-checking" data-st="${n.id}">Checking…</div>` : ''}
    `;
    world.appendChild(el);
    nodeEls.set(n.id, el);
    attachDrag(n, el);
  }

  buildLegend();
  syncModelNodeLabels();
}

function setActiveMap(key, opts = {}) {
  const force = opts.force === true;
  if (!MAPS[key]) return;
  if (key === activeKey && !force) {
    updateTabs();
    return;
  }
  const prevType = MAP?.type;
  expandFooterNav();
  activeKey = key;
  MAP = MAPS[key];
  saveActiveKey();
  closeTabDropdowns();
  updateTabs();
  syncCanvasVisibility();
  syncModelSelectorVisibility();
  if (key !== 'search') closeSearchOverlay();
  if (prevType === 'email' && MAP.type !== 'email') clearInboxSessionDots();
  activateMapPanel(opts);
  syncHealthLifecycle();
  syncEmailPoll();
  syncFooterNav();
  syncProfileMenuActive();
  syncTopbarPanelContext();
  syncAdminSplitView(MAP?.type);
  if (MAP.type !== 'email') {
    emailState.composing = false;
  }
  if (key !== 'chats') {
    setChatComposeFocused(false);
    if (prevType === 'chats') void abandonDisposableChat(chatState.activeId);
  }
  void refreshInboxBadgeQuiet();
}

function isPanelMapKey(key) {
  const t = MAPS[key]?.type;
  return (
    isSettingsMapType(t) ||
    t === 'home' ||
    t === 'documents' ||
    t === 'knowledge' ||
    t === 'work' ||
    t === 'clients' ||
    t === 'social' ||
    t === 'analytics' ||
    t === 'chats' ||
    t === 'email' ||
    t === 'todo' ||
    t === 'rules' ||
    t === 'newsletter'
  );
}

function activateMapPanel(opts = {}) {
  if (MAP.type === 'home') {
    loadHomeDashboard();
  } else if (MAP.type === 'profile') {
    loadProfileTab();
  } else if (MAP.type === 'company') {
    loadCompanyTab();
  } else if (MAP.type === 'socials') {
    loadSocialsTab();
  } else if (MAP.type === 'industries') {
    loadIndustriesTab();
  } else if (MAP.type === 'vapi') {
    loadVapiTab();
  } else if (MAP.type === 'documents') {
    loadDocumentsTab();
  } else if (MAP.type === 'knowledge') {
    loadKnowledgeTab();
  } else if (MAP.type === 'work') {
    loadWorkTab({ workSlug: opts.workSlug });
  } else if (MAP.type === 'schedule') {
    if (opts.scheduleUid) scheduleState.activeUid = opts.scheduleUid;
    loadScheduleTab();
  } else if (MAP.type === 'clients') {
    loadClientsTab({ clientUid: opts.clientUid });
  } else if (MAP.type === 'social') {
    loadSocialTab();
  } else if (MAP.type === 'analytics') {
    loadAnalyticsTab();
  } else if (MAP.type === 'chats') {
    if (opts.chatId) pendingChatDeepLinkId = opts.chatId;
    loadChatsTab({ keepSession: opts.keepChatSession === true });
  } else if (MAP.type === 'email') {
    if (opts.emailId) pendingEmailDeepLinkId = opts.emailId;
    else if (!pendingEmailDeepLinkId) {
      const fromUrl = parseEmailDeepLinkFromUrl();
      if (fromUrl) pendingEmailDeepLinkId = fromUrl;
    }
    loadEmailTab();
  } else if (MAP.type === 'rules') {
    loadRulesTab();
  } else if (MAP.type === 'newsletter') {
    loadNewsletterTab();
  } else if (MAP.type === 'todo') {
    loadTodoTab({ todoId: opts.todoId });
  } else {
    buildMap();
    finishMapLayout();
  }
}

function isPanelTab() {
  return (
    isSettingsMapType(MAP.type) ||
    MAP.type === 'home' ||
    MAP.type === 'documents' ||
    MAP.type === 'knowledge' ||
    MAP.type === 'work' ||
    MAP.type === 'schedule' ||
    MAP.type === 'clients' ||
    MAP.type === 'social' ||
    MAP.type === 'analytics' ||
    MAP.type === 'chats' ||
    MAP.type === 'email' ||
    MAP.type === 'rules' ||
    MAP.type === 'newsletter' ||
    MAP.type === 'todo'
  );
}

function setPanelDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function syncCanvasVisibility() {
  const isPanel = isPanelTab();
  if (wrap) wrap.style.display = isPanel ? 'none' : '';
  setPanelDisplay('tools', isPanel ? 'none' : '');
  setPanelDisplay('legend', isPanel ? 'none' : '');
  setPanelDisplay('home-dashboard', MAP.type === 'home' ? 'flex' : 'none');
  setPanelDisplay('settings-panel', isSettingsMapType(MAP.type) ? 'flex' : 'none');
  setPanelDisplay('doc-editor', MAP.type === 'documents' ? 'flex' : 'none');
  setPanelDisplay('knowledge-editor', MAP.type === 'knowledge' ? 'flex' : 'none');
  setPanelDisplay('work-editor', MAP.type === 'work' ? 'flex' : 'none');
  setPanelDisplay('schedule-panel', MAP.type === 'schedule' ? 'flex' : 'none');
  setPanelDisplay('clients-editor', MAP.type === 'clients' ? 'flex' : 'none');
  setPanelDisplay('social-panel', MAP.type === 'social' ? 'flex' : 'none');
  setPanelDisplay('analytics-panel', MAP.type === 'analytics' ? 'flex' : 'none');
  setPanelDisplay('chat-panel', MAP.type === 'chats' ? 'flex' : 'none');
  setPanelDisplay('email-panel', MAP.type === 'email' ? 'flex' : 'none');
  setPanelDisplay('rule-editor', MAP.type === 'rules' ? 'flex' : 'none');
  setPanelDisplay('newsletter-editor', MAP.type === 'newsletter' ? 'flex' : 'none');
  setPanelDisplay('todo-editor', MAP.type === 'todo' ? 'flex' : 'none');
}

// ---- health polling ----
function syncHealthLifecycle() {
  startHealth();
  updateChecked();
}

function startHealth() {
  stopHealth();
  pollHealth();
  healthTimer = setInterval(pollHealth, HEALTH_INTERVAL_MS);
}

function stopHealth() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (healthAbort) {
    healthAbort.abort();
    healthAbort = null;
  }
}

async function pollHealth() {
  try {
    healthAbort = new AbortController();
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: healthAbort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastChecked = data.checkedAt ? new Date(data.checkedAt) : new Date();
    applyHealth(data.services || {});
  } catch {
    // Network/abort errors are non-fatal; leave the last known state in place.
  } finally {
    healthAbort = null;
  }
}

function applyHealth(services) {
  for (const [id, probe] of Object.entries(services)) {
    const el = world.querySelector(`[data-st="${id}"]`);
    if (!el) continue;
    const status = probe && probe.status ? probe.status : 'unknown';
    el.className = `status st-${status}`;
    el.textContent = STATUS_LABELS[status] || status;
    const bits = [];
    if (probe && probe.mode) bits.push(probe.mode);
    if (probe && probe.detail) bits.push(probe.detail);
    if (probe && typeof probe.ms === 'number') bits.push(`${probe.ms}ms`);
    el.title = bits.join(' · ');
  }
  drawGroups();
  drawEdges();
  updateChecked();
}

function updateChecked() {
  const el = document.getElementById('health-checked');
  if (!el) return;
  if (!lastChecked) {
    el.style.opacity = '0.35';
    el.dataset.tooltip = '';
    return;
  }
  el.style.opacity = '1';
  el.dataset.tooltip = `Health checked at ${lastChecked.toLocaleTimeString()}`;
}

// ---- agent model picker (System tab legacy select; chats use pane subheader) ----
const MODEL_NODE_IDS = ['anthropic', 'tc_claude', 'tc_svc_anthropic'];

let agentModelState = {
  model: 'claude-sonnet-4-6',
  source: 'default',
  options: [],
  loading: true,
  saving: false,
  anthropicBalance: null,
};

function formatBalanceUsd(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

function anthropicBalanceLabel() {
  const b = agentModelState.anthropicBalance;
  if (!b) return null;
  const usd = formatBalanceUsd(b.balanceUsd);
  if (usd) return usd;
  if (b.source === 'error' && b.detail) return '—';
  return null;
}

function anthropicBalanceTitle() {
  const b = agentModelState.anthropicBalance;
  if (!b) return '';
  const usd = formatBalanceUsd(b.balanceUsd);
  if (usd) {
    const src = b.source === 'live' ? 'Anthropic prepaid credits' : 'manual balance';
    return `${usd} available (${src})`;
  }
  if (b.detail) return b.detail;
  return 'Anthropic balance not configured';
}

function modelSelectEl() {
  return document.getElementById('model-select');
}

function syncModelSelectorVisibility() {
  const el = modelSelectEl();
  if (!el) return;
  // Chats use the model switcher in the pane subheader, not the legacy topbar select.
  el.style.display = activeKey === 'system' ? '' : 'none';
}

function modelBaseLabel(opt) {
  return opt.label || opt.id;
}

// ---- custom (non-native) model dropdown widget ----
// Replaces the standard HTML <select> so the picker matches the app's design
// language and works consistently across platforms. No external deps.
const modelDropdowns = new Set();
let openModelDropdown = null;
let modelDropdownGlobalBound = false;

const MODEL_DD_CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
const MODEL_DD_CHECK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

function currentModelOption() {
  return (
    agentModelState.options.find((o) => o.id === agentModelState.model) ||
    (agentModelState.model ? { id: agentModelState.model } : null)
  );
}

function modelDropdownLabelText() {
  const current = currentModelOption();
  if (!current) return agentModelState.loading ? 'Loading…' : 'Model';
  return modelBaseLabel(current);
}

function modelDropdownOptions() {
  if (agentModelState.options.length) return agentModelState.options;
  const current = currentModelOption();
  return current ? [current] : [];
}

function closeModelDropdown() {
  if (!openModelDropdown) return;
  const entry = openModelDropdown;
  openModelDropdown = null;
  entry.root.classList.remove('open');
  entry.menu.hidden = true;
  entry.trigger.setAttribute('aria-expanded', 'false');
}

function positionModelDropdownMenu(entry) {
  const menu = entry.menu;
  const rect = entry.trigger.getBoundingClientRect();
  menu.style.visibility = 'hidden';
  menu.hidden = false;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const gap = 6;
  let top = rect.bottom + gap;
  if (top + mh > window.innerHeight - 8 && rect.top - gap - mh > 8) {
    top = rect.top - gap - mh;
  }
  // Compact switchers sit near the right edge → align menu's right edge to trigger.
  let left = entry.compact ? rect.right - mw : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.minWidth = `${Math.round(rect.width)}px`;
  menu.style.visibility = '';
}

function openModelDropdownFor(entry) {
  if (agentModelState.loading || agentModelState.saving) return;
  if (openModelDropdown && openModelDropdown !== entry) closeModelDropdown();
  openModelDropdown = entry;
  entry.root.classList.add('open');
  entry.menu.hidden = false;
  entry.trigger.setAttribute('aria-expanded', 'true');
  positionModelDropdownMenu(entry);
  const selected =
    entry.menu.querySelector('.model-dd-option[aria-selected="true"]') ||
    entry.menu.querySelector('.model-dd-option');
  selected?.focus();
}

function toggleModelDropdown(entry) {
  if (openModelDropdown === entry) closeModelDropdown();
  else openModelDropdownFor(entry);
}

function chooseModel(entry, id) {
  closeModelDropdown();
  entry.trigger.focus();
  if (id && id !== agentModelState.model) saveAgentModel(id);
}

function onModelDropdownKeydown(entry, e) {
  if (e.key === 'Escape') {
    if (openModelDropdown !== entry) return;
    e.preventDefault();
    closeModelDropdown();
    entry.trigger.focus();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    if (openModelDropdown !== entry) {
      openModelDropdownFor(entry);
      return;
    }
    const items = Array.from(entry.menu.querySelectorAll('.model-dd-option'));
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    let next = idx;
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : Math.min(items.length - 1, idx + 1);
    else if (e.key === 'ArrowUp') next = idx < 0 ? items.length - 1 : Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else next = items.length - 1;
    items[next]?.focus();
    return;
  }
  const active = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && active?.classList.contains('model-dd-option')) {
    e.preventDefault();
    chooseModel(entry, active.dataset.value);
  }
}

function renderModelDropdown(entry) {
  entry.label.textContent = modelDropdownLabelText();
  const disabled = agentModelState.loading || agentModelState.saving;
  entry.trigger.disabled = disabled;
  if (disabled && openModelDropdown === entry) closeModelDropdown();
  const balTitle = anthropicBalanceTitle();
  const labelText = modelDropdownLabelText();
  entry.trigger.title = agentModelState.loading
    ? 'Loading model…'
    : balTitle
      ? `${balTitle} — ${labelText}`
      : `Agent model: ${labelText} (${agentModelState.source})`;

  entry.menu.innerHTML = '';
  const bal = anthropicBalanceLabel();
  for (const opt of modelDropdownOptions()) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'model-dd-option';
    item.setAttribute('role', 'option');
    item.dataset.value = opt.id;
    const selected = opt.id === agentModelState.model;
    item.setAttribute('aria-selected', selected ? 'true' : 'false');

    const check = document.createElement('span');
    check.className = 'model-dd-check';
    check.innerHTML = selected ? MODEL_DD_CHECK : '';

    const text = document.createElement('span');
    text.className = 'model-dd-option-label';
    text.textContent = modelBaseLabel(opt);

    item.append(check, text);
    if (bal) {
      const b = document.createElement('span');
      b.className = 'model-dd-option-bal';
      b.textContent = bal;
      item.appendChild(b);
    }
    item.addEventListener('click', () => chooseModel(entry, opt.id));
    entry.menu.appendChild(item);
  }
  if (openModelDropdown === entry) positionModelDropdownMenu(entry);
}

// Kept the historical name so existing call sites (load/save) keep working.
function renderModelSelectOptions() {
  for (const entry of Array.from(modelDropdowns)) {
    if (!entry.root.isConnected) {
      if (openModelDropdown === entry) closeModelDropdown();
      modelDropdowns.delete(entry);
      continue;
    }
    renderModelDropdown(entry);
  }
}

function bindModelDropdownGlobals() {
  if (modelDropdownGlobalBound) return;
  modelDropdownGlobalBound = true;
  document.addEventListener('click', (e) => {
    if (openModelDropdown && !openModelDropdown.root.contains(e.target)) closeModelDropdown();
  });
  window.addEventListener('resize', closeModelDropdown);
  window.addEventListener('scroll', closeModelDropdown, true);
}

function createModelDropdown(opts = {}) {
  bindModelDropdownGlobals();
  const root = document.createElement('div');
  root.className = 'model-dd' + (opts.compact ? ' model-dd--compact' : '');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'model-dd-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Agent model');

  const label = document.createElement('span');
  label.className = 'model-dd-label';

  const caret = document.createElement('span');
  caret.className = 'model-dd-caret';
  caret.innerHTML = MODEL_DD_CHEVRON;

  trigger.append(label, caret);

  const menu = document.createElement('div');
  menu.className = 'model-dd-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  root.append(trigger, menu);

  const entry = { root, trigger, label, menu, compact: !!opts.compact };
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleModelDropdown(entry);
  });
  trigger.addEventListener('keydown', (e) => onModelDropdownKeydown(entry, e));
  menu.addEventListener('keydown', (e) => onModelDropdownKeydown(entry, e));

  modelDropdowns.add(entry);
  renderModelDropdown(entry);
  return { root, entry };
}

function createChatModelSwitcher() {
  const wrap = document.createElement('div');
  wrap.className = 'ch-model-switcher';

  const icon = document.createElement('span');
  icon.className = 'ch-model-switcher-icon';
  icon.innerHTML = IOS_ICONS.agent || '';
  icon.setAttribute('aria-hidden', 'true');
  wrap.appendChild(icon);

  const { root } = createModelDropdown({ compact: true });
  wrap.appendChild(root);
  return wrap;
}

function syncModelNodeLabels() {
  if (!agentModelState.model) return;
  const label = modelBaseLabel(
    agentModelState.options.find((o) => o.id === agentModelState.model) || { id: agentModelState.model },
  );
  const bits = [`${label}`, agentModelState.source];
  const bal = anthropicBalanceLabel();
  if (bal) bits.push(bal);
  const sub = bits.join(' · ');
  for (const id of MODEL_NODE_IDS) {
    const node = byId.get(id);
    if (node) node.sub = sub;
    const el = nodeEls.get(id);
    const subEl = el?.querySelector('.sub');
    if (subEl) subEl.textContent = sub;
  }
}

async function loadAgentModel() {
  agentModelState.loading = true;
  renderModelSelectOptions();
  try {
    const res = await fetch('/api/agent/model', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    agentModelState.model = data.model || agentModelState.model;
    agentModelState.source = data.source || 'default';
    agentModelState.options = data.options || [];
    agentModelState.anthropicBalance = data.anthropicBalance || null;
  } catch (e) {
    console.warn('[model] load failed:', e);
  } finally {
    agentModelState.loading = false;
    renderModelSelectOptions();
    syncModelNodeLabels();
  }
}

async function saveAgentModel(model) {
  if (!model || agentModelState.saving) return;
  const previous = agentModelState.model;
  agentModelState.model = model;
  agentModelState.saving = true;
  renderModelSelectOptions();
  try {
    const res = await fetch('/api/agent/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    agentModelState.model = data.model;
    agentModelState.source = data.source || 'stored';
    agentModelState.options = data.options || agentModelState.options;
    agentModelState.anthropicBalance = data.anthropicBalance || agentModelState.anthropicBalance;
    syncModelNodeLabels();
    if (activeKey === 'system') pollHealth();
  } catch (e) {
    agentModelState.model = previous;
    alert(`Could not save model: ${e.message}`);
    renderModelSelectOptions();
  } finally {
    agentModelState.saving = false;
    renderModelSelectOptions();
  }
}

function initModelSelector() {
  const el = modelSelectEl();
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  const { root } = createModelDropdown();
  el.appendChild(root);
  loadAgentModel();
  syncModelSelectorVisibility();
}

// ---- rendering ----
const NODE_W = 210;
const NODE_H = 96;
const NODE_H_COMPACT = 72;
const NODE_GAP = GRID * 2;

function defaultNodeSize(n) {
  return {
    w: n.wide || NODE_W,
    h: n.status ? NODE_H : NODE_H_COMPACT,
  };
}

function rect(n) {
  const el = nodeEls.get(n.id);
  const fallback = defaultNodeSize(n);
  return {
    x: n.x,
    y: n.y,
    w: el?.offsetWidth || fallback.w,
    h: el?.offsetHeight || fallback.h,
  };
}

function nodeBounds(n) {
  const r = rect(n);
  return { x: r.x, y: r.y, w: r.w, h: r.h, right: r.x + r.w, bottom: r.y + r.h };
}

function boxesOverlap(a, b, gap = NODE_GAP) {
  return a.x < b.right + gap && a.right + gap > b.x && a.y < b.bottom + gap && a.bottom + gap > b.y;
}

function separateNodes(a, b, gap = NODE_GAP) {
  const ra = nodeBounds(a);
  const rb = nodeBounds(b);
  if (!boxesOverlap(ra, rb, gap)) return false;

  const overlapX = Math.min(ra.right + gap - rb.x, rb.right + gap - ra.x);
  const overlapY = Math.min(ra.bottom + gap - rb.y, rb.bottom + gap - ra.y);

  if (overlapX < overlapY) {
    if (ra.x + ra.w / 2 <= rb.x + rb.w / 2) b.x = snap(ra.right + gap);
    else a.x = snap(rb.right + gap);
  } else if (ra.y + ra.h / 2 <= rb.y + rb.h / 2) b.y = snap(ra.bottom + gap);
  else a.y = snap(rb.bottom + gap);

  return true;
}

function applyNodePositions() {
  for (const n of byId.values()) {
    const el = nodeEls.get(n.id);
    if (!el) continue;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
}

/** Push overlapping nodes apart after layout; returns true if anything moved. */
function resolveOverlaps() {
  const nodes = [...byId.values()];
  if (nodes.length < 2) return false;

  let changed = false;
  const maxPass = Math.max(24, nodes.length * 4);

  for (let pass = 0; pass < maxPass; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (separateNodes(nodes[i], nodes[j])) moved = true;
      }
    }
    if (!moved) break;
    changed = true;
    applyNodePositions();
  }
  return changed;
}

function finishMapLayout({ persist = true } = {}) {
  requestAnimationFrame(() => {
    const fixed = resolveOverlaps();
    redraw();
    fit();
    if (fixed && persist) savePositions();
  });
}

function anchors(a, b) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? [{ x: a.x + a.w, y: acy, h: true }, { x: b.x, y: bcy, h: true }]
      : [{ x: a.x, y: acy, h: true }, { x: b.x + b.w, y: bcy, h: true }];
  }
  return dy >= 0
    ? [{ x: acx, y: a.y + a.h, h: false }, { x: bcx, y: b.y, h: false }]
    : [{ x: acx, y: a.y, h: false }, { x: bcx, y: b.y + b.h, h: false }];
}

function roundedPath(pts, r) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1;
    const l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1x = cx - ((cx - px) / l1) * rr;
    const p1y = cy - ((cy - py) / l1) * rr;
    const p2x = cx + ((nx - cx) / l2) * rr;
    const p2y = cy + ((ny - cy) / l2) * rr;
    d += ` L ${p1x} ${p1y} Q ${cx} ${cy} ${p2x} ${p2y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function drawEdges() {
  for (const { e, path } of edgeEls) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [s, t] = anchors(rect(a), rect(b));
    let pts;
    if (s.h) {
      const mx = (s.x + t.x) / 2;
      pts = [[s.x, s.y], [mx, s.y], [mx, t.y], [t.x, t.y]];
    } else {
      const my = (s.y + t.y) / 2;
      pts = [[s.x, s.y], [s.x, my], [t.x, my], [t.x, t.y]];
    }
    path.setAttribute('d', roundedPath(pts, 10));
  }
  for (const { e, lab } of labelEls) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [s, t] = anchors(rect(a), rect(b));
    lab.style.left = `${(s.x + t.x) / 2}px`;
    lab.style.top = `${(s.y + t.y) / 2}px`;
  }
}

function drawGroups() {
  for (const g of MAP.groups) {
    const ms = g.members.map((id) => byId.get(id)).filter(Boolean);
    if (!ms.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of ms) {
      const r = rect(n);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const pad = 22;
    const el = groupEls.get(g.id);
    el.style.left = `${minX - pad}px`;
    el.style.top = `${minY - pad}px`;
    el.style.width = `${maxX - minX + pad * 2}px`;
    el.style.height = `${maxY - minY + pad * 2}px`;
  }
}

function applyWorld() {
  world.style.transform = `translate(${panX}px, ${panY}px) scale(${z})`;
  wrap.style.backgroundSize = `${GRID * 2 * z}px ${GRID * 2 * z}px`;
  wrap.style.backgroundPosition = `${panX}px ${panY}px`;
}

function redraw() {
  drawGroups();
  drawEdges();
  applyWorld();
}

// ---- node dragging ----
function attachDrag(n, el) {
  el.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    try { el.setPointerCapture(ev.pointerId); } catch {}
    el.classList.add('dragging');
    const start = toWorld(ev.clientX, ev.clientY);
    const offX = start.x - n.x;
    const offY = start.y - n.y;

    const move = (e) => {
      const p = toWorld(e.clientX, e.clientY);
      n.x = snap(p.x - offX);
      n.y = snap(p.y - offY);
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      drawGroups();
      drawEdges();
    };
    const up = () => {
      el.classList.remove('dragging');
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      savePositions();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

// ---- group dragging (move every member node together, Railway-style) ----
function attachGroupDrag(g, handle) {
  handle.addEventListener('pointerdown', (ev) => {
    const members = g.members.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) return;
    ev.stopPropagation();
    try { handle.setPointerCapture(ev.pointerId); } catch {}
    handle.classList.add('dragging');
    const start = toWorld(ev.clientX, ev.clientY);
    const origins = members.map((n) => ({ n, x: n.x, y: n.y }));

    const move = (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const dx = snap(p.x - start.x);
      const dy = snap(p.y - start.y);
      for (const o of origins) {
        o.n.x = o.x + dx;
        o.n.y = o.y + dy;
        const el = nodeEls.get(o.n.id);
        el.style.left = `${o.n.x}px`;
        el.style.top = `${o.n.y}px`;
      }
      drawGroups();
      drawEdges();
    };
    const up = () => {
      handle.classList.remove('dragging');
      try { handle.releasePointerCapture(ev.pointerId); } catch {}
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      savePositions();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

// ---- pan + pinch-zoom ----
// _canvasPtrs tracks all active pointers on the canvas background so the
// single-pointer pan handler can yield to a two-finger pinch when PINCH_ZOOM
// is true. Flip the constant to false to disable pinch gestures entirely.
const _canvasPtrs = new Map(); // pointerId → current { x, y }
let _pinchDist = null;         // baseline finger distance when a pinch begins

wrap.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.node')) return;
  _canvasPtrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

  if (_canvasPtrs.size === 1) {
    wrap.classList.add('panning');
    const sx = ev.clientX - panX;
    const sy = ev.clientY - panY;
    const move = (e) => {
      if (_canvasPtrs.size >= 2) return; // yield to pinch
      panX = e.clientX - sx;
      panY = e.clientY - sy;
      applyWorld();
    };
    const up = () => {
      wrap.classList.remove('panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  } else if (PINCH_ZOOM && _canvasPtrs.size === 2) {
    wrap.classList.remove('panning');
    const pts = [..._canvasPtrs.values()];
    _pinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }
});

wrap.addEventListener('pointermove', (ev) => {
  if (!PINCH_ZOOM || !_canvasPtrs.has(ev.pointerId) || _canvasPtrs.size < 2) return;
  _canvasPtrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!_pinchDist) return;
  const pts = [..._canvasPtrs.values()];
  const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const factor = clamp(newDist / _pinchDist, 0.85, 1.15);
  const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  zoomAt(factor, mid.x, mid.y);
  _pinchDist = newDist;
});

wrap.addEventListener('pointerup', (ev) => {
  _canvasPtrs.delete(ev.pointerId);
  if (_canvasPtrs.size < 2) _pinchDist = null;
});

wrap.addEventListener('pointercancel', (ev) => {
  _canvasPtrs.delete(ev.pointerId);
  if (_canvasPtrs.size < 2) _pinchDist = null;
});

// ---- zoom ----
function toWorld(clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  return { x: (clientX - r.left - panX) / z, y: (clientY - r.top - panY) / z };
}
function zoomAt(factor, clientX, clientY) {
  const r = wrap.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  const nz = clamp(z * factor, 0.2, 2.5);
  panX = x - (x - panX) * (nz / z);
  panY = y - (y - panY) * (nz / z);
  z = nz;
  applyWorld();
}
wrap.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    // Proportional, gentle zoom: smooth for trackpads, slower for mouse wheels.
    // Clamp per-event so a single big wheel tick can't jump too far.
    const factor = clamp(Math.exp(-e.deltaY * 0.0004), 0.95, 1.05);
    zoomAt(factor, e.clientX, e.clientY);
  },
  { passive: false }
);

function fit() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of byId.values()) {
    const r = rect(n);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = 60;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;
  z = clamp(Math.min(vw / cw, vh / ch), 0.2, 2.5);
  panX = (vw - cw * z) / 2 - (minX - pad) * z;
  panY = (vh - ch * z) / 2 - (minY - pad) * z;
  applyWorld();
}

// ---- toolbar ----
document.querySelectorAll('#tools button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    if (act === 'in') zoomAt(1.2, cx + wrap.getBoundingClientRect().left, cy + wrap.getBoundingClientRect().top);
    else if (act === 'out') zoomAt(1 / 1.2, cx + wrap.getBoundingClientRect().left, cy + wrap.getBoundingClientRect().top);
    else if (act === 'fit') fit();
  });
});
document.getElementById('reset')?.addEventListener('click', () => {
  localStorage.removeItem(storeKey());
  for (const n of byId.values()) {
    const orig = MAP.nodes.find((d) => d.id === n.id);
    if (!orig) continue;
    n.x = orig.x;
    n.y = orig.y;
    const el = nodeEls.get(n.id);
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
  }
  finishMapLayout();
});

// ---- tabs ----
let tabDragMoved = false;
let tabOrderSaveTimer = null;

function tabOrderStoreKey() {
  return userId ? `${TAB_ORDER_STORE}:${userId}` : TAB_ORDER_STORE;
}

function isMobileTabs() {
  return MOBILE_TABS_MQ.matches;
}

function isCompactTabs() {
  return COMPACT_TABS_MQ.matches;
}

/** Expand mobile-only dropdown slots back to persisted tab keys. */
function storedTabOrderKeys(keys) {
  const out = [];
  for (const raw of keys) {
    if (raw === CHAT_TAB_SLOT) {
      out.push('chats', 'knowledge');
    } else {
      out.push(raw);
    }
  }
  return normalizeTabOrderKeys(out);
}

/** Collapse Chats+Knowledge into one slot on phone only; hide Finance on mobile. */
function effectiveTabOrder(order) {
  const normalized = normalizeTabOrderKeys(order);
  if (!isMobileTabs()) return normalized;

  const out = [];
  let chatSlot = false;
  for (const key of normalized) {
    if (key === 'knowledge' || key === 'chats') {
      if (!chatSlot) {
        out.push(CHAT_TAB_SLOT);
        chatSlot = true;
      }
      continue;
    }
    if (key === 'finance') continue;
    out.push(key);
  }
  return out;
}

function defaultTabKeys() {
  const configured = installFooterNav();
  if (configured) return normalizeFooterNavKeys(configured);
  const keys = Object.keys(MAPS).filter((k) => !SYSTEM_MAP_SET.has(k));
  return [SYSTEM_TAB_SLOT, ...keys];
}

function normalizeTabOrderKeys(saved) {
  const baseline = defaultTabKeys();
  const allowed = new Set(baseline);
  const strict = Boolean(installFooterNav());

  if (!Array.isArray(saved)) return baseline;

  const result = [];
  let systemSlot = false;

  for (const raw of saved) {
    if (typeof raw !== 'string') continue;
    if (SYSTEM_MAP_SET.has(raw) || raw === SYSTEM_TAB_SLOT) {
      if (!systemSlot && allowed.has(SYSTEM_TAB_SLOT)) {
        result.push(SYSTEM_TAB_SLOT);
        systemSlot = true;
      }
      continue;
    }
    if (raw === CHAT_TAB_SLOT) {
      if (allowed.has(CHAT_TAB_SLOT) && !result.includes(CHAT_TAB_SLOT)) {
        result.push(CHAT_TAB_SLOT);
      }
      continue;
    }
    if (MAPS[raw] && allowed.has(raw) && !result.includes(raw)) result.push(raw);
  }

  if (!systemSlot && allowed.has(SYSTEM_TAB_SLOT)) result.unshift(SYSTEM_TAB_SLOT);

  if (strict) {
    return result.length ? result : baseline;
  }

  for (const k of baseline) {
    if (!result.includes(k)) result.push(k);
  }
  return result;
}

function loadTabOrderFromLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(tabOrderStoreKey()) || 'null');
    return normalizeTabOrderKeys(saved);
  } catch {
    return defaultTabKeys();
  }
}

async function fetchTabOrderFromServer() {
  if (!userId) return null;
  try {
    const res = await fetch('/api/os-map/tab-order', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.tabOrder) ? normalizeTabOrderKeys(data.tabOrder) : null;
  } catch {
    return null;
  }
}

async function resolveTabOrder() {
  const server = await fetchTabOrderFromServer();
  if (server) {
    try {
      localStorage.setItem(tabOrderStoreKey(), JSON.stringify(server));
    } catch {}
    return server;
  }
  return loadTabOrderFromLocal();
}

function saveTabOrder(keys) {
  const normalized = storedTabOrderKeys(keys);
  try {
    localStorage.setItem(tabOrderStoreKey(), JSON.stringify(normalized));
  } catch {}
  if (!userId) return;
  clearTimeout(tabOrderSaveTimer);
  tabOrderSaveTimer = setTimeout(() => {
    fetch('/api/os-map/tab-order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabOrder: normalized }),
    }).catch(() => {});
  }, 500);
}

function currentTabOrderFromDom() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return defaultTabKeys();
  const raw = [...tabs.querySelectorAll(':scope > [data-tab-key]')]
    .map((el) => el.dataset.tabKey)
    .filter(Boolean);
  return storedTabOrderKeys(raw);
}

function clearTabDropHints() {
  document.querySelectorAll('#tabs .tab-drop-before, #tabs .tab-drop-after').forEach((el) => {
    el.classList.remove('tab-drop-before', 'tab-drop-after');
  });
}

function tabSiblings(tabs, el) {
  return [...tabs.querySelectorAll(':scope > [data-tab-key]')].filter((node) => node !== el);
}

function repositionTabByPointer(el, pointerX) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;

  clearTabDropHints();
  const siblings = tabSiblings(tabs, el);
  if (!siblings.length) return;

  for (const sib of siblings) {
    const rect = sib.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    if (pointerX < mid) {
      tabs.insertBefore(el, sib);
      sib.classList.add('tab-drop-before');
      return;
    }
  }

  tabs.appendChild(el);
  siblings[siblings.length - 1]?.classList.add('tab-drop-after');
}

function attachTabPointerReorder(el) {
  const grip = el.querySelector('.tab-grip');
  if (!grip) return;

  grip.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    tabDragMoved = false;
    el.classList.add('tab-dragging');

    function onMove(moveEv) {
      tabDragMoved = true;
      repositionTabByPointer(el, moveEv.clientX);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('tab-dragging');
      clearTabDropHints();
      if (tabDragMoved) saveTabOrder(currentTabOrderFromDom());
      setTimeout(() => { tabDragMoved = false; }, 0);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function tabInnerHtml(key, m) {
  const label = `<span class="tab-icon">${navIcon(mapIconName(key), 16)}</span><span class="tab-label">${m.title}</span>`;
  return `<span class="tab-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>${label}`;
}

function resetMobileTabDropdown(wrap) {
  const menu = wrap?.querySelector('.tab-dropdown-menu');
  if (!menu) return;
  menu.style.position = '';
  menu.style.top = '';
  menu.style.left = '';
  menu.style.right = '';
  menu.style.zIndex = '';
}

function positionTabDropdownMenu(wrap) {
  const menu = wrap.querySelector('.tab-dropdown-menu');
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!menu || !trigger) return;
  requestAnimationFrame(() => {
    const rect = trigger.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.right = 'auto';
    menu.style.zIndex = '10000';
  });
}

function closeTabDropdowns(except) {
  document.querySelectorAll('.tab-dropdown.open').forEach((dd) => {
    if (dd !== except) {
      dd.classList.remove('open');
      resetMobileTabDropdown(dd);
    }
  });
}

/** Dropdown tab: go to default sub-tab, reload if already there, else open sub-menu. */
function attachDropdownTriggerClick(wrap, mapSet, defaultKey) {
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!trigger) return;

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (tabDragMoved) return;

    if (!mapSet.has(activeKey)) {
      setActiveMap(defaultKey);
      return;
    }
    if (activeKey === defaultKey) {
      setActiveMap(defaultKey, { force: true });
      closeTabDropdowns();
      return;
    }

    const willOpen = !wrap.classList.contains('open');
    closeTabDropdowns(willOpen ? wrap : null);
    wrap.classList.toggle('open', willOpen);
    if (willOpen) positionTabDropdownMenu(wrap);
    else resetMobileTabDropdown(wrap);
  });
}

function buildSystemDropdownTab() {
  const wrap = document.createElement('div');
  wrap.className = 'tab-item tab-dropdown';
  wrap.dataset.tabKey = SYSTEM_TAB_SLOT;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tab-dropdown-trigger';
  trigger.innerHTML = `${tabInnerHtml('system', MAPS.system)}<span class="tab-caret" aria-hidden="true">▾</span>`;
  trigger.title = 'System — runtime and MCP & CLI';

  const menu = document.createElement('div');
  menu.className = 'tab-dropdown-menu';
  menu.setAttribute('role', 'menu');

  for (const key of SYSTEM_MAP_KEYS) {
    const m = MAPS[key];
    if (!m) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tab-dropdown-item';
    item.dataset.map = key;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `<span class="tab-icon">${navIcon(mapIconName(key), 16)}</span><span class="tab-label">${m.title}</span>`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key);
      closeTabDropdowns();
    });
    menu.appendChild(item);
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  attachDropdownTriggerClick(wrap, SYSTEM_MAP_SET, 'system');
  attachTabPointerReorder(wrap);
  return wrap;
}

function buildChatDropdownTab() {
  const wrap = document.createElement('div');
  wrap.className = 'tab-item tab-dropdown tab-dropdown--chat';
  wrap.dataset.tabKey = CHAT_TAB_SLOT;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tab-dropdown-trigger';
  trigger.innerHTML = `${tabInnerHtml('chats', MAPS.chats)}<span class="tab-caret" aria-hidden="true">▾</span>`;
  trigger.title = 'Chats — tap to open; hold for Chats & Knowledge menu';

  const menu = document.createElement('div');
  menu.className = 'tab-dropdown-menu';
  menu.setAttribute('role', 'menu');

  for (const key of CHAT_MAP_KEYS) {
    const m = MAPS[key];
    if (!m) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tab-dropdown-item';
    item.dataset.map = key;
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `<span class="tab-icon">${navIcon(mapIconName(key), 16)}</span><span class="tab-label">${m.title}</span>`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActiveMap(key);
      closeTabDropdowns();
    });
    menu.appendChild(item);
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  attachChatDropdownTriggerClick(wrap);
  attachTabPointerReorder(wrap);
  return wrap;
}

/** Phone-only merged tab: tap always opens Chats; long-press opens Chats/Knowledge menu. */
function attachChatDropdownTriggerClick(wrap) {
  const trigger = wrap.querySelector('.tab-dropdown-trigger');
  if (!trigger) return;

  let longPressTimer = null;
  let longPressFired = false;

  function openSubmenu() {
    const willOpen = !wrap.classList.contains('open');
    closeTabDropdowns(willOpen ? wrap : null);
    wrap.classList.toggle('open', willOpen);
    if (willOpen) positionTabDropdownMenu(wrap);
    else resetMobileTabDropdown(wrap);
  }

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (tabDragMoved || longPressFired) {
      longPressFired = false;
      return;
    }
    setActiveMap('chats', { force: activeKey === 'chats' });
    closeTabDropdowns();
  });

  trigger.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    longPressFired = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      openSubmenu();
    }, 500);
  });

  function cancelLongPress() {
    clearTimeout(longPressTimer);
  }
  trigger.addEventListener('pointerup', cancelLongPress);
  trigger.addEventListener('pointerleave', cancelLongPress);
  trigger.addEventListener('pointercancel', cancelLongPress);
}

function buildMapTab(key, m) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.dataset.tabKey = key;
  item.dataset.map = key;
  item.innerHTML = tabInnerHtml(key, m);
  item.title = `${m.title} — drag ⋮⋮ to reorder`;
  item.addEventListener('click', (ev) => {
    if (tabDragMoved || ev.target.closest('.tab-grip')) return;
    setActiveMap(key, { force: key === activeKey && isPanelMapKey(key) });
  });
  attachTabPointerReorder(item);
  return item;
}

function buildLinkTab(key, m) {
  const item = document.createElement('div');
  item.className = 'tab-item tab-link';
  item.dataset.tabKey = key;

  const a = document.createElement('a');
  a.href = m.link;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.innerHTML = tabInnerHtml(key, m);
  a.title = `${m.title} — drag ⋮⋮ to reorder`;
  a.addEventListener('click', (ev) => {
    if (tabDragMoved) ev.preventDefault();
  });

  item.appendChild(a);
  attachTabPointerReorder(item);
  return item;
}

function buildTabs(order) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  tabs.title = isCompactTabs()
    ? 'Tabs — scroll sideways if needed'
    : 'Drag ⋮⋮ on a tab to reorder';

  for (const key of effectiveTabOrder(order)) {
    if (key === SYSTEM_TAB_SLOT) {
      tabs.appendChild(buildSystemDropdownTab());
      continue;
    }
    if (key === CHAT_TAB_SLOT) {
      tabs.appendChild(buildChatDropdownTab());
      continue;
    }
    const m = MAPS[key];
    if (!m) continue;
    tabs.appendChild(m.link ? buildLinkTab(key, m) : buildMapTab(key, m));
  }
  updateTabs();
}

function updateTabs() {
  document.querySelectorAll('#tabs .tab-item[data-map]').forEach((el) => {
    el.classList.toggle('active', el.dataset.map === activeKey);
  });

  document.querySelectorAll('#tabs .tab-dropdown').forEach((dropdown) => {
    const slot = dropdown.dataset.tabKey;
    dropdown.querySelectorAll('.tab-dropdown-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.map === activeKey);
    });

    const trigger = dropdown.querySelector('.tab-dropdown-trigger');
    if (!trigger) return;

    if (slot === SYSTEM_TAB_SLOT) {
      dropdown.classList.toggle('active', SYSTEM_MAP_SET.has(activeKey));
      trigger.innerHTML = `${tabInnerHtml('system', MAPS.system)}<span class="tab-caret" aria-hidden="true">▾</span>`;
      return;
    }

    if (slot === CHAT_TAB_SLOT) {
      dropdown.classList.toggle('active', CHAT_MAP_SET.has(activeKey));
      const headKey = CHAT_MAP_SET.has(activeKey) ? activeKey : 'chats';
      const head = MAPS[headKey];
      trigger.innerHTML = `${tabInnerHtml(headKey, head)}<span class="tab-caret" aria-hidden="true">▾</span>`;
    }
  });

  document.querySelectorAll('#topbar-tools-menu .topbar-dropdown-item[data-map]').forEach((item) => {
    item.classList.toggle('active', item.dataset.map === activeKey);
  });
}

/** Flat tab keys for the mobile wrench menu (all sections, no collapsed slots). */
function wrenchMenuTabKeys(order) {
  const out = [];
  for (const key of normalizeTabOrderKeys(order)) {
    if (key === SYSTEM_TAB_SLOT) {
      for (const k of SYSTEM_MAP_KEYS) {
        if (!out.includes(k)) out.push(k);
      }
      continue;
    }
    if (MAPS[key] && !out.includes(key)) out.push(key);
  }
  return out;
}

function closeTopbarMenus(exceptMenu) {
  for (const menu of document.querySelectorAll('.topbar-dropdown')) {
    if (exceptMenu && menu === exceptMenu) continue;
    menu.classList.remove('open');
  }
  document.getElementById('topbar-tools-toggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('topbar-profile-toggle')?.setAttribute('aria-expanded', 'false');
  syncFooterNav();
}

function toggleTopbarMenu(menuEl, toggleEl) {
  if (!menuEl || !toggleEl) return;
  const willOpen = !menuEl.classList.contains('open');
  closeTopbarMenus(null);
  if (willOpen) {
    menuEl.classList.add('open');
    toggleEl.setAttribute('aria-expanded', 'true');
  }
  syncFooterNav();
}

function dashboardSectionItems(order) {
  const items = [];
  for (const key of wrenchMenuTabKeys(order || cachedTabOrder || defaultTabKeys())) {
    const m = MAPS[key];
    if (!m) continue;
    items.push({
      kind: m.link ? 'link' : 'map',
      key,
      label: m.title,
      icon: mapIconName(key),
      href: m.link || null,
    });
  }
  return items;
}

function buildHomeMapTile(key, m) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'home-dashboard-tile';
  tile.innerHTML =
    `<span class="home-dashboard-tile-icon">${navIcon(mapIconName(key))}</span>` +
    `<span class="home-dashboard-tile-label">${escHtml(m.title)}</span>`;
  tile.addEventListener('click', () => {
    setActiveMap(key, { force: key === activeKey && isPanelMapKey(key) });
  });
  return tile;
}

function buildHomeLinkTile(item) {
  const tile = document.createElement('a');
  tile.className = 'home-dashboard-tile';
  tile.href = item.href;
  if (item.href.startsWith('http')) {
    tile.target = '_blank';
    tile.rel = 'noopener noreferrer';
  }
  tile.innerHTML =
    `<span class="home-dashboard-tile-icon">${navIcon(item.icon)}</span>` +
    `<span class="home-dashboard-tile-label">${escHtml(item.label)}</span>`;
  return tile;
}

function buildDashStat(opts) {
  const { value, label, hint, onClick, tone, muted } = opts;
  const el = document.createElement(muted ? 'div' : 'button');
  if (!muted) el.type = 'button';
  el.className = `dash-stat${tone ? ` dash-stat--${tone}` : ''}${muted ? ' dash-stat--muted' : ''}`;
  el.innerHTML =
    `<span class="dash-stat-value">${escHtml(String(value))}</span>` +
    `<span class="dash-stat-label">${escHtml(label)}</span>` +
    (hint ? `<span class="dash-stat-hint">${escHtml(hint)}</span>` : '');
  if (!muted && onClick) el.addEventListener('click', onClick);
  return el;
}

function deployStatLabel(state) {
  if (state === 'live') return 'Live';
  if (state === 'stale') return 'Stale';
  if (state === 'deploying') return 'Deploying';
  if (state === 'failed') return 'Failed';
  return 'Unknown';
}

function deployStatTone(state) {
  if (state === 'live') return 'live';
  if (state === 'failed') return 'failed';
  if (state === 'stale' || state === 'deploying') return 'stale';
  return null;
}

function formatDashMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function openFinanceCrater() {
  const href = MAPS.finance?.link;
  if (href) window.open(href, '_blank', 'noopener,noreferrer');
}

function formatEventTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatEmailWhen(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatUptimeAccountHint(uptimeAccount) {
  if (!uptimeAccount) return null;
  if (uptimeAccount.account) {
    const a = uptimeAccount.account;
    const remote = `${a.monitorCount}/${a.monitorLimit} monitors in UptimeRobot`;
    const local = uptimeAccount.localTotal;
    if (local != null && local !== a.monitorCount) {
      return `${remote} · ${local} cached locally`;
    }
    return remote;
  }
  const local = uptimeAccount.localTotal;
  if (local != null) {
    return `${local} monitors cached locally`;
  }
  if (uptimeAccount.error && !/rate limit|cooldown|retry in/i.test(uptimeAccount.error)) {
    return `UptimeRobot: ${uptimeAccount.error}`;
  }
  return null;
}

let uptimePlatformSyncPollTimer = null;
let uptimePlatformSyncActive = false;

const UPTIME_SYNC_SITES_BTN_SELECTOR = '.dash-uptime-sync-sites-btn';

function getUptimeSyncSitesButton() {
  return document.querySelector(UPTIME_SYNC_SITES_BTN_SELECTOR);
}

function setUptimeSyncButtonBusy(busy, status) {
  const syncBtn = getUptimeSyncSitesButton();
  if (!syncBtn) return;
  syncBtn.classList.toggle('dash-uptime-tile--syncing', busy);
  syncBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
  const nameEl = syncBtn.querySelector('.dash-uptime-name');
  if (!nameEl) return;
  if (!busy) {
    nameEl.textContent = 'Sync sites';
    return;
  }
  if (status?.created > 0) {
    nameEl.textContent = `Syncing… ${status.created} added`;
  } else if (status?.phase === 'discovering') {
    nameEl.textContent = 'Finding sites…';
  } else {
    nameEl.textContent = 'Syncing sites…';
  }
}

function stopUptimePlatformSyncPolling() {
  if (uptimePlatformSyncPollTimer != null) {
    clearInterval(uptimePlatformSyncPollTimer);
    uptimePlatformSyncPollTimer = null;
  }
}

function ensureUptimePlatformSyncPolling() {
  if (uptimePlatformSyncPollTimer != null) return;

  const poll = async () => {
    try {
      const res = await fetch('/api/uptime/sync/status');
      const data = await res.json().catch(() => null);
      if (!data?.ok) return;

      if (data.running) {
        uptimePlatformSyncActive = true;
        setUptimeSyncButtonBusy(true, data);
        return;
      }

      stopUptimePlatformSyncPolling();
      uptimePlatformSyncActive = false;
      setUptimeSyncButtonBusy(false);
      const created = data.created ?? data.result?.created ?? 0;
      window.setTimeout(() => {
        void loadHomeDashboard();
      }, created > 0 ? 6000 : 2500);
    } catch {
      /* ignore transient poll errors while job runs */
    }
  };

  void poll();
  uptimePlatformSyncPollTimer = setInterval(poll, 3000);
}

async function refreshUptimeSyncButtonState() {
  try {
    const res = await fetch('/api/uptime/sync/status');
    const data = await res.json().catch(() => null);
    if (!data?.ok) return;
    if (data.running) {
      uptimePlatformSyncActive = true;
      setUptimeSyncButtonBusy(true, data);
      ensureUptimePlatformSyncPolling();
    } else {
      uptimePlatformSyncActive = false;
      setUptimeSyncButtonBusy(false);
    }
  } catch {
    /* ignore */
  }
}

function renderUptimeSyncResultHtml(data, httpOk) {
  if (data?.started) {
    return (
      '<p class="em-book-dialog-lead">Site sync is running in the background. ' +
      'The <strong>Sync sites</strong> button shows progress — refresh the page if it still looks idle.</p>'
    );
  }

  const created = data?.created ?? 0;
  const skipped = data?.skipped ?? 0;
  const discovered = data?.discovered ?? 0;
  const pending = data?.pending ?? 0;

  const createdLines = (data.createdItems || [])
    .slice(0, 12)
    .map((item) => `<li>${escHtml(item.friendlyName)} <span class="dash-muted-inline">(${escHtml(item.source)})</span></li>`)
    .join('');
  const warningLines = (data.warnings || [])
    .slice(0, 8)
    .map((msg) => `<li>${escHtml(msg)}</li>`)
    .join('');
  const errorLines = (data.errors || [])
    .slice(0, 8)
    .map((msg) => `<li>${escHtml(msg)}</li>`)
    .join('');

  const pendingNote = pending > 0
    ? ` · <strong>${pending}</strong> pending (run again to continue)`
    : '';

  const accountLine = data.account
    ? `<p class="dash-muted-inline">UptimeRobot account: <strong>${data.account.monitorCount}/${data.account.monitorLimit}</strong> monitors used` +
      (data.localMonitorCount != null ? ` · ${data.localMonitorCount} cached locally` : '') +
      `</p>`
    : '';

  const partial = (data.created ?? 0) > 0 || (data.pending ?? 0) > 0;
  const failLead = (!httpOk || data.ok === false) && !partial
    ? '<p class="dash-empty">Sync did not complete successfully.</p>'
    : partial && data.ok === false
      ? '<p class="dash-muted-inline">Partial sync — run again in about a minute to continue.</p>'
    : '';

  return (
    failLead +
    accountLine +
    `<p><strong>${created}</strong> added · <strong>${skipped}</strong> already monitored · <strong>${discovered}</strong> found${pendingNote}</p>` +
    (createdLines ? `<ul class="meeting-confirm-steps">${createdLines}</ul>` : '') +
    (warningLines ? `<p class="dash-empty">Warnings</p><ul class="meeting-confirm-steps">${warningLines}</ul>` : '') +
    (errorLines ? `<p class="dash-empty">Errors</p><ul class="meeting-confirm-steps">${errorLines}</ul>` : '')
  );
}

async function runReviewScheduleAction(item, action, btn) {
  const ev = emailState.allEvents.find((e) => e.id === item.emailId) || {
    id: item.emailId,
    from: item.from,
    contactName: item.attendeeName,
  };
  await runEmailScheduleAction(ev, action, btn);
  updateInboxBadgesFromState();
  if (MAP.type === 'home') await loadHomeDashboard();
}

async function dismissReviewNotification(item, btn) {
  if (!item?.emailId) return;
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    if (prevLabel) btn.textContent = 'Dismissing…';
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(item.emailId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAutomationAck: true }),
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === item.emailId);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }
    updateInboxBadgesFromState();
    removeReviewAlertBanner(item.emailId);
    if (MAP.type === 'home') await loadHomeDashboard();
    if (emailState.activeId === item.emailId) renderEmailPanel();
  } catch (e) {
    await osAlert({ title: 'Could not dismiss', bodyHtml: escHtml(e.message || String(e)) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

function setMeetingConfirmStep(bodyEl, stepKey, state, title, detail) {
  const step = bodyEl.querySelector(`[data-step="${stepKey}"]`);
  if (!step) return;
  step.className = `meeting-confirm-step meeting-confirm-step--${state}`;
  step.setAttribute('data-state', state);
  const icon = step.querySelector('.meeting-confirm-step-icon');
  if (icon) {
    icon.textContent = state === 'done' ? '✓' : state === 'active' ? '…' : state === 'error' ? '!' : '○';
  }
  const titleEl = step.querySelector('.meeting-confirm-step-title');
  if (titleEl) titleEl.textContent = title;
  const detailEl = step.querySelector('.meeting-confirm-step-detail');
  if (detailEl) detailEl.textContent = detail || '';
  else if (detail) {
    const copy = step.querySelector('.meeting-confirm-step-copy');
    const el = document.createElement('div');
    el.className = 'meeting-confirm-step-detail';
    el.textContent = detail;
    copy?.appendChild(el);
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inboxEventForMeetingItem(item) {
  const found = emailState.allEvents.find((e) => e.id === item.emailId);
  if (found) return found;
  return {
    id: item.emailId,
    from: item.from || '',
    subject: item.subject || '',
    contactUid: item.contactUid || null,
    contactName: item.contactName || null,
    jobSlug: item.jobSlug || null,
    jobTitle: item.jobTitle || null,
  };
}

async function fetchMeetingProjectPrepare(item) {
  const res = await fetch(`/api/email/inbox/${encodeURIComponent(item.emailId)}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prepare-project' }),
  });
  const data = await readApiJson(res);
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function meetingConfirmProjectPanelHtml(prep) {
  const name = prep.linked ? prep.jobTitle : prep.proposedTitle;
  const meta = prep.linked
    ? 'Already linked to this meeting email'
    : 'A new project will be created with this title';
  return (
    `<div class="meeting-confirm-project">` +
      `<div class="meeting-confirm-project-name">${escHtml(name || 'Project')}</div>` +
      `<div class="meeting-confirm-project-meta">${escHtml(meta)}</div>` +
      `<div class="meeting-confirm-project-actions">` +
        `<button type="button" class="os-dialog-btn os-dialog-btn--primary meeting-confirm-project-use">` +
          `${prep.linked ? 'Use this project' : 'Create &amp; use this project'}` +
        `</button>` +
        `<button type="button" class="os-dialog-btn os-dialog-btn--ghost meeting-confirm-project-pick">Choose existing…</button>` +
        `<button type="button" class="os-dialog-btn os-dialog-btn--ghost meeting-confirm-project-new">Create new…</button>` +
      `</div>` +
      `<div class="meeting-confirm-project-picker" hidden>` +
        `<div class="meeting-confirm-project-picker-label">Open projects for this client</div>` +
        `<div class="meeting-confirm-project-picker-list"></div>` +
      `</div>` +
      `<div class="meeting-confirm-project-create" hidden>` +
        `<label class="meeting-confirm-project-create-label">Project title</label>` +
        `<input type="text" class="meeting-confirm-project-create-input" value="${escHtml(prep.proposedTitle || '')}" />` +
        `<button type="button" class="os-dialog-btn os-dialog-btn--primary meeting-confirm-project-create-btn">Create project</button>` +
      `</div>` +
      `<p class="meeting-confirm-project-error" hidden></p>` +
    `</div>`
  );
}

function mountMeetingConfirmProjectPicker(listEl, suggestions, onPick) {
  listEl.innerHTML = '';
  if (!suggestions.length) {
    listEl.innerHTML = '<div class="meeting-confirm-project-picker-empty">No open projects for this client</div>';
    return;
  }
  for (const job of suggestions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'meeting-confirm-project-picker-item';
    btn.innerHTML =
      `<span class="meeting-confirm-project-picker-title">${escHtml(job.title)}</span>` +
      `<span class="meeting-confirm-project-picker-meta">${escHtml(WORK_STATUS_LABELS[job.status] || job.status)}</span>`;
    btn.addEventListener('click', () => onPick(job));
    listEl.appendChild(btn);
  }
}

function waitForMeetingProjectChoice(bodyEl, item, prep) {
  return new Promise((resolve, reject) => {
    const step = bodyEl.querySelector('[data-step="project"]');
    if (!step) {
      reject(new Error('Project step not found'));
      return;
    }

    const copy = step.querySelector('.meeting-confirm-step-copy');
    if (!copy) {
      reject(new Error('Project step copy not found'));
      return;
    }

    copy.querySelector('.meeting-confirm-step-detail')?.remove();
    copy.insertAdjacentHTML('beforeend', meetingConfirmProjectPanelHtml(prep));

    const panel = copy.querySelector('.meeting-confirm-project');
    const useBtn = panel.querySelector('.meeting-confirm-project-use');
    const pickBtn = panel.querySelector('.meeting-confirm-project-pick');
    const newBtn = panel.querySelector('.meeting-confirm-project-new');
    const pickerWrap = panel.querySelector('.meeting-confirm-project-picker');
    const pickerList = panel.querySelector('.meeting-confirm-project-picker-list');
    const createWrap = panel.querySelector('.meeting-confirm-project-create');
    const createInput = panel.querySelector('.meeting-confirm-project-create-input');
    const createBtn = panel.querySelector('.meeting-confirm-project-create-btn');
    const errEl = panel.querySelector('.meeting-confirm-project-error');
    const ev = inboxEventForMeetingItem(item);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const showError = (message) => {
      if (!errEl) return;
      errEl.hidden = !message;
      errEl.textContent = message || '';
    };
    const setBusy = (busy) => {
      for (const btn of panel.querySelectorAll('button')) btn.disabled = busy;
    };

    function updateProjectDisplay(jobSlug, jobTitle, linked) {
      const nameEl = panel.querySelector('.meeting-confirm-project-name');
      const metaEl = panel.querySelector('.meeting-confirm-project-meta');
      if (nameEl) nameEl.textContent = jobTitle || jobSlug || 'Project';
      if (metaEl) {
        metaEl.textContent = linked
          ? 'Linked to this meeting email'
          : 'Selected for this meeting';
      }
      if (useBtn) {
        useBtn.textContent = linked ? 'Use this project' : 'Create & use this project';
      }
      prep.linked = Boolean(linked && jobSlug);
      prep.jobSlug = jobSlug;
      prep.jobTitle = jobTitle;
    }

    useBtn?.addEventListener('click', async () => {
      showError('');
      setBusy(true);
      try {
        if (prep.linked && prep.jobSlug) {
          finish({ jobSlug: prep.jobSlug, jobTitle: prep.jobTitle || prep.jobSlug });
          return;
        }
        const res = await fetch(`/api/email/inbox/${encodeURIComponent(item.emailId)}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'attach-project' }),
        });
        const data = await readApiJson(res);
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.event) {
          const idx = emailState.allEvents.findIndex((e) => e.id === item.emailId);
          if (idx !== -1) emailState.allEvents[idx] = data.event;
        }
        finish({ jobSlug: data.jobSlug, jobTitle: data.jobTitle || data.jobSlug });
      } catch (e) {
        showError(e.message || String(e));
        setBusy(false);
      }
    });

    pickBtn?.addEventListener('click', () => {
      createWrap.hidden = true;
      pickerWrap.hidden = !pickerWrap.hidden;
      if (!pickerWrap.hidden) {
        mountMeetingConfirmProjectPicker(pickerList, prep.suggestions || [], async (job) => {
          showError('');
          setBusy(true);
          try {
            const data = await postEmailProject(ev, { mode: 'link', slug: job.slug }, { skipNavigate: true });
            updateProjectDisplay(data.slug, data.title || job.title, true);
            pickerWrap.hidden = true;
            finish({ jobSlug: data.slug, jobTitle: data.title || job.title });
          } catch (e) {
            showError(e.message || String(e));
            setBusy(false);
          }
        });
      }
    });

    newBtn?.addEventListener('click', () => {
      pickerWrap.hidden = true;
      createWrap.hidden = !createWrap.hidden;
      if (!createWrap.hidden) createInput?.focus();
    });

    createBtn?.addEventListener('click', async () => {
      const title = String(createInput?.value || '').trim();
      if (!title) {
        showError('Enter a project title');
        createInput?.focus();
        return;
      }
      showError('');
      setBusy(true);
      try {
        const data = await postEmailProject(ev, { mode: 'create', title }, { skipNavigate: true });
        updateProjectDisplay(data.slug, data.title || title, true);
        createWrap.hidden = true;
        finish({ jobSlug: data.slug, jobTitle: data.title || title });
      } catch (e) {
        showError(e.message || String(e));
        setBusy(false);
      }
    });
  });
}

async function runMeetingConfirmChecklist(item) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return { ok: false, error: 'Dialog not available' };
  }

  const whenLabel = item.whenLabel || formatScheduleWhen(item.bookingStart);
  const attendeeLabel = item.attendeeName || item.attendeeEmail || item.from || 'Guest';
  const emailTarget = item.attendeeEmail || parseSenderEmail(item.from) || 'the sender';

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish({ ok: false, cancelled: true });
    };

    titleEl.textContent = 'Confirming meeting';
    bodyEl.innerHTML =
      `<p class="meeting-confirm-lead">Work through the checklist — confirm the project before sending the confirmation email.</p>` +
      `<ul class="meeting-confirm-steps">` +
        `<li class="meeting-confirm-step meeting-confirm-step--done" data-step="calendar" data-state="done">` +
          `<span class="meeting-confirm-step-icon" aria-hidden="true">✓</span>` +
          `<div class="meeting-confirm-step-copy">` +
            `<div class="meeting-confirm-step-title">Calendar booking finalized</div>` +
            `<div class="meeting-confirm-step-detail">${escHtml(whenLabel)} · ${escHtml(attendeeLabel)}</div>` +
          `</div>` +
        `</li>` +
        `<li class="meeting-confirm-step meeting-confirm-step--active" data-step="project" data-state="active">` +
          `<span class="meeting-confirm-step-icon" aria-hidden="true">…</span>` +
          `<div class="meeting-confirm-step-copy">` +
            `<div class="meeting-confirm-step-title">Link to a project</div>` +
            `<div class="meeting-confirm-step-detail">Confirm or choose the project for this meeting</div>` +
          `</div>` +
        `</li>` +
        `<li class="meeting-confirm-step meeting-confirm-step--pending" data-step="email" data-state="pending">` +
          `<span class="meeting-confirm-step-icon" aria-hidden="true">○</span>` +
          `<div class="meeting-confirm-step-copy">` +
            `<div class="meeting-confirm-step-title">Send confirmation email</div>` +
            `<div class="meeting-confirm-step-detail">Notifying ${escHtml(emailTarget)}</div>` +
          `</div>` +
        `</li>` +
        `<li class="meeting-confirm-step meeting-confirm-step--pending" data-step="review" data-state="pending">` +
          `<span class="meeting-confirm-step-icon" aria-hidden="true">○</span>` +
          `<div class="meeting-confirm-step-copy">` +
            `<div class="meeting-confirm-step-title">Clear from your review list</div>` +
            `<div class="meeting-confirm-step-detail">Removes this from your review list</div>` +
          `</div>` +
        `</li>` +
      `</ul>` +
      `<p class="meeting-confirm-error" id="meeting-confirm-error" hidden></p>`;
    actionsEl.innerHTML = '';

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish({ ok: false, cancelled: true }), true);
    document.addEventListener('keydown', onKey);

    void (async () => {
      try {
        const prep = await fetchMeetingProjectPrepare(item);
        const project = await waitForMeetingProjectChoice(bodyEl, item, prep);

        const projectStep = bodyEl.querySelector('[data-step="project"]');
        projectStep?.querySelector('.meeting-confirm-project')?.remove();
        setMeetingConfirmStep(
          bodyEl,
          'project',
          'done',
          prep.linked ? 'Project linked' : 'Project confirmed',
          project.jobTitle || project.jobSlug,
        );
        await sleepMs(300);

        setMeetingConfirmStep(bodyEl, 'email', 'active', 'Sending confirmation email', `Notifying ${escHtml(emailTarget)}`);

        const res = await fetch(`/api/email/inbox/${encodeURIComponent(item.emailId)}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm' }),
        });
        const data = await readApiJson(res);
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

        const sentTo = data.attendeeEmail || emailTarget;
        setMeetingConfirmStep(
          bodyEl,
          'email',
          'done',
          'Confirmation email sent',
          `Reply delivered to ${sentTo}`,
        );
        await sleepMs(350);
        setMeetingConfirmStep(
          bodyEl,
          'review',
          'done',
          'Review cleared',
          'Removed from your review list on the dashboard',
        );

        if (data.event) {
          const idx = emailState.allEvents.findIndex((e) => e.id === item.emailId);
          if (idx !== -1) emailState.allEvents[idx] = data.event;
        }
        updateInboxBadgesFromState();
        removeReviewAlertBanner(item.emailId);
        if (emailState.activeId === item.emailId) renderEmailPanel();

        titleEl.textContent = 'Meeting confirmed';
        bodyEl.querySelector('.meeting-confirm-lead')?.remove();

        actionsEl.innerHTML = '';
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'os-dialog-btn os-dialog-btn--primary';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', () => {
          finish({ ok: true, data, project });
        });
        if (project.jobSlug) {
          const viewBtn = document.createElement('button');
          viewBtn.type = 'button';
          viewBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
          viewBtn.textContent = 'View project';
          viewBtn.addEventListener('click', () => {
            finish({ ok: true, data, project, openProject: true });
            navigateToWork(project.jobSlug, { fromEmailId: item.emailId });
          });
          actionsEl.appendChild(viewBtn);
        }
        actionsEl.appendChild(doneBtn);
      } catch (e) {
        if (e?.cancelled) {
          finish({ ok: false, cancelled: true });
          return;
        }
        const projectFailed = bodyEl.querySelector('[data-step="project"][data-state="active"]');
        if (projectFailed) {
          setMeetingConfirmStep(
            bodyEl,
            'project',
            'error',
            'Project link required',
            e.message || String(e),
          );
          setMeetingConfirmStep(bodyEl, 'email', 'pending', 'Send confirmation email', 'Waiting…');
        } else {
          setMeetingConfirmStep(
            bodyEl,
            'email',
            'error',
            'Confirmation email failed',
            e.message || String(e),
          );
        }
        setMeetingConfirmStep(bodyEl, 'review', 'pending', 'Clear from your review list', 'Waiting…');
        titleEl.textContent = 'Could not confirm';
        actionsEl.innerHTML = '';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => finish({ ok: false, error: e.message }));
        actionsEl.appendChild(closeBtn);
      }
    })();
  });
}

async function confirmScheduledMeeting(item, btn) {
  if (!item?.emailId) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Confirming…';
  }
  const result = await runMeetingConfirmChecklist(item);
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Confirm';
  }
  if (!result.ok && !result.cancelled && result.error) {
    await osAlert({ title: 'Could not confirm', bodyHtml: escHtml(result.error) });
  }
}

function rescheduleScheduledMeeting(item) {
  if (item?.bookingUid) {
    openScheduleTab({ uid: item.bookingUid, view: 'week' });
    return;
  }
  if (item?.emailId) {
    setActiveMap('email', { force: true, emailId: item.emailId });
  }
}

function reviewAlertVariant(type) {
  if (type === 'meeting_conflict') return 'confirm';
  if (type === 'project') return 'pwa';
  return 'push';
}

function reviewAlertIconName(type) {
  switch (type) {
    case 'meeting_conflict':
      return 'alert-triangle';
    case 'meeting_request':
      return 'calendar';
    case 'meeting':
      return 'calendar-check';
    case 'meeting_followup':
      return 'mail';
    case 'project':
      return 'briefcase';
    default:
      return 'bell';
  }
}

function appendReviewAlertAction(actions, { label, primary, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `admin-setup-alert-btn${primary ? ' admin-setup-alert-btn--primary' : ''}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick(btn);
  });
  actions.appendChild(btn);
  return btn;
}

function openReviewNotificationTarget(item) {
  if (item.type === 'project' && item.jobSlug) {
    navigateToWork(item.jobSlug, { fromEmailId: item.emailId });
    return;
  }
  if (item.emailId) setActiveMap('email', { force: true, emailId: item.emailId });
}

function buildReviewAlertBanner(item) {
  const alert = document.createElement('div');
  alert.className = `admin-setup-alert admin-setup-alert--${reviewAlertVariant(item.type)}`;
  alert.setAttribute('role', 'status');
  if (item.emailId) alert.setAttribute('data-review-email-id', item.emailId);

  const iconWrap = document.createElement('div');
  iconWrap.className = 'admin-setup-alert-icon';
  iconWrap.dataset.type = item.type;
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.innerHTML = navIcon(reviewAlertIconName(item.type), 18);

  const copy = document.createElement('div');
  copy.className = 'admin-setup-alert-copy';
  const meta = formatEmailWhen(item.receivedAt);
  copy.innerHTML =
    `<strong>${escHtml(item.title)}</strong>` +
    `<p>${escHtml(item.detail)}${meta ? ` · ${escHtml(meta)}` : ''}</p>`;
  copy.addEventListener('click', () => openReviewNotificationTarget(item));

  const actions = document.createElement('div');
  actions.className = 'admin-setup-alert-actions';

  const isProject = item.type === 'project';
  const isMeetingFollowup = item.type === 'meeting_followup';
  const isMeetingRequest = item.type === 'meeting_request' || item.type === 'meeting_conflict';
  const isAutoBookedMeeting = item.type === 'meeting';

  if (isProject) {
    appendReviewAlertAction(actions, {
      label: 'View project',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
    copy.querySelector('p')?.insertAdjacentText(
      'afterbegin',
      'Client sent a branded acknowledgment · ',
    );
  } else if (isMeetingFollowup) {
    appendReviewAlertAction(actions, {
      label: 'View email',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isMeetingRequest) {
    const scheduleOnly = !item.proposedMeetingStart;
    appendReviewAlertAction(actions, {
      label: scheduleOnly
        ? 'Send scheduling link'
        : item.type === 'meeting_conflict'
          ? 'Notify conflict'
          : 'Accept & notify',
      primary: true,
      onClick: (btn) =>
        void runReviewScheduleAction(
          item,
          scheduleOnly
            ? 'notify-schedule-link'
            : item.type === 'meeting_conflict'
              ? 'notify-conflict'
              : 'accept-notify',
          btn,
        ),
    });
    appendReviewAlertAction(actions, {
      label: item.type === 'meeting_conflict' ? 'Suggest alternate' : 'View email',
      onClick: () => {
        if (item.type === 'meeting_conflict' && item.emailId) {
          const inboxEv = emailState.allEvents.find((e) => e.id === item.emailId);
          if (inboxEv) openScheduleFromEmail(inboxEv);
          else setActiveMap('email', { force: true, emailId: item.emailId });
          return;
        }
        openReviewNotificationTarget(item);
      },
    });
  } else if (isAutoBookedMeeting) {
    appendReviewAlertAction(actions, {
      label: 'Confirm',
      primary: true,
      onClick: (btn) => void confirmScheduledMeeting(item, btn),
    });
    appendReviewAlertAction(actions, {
      label: 'Reschedule',
      onClick: () => rescheduleScheduledMeeting(item),
    });
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'admin-setup-alert-dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  dismissBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    dismissBtn.disabled = true;
    void dismissReviewNotification(item).finally(() => {
      dismissBtn.disabled = false;
    });
  });
  actions.appendChild(dismissBtn);

  alert.append(iconWrap, copy, actions);
  return alert;
}

function buildReviewAlertBanners(notifications) {
  const wrap = document.createElement('div');
  wrap.className = 'dash-review-alerts';
  for (const item of notifications) {
    wrap.appendChild(buildReviewAlertBanner(item));
  }
  return wrap;
}

/** Drop a resolved review alert from the home dashboard immediately (no poll / reload wait). */
function removeReviewAlertBanner(emailId) {
  const id = String(emailId || '').trim();
  if (!id) return;
  const banner = document.querySelector(
    `.dash-review-alerts [data-review-email-id="${CSS.escape(id)}"]`,
  );
  if (!banner) return;
  const wrap = banner.closest('.dash-review-alerts');
  banner.remove();
  if (wrap && wrap.children.length === 0) wrap.remove();
}

function renderHomeDashboard(data) {
  const root = document.getElementById('home-dashboard');
  if (!root) return;
  root.innerHTML = '';

  const scroll = document.createElement('div');
  scroll.className = 'home-dashboard-scroll';

  const stats = data?.stats || {};
  const scheduleLive = data?.schedulingConfigured === true;
  const events = Array.isArray(data?.eventsToday) ? data.eventsToday : [];
  const automationNotifications = Array.isArray(data?.automationNotifications)
    ? data.automationNotifications
    : [];

  if (automationNotifications.length) {
    scroll.appendChild(buildReviewAlertBanners(automationNotifications));
  }

  const statsEl = document.createElement('div');
  statsEl.className = 'dash-stats';

  statsEl.appendChild(buildDashStat({
    value: stats.projectsPending ?? 0,
    label: 'Projects pending',
    hint: stats.projectsActive ? `${stats.projectsActive} active` : 'none active',
    onClick: () => setActiveMap('work', { force: activeKey === 'work' }),
  }));

  statsEl.appendChild(buildDashStat({
    value: stats.todosOpen ?? 0,
    label: 'Open tasks',
    hint: 'to-do lists',
    onClick: () => setActiveMap('todo', { force: activeKey === 'todo' }),
  }));

  statsEl.appendChild(buildDashStat({
    value: stats.clients ?? '—',
    label: 'Clients',
    hint: stats.clients == null ? 'contact-api off' : 'in CRM',
    muted: stats.clients == null,
    onClick: stats.clients == null ? null : () => setActiveMap('clients', { force: activeKey === 'clients' }),
  }));

  const billingLive = data?.billingConfigured === true;
  if (billingLive) {
    const billingFailed = Boolean(data?.billingError);
    const totalDue = stats.billingTotalDue ?? 0;
    const outstanding = stats.billingOutstanding ?? 0;
    const overdue = stats.billingOverdue ?? 0;
    const recurring = stats.billingRecurring ?? 0;

    statsEl.appendChild(buildDashStat({
      value: billingFailed ? '—' : formatDashMoney(totalDue),
      label: 'Outstanding',
      hint: billingFailed
        ? 'Crater unreachable'
        : outstanding
          ? `${outstanding} invoice${outstanding === 1 ? '' : 's'}${recurring ? ` · ${recurring} recurring` : ''}`
          : recurring
            ? `${recurring} recurring · all clear`
            : 'all clear',
      tone: billingFailed ? 'failed' : totalDue > 0 ? (overdue > 0 ? 'failed' : 'stale') : 'live',
      muted: billingFailed,
      onClick: billingFailed ? null : openFinanceCrater,
    }));

    statsEl.appendChild(buildDashStat({
      value: billingFailed ? '—' : overdue,
      label: 'Overdue',
      hint: billingFailed ? 'check CRATER_API_*' : overdue ? 'past due in Crater' : 'none overdue',
      tone: billingFailed ? 'failed' : overdue > 0 ? 'failed' : 'live',
      muted: billingFailed,
      onClick: billingFailed ? null : openFinanceCrater,
    }));
  }

  statsEl.appendChild(buildDashStat({
    value: stats.chats ?? 0,
    label: 'Chats',
    hint: 'agent threads',
    onClick: () => setActiveMap('chats', { force: activeKey === 'chats' }),
  }));

  const deployTone = deployStatTone(stats.deployState);
  statsEl.appendChild(buildDashStat({
    value: deployStatLabel(stats.deployState),
    label: 'Deploy',
    hint: data?.deploy?.deployedShort
      ? `@ ${data.deploy.deployedShort}`
      : stats.deployUpToDate === false
        ? 'behind GitHub'
        : 'status',
    tone: deployTone,
    onClick: () => setActiveMap('system', { force: activeKey === 'system' }),
  }));

  const uptimeSummary = data?.uptime?.summary;
  const uptimeConfigured = data?.uptime?.configured === true;
  const uptimeAccountHint = formatUptimeAccountHint(data?.uptimeAccount);
  if (uptimeConfigured || uptimeSummary) {
    const downCount = uptimeSummary?.down ?? stats.uptimeDown ?? 0;
    statsEl.appendChild(buildDashStat({
      value: downCount,
      label: 'Sites down',
      hint: uptimeAccountHint
        ? `${uptimeAccountHint}${uptimeSummary ? ` · ${uptimeSummary.open_incidents ?? 0} open incidents` : ''}`
        : uptimeSummary
          ? `${uptimeSummary.up}/${uptimeSummary.total} up locally · ${uptimeSummary.open_incidents ?? 0} open incidents`
          : uptimeConfigured
            ? 'sync pending'
            : 'not configured',
      tone: downCount > 0 ? 'failed' : uptimeSummary?.total ? 'live' : 'muted',
      muted: !uptimeConfigured,
    }));
  }

  const eventsPanel = document.createElement('section');
  eventsPanel.className = 'dash-panel dash-panel-today' + (events.length ? '' : ' dash-panel-today--empty');
  eventsPanel.innerHTML =
    `<div class="dash-panel-head">` +
      `<h2 class="dash-panel-title">Today</h2>` +
      (scheduleLive
        ? `<button type="button" class="dash-panel-btn" data-schedule-all>View Schedule</button>`
        : '') +
    `</div>`;
  eventsPanel.querySelector('[data-schedule-all]')?.addEventListener('click', () => {
    openScheduleTab();
  });
  const eventsBody = document.createElement('div');
  eventsBody.className = 'dash-panel-body';
  const eventsList = document.createElement('ul');
  eventsList.className = 'dash-events';
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = scheduleLive
      ? 'Nothing scheduled today.'
      : 'Enable scheduling and BOOKING_API_URL to show Cal.com events here.';
    eventsBody.appendChild(empty);
  } else {
    for (const ev of events) {
      const uid = ev.uid || ev.id;
      const canOpen = scheduleLive && uid;
      const li = document.createElement('li');
      if (canOpen) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dash-event dash-event-btn';
        btn.innerHTML =
          `<span class="dash-event-time">${escHtml(formatEventTime(ev.time))}</span>` +
          `<div class="dash-event-body">` +
            `<div class="dash-event-title">${escHtml(ev.title || 'Event')}</div>` +
            (ev.type ? `<div class="dash-event-type">${escHtml(ev.type)}</div>` : '') +
            (ev.attendee ? `<div class="dash-event-type">${escHtml(ev.attendee)}</div>` : '') +
          `</div>`;
        btn.addEventListener('click', () => openScheduleTab({ uid }));
        li.appendChild(btn);
      } else {
        li.className = 'dash-event';
        li.innerHTML =
          `<span class="dash-event-time">${escHtml(formatEventTime(ev.time))}</span>` +
          `<div class="dash-event-body">` +
            `<div class="dash-event-title">${escHtml(ev.title || 'Event')}</div>` +
            (ev.type ? `<div class="dash-event-type">${escHtml(ev.type)}</div>` : '') +
          `</div>`;
      }
      eventsList.appendChild(li);
    }
    eventsBody.appendChild(eventsList);
  }
  eventsPanel.appendChild(eventsBody);
  scroll.appendChild(eventsPanel);

  scroll.appendChild(statsEl);

  if (uptimeConfigured) {
    if (uptimeAccountHint) {
      const uptimeHead = document.createElement('p');
      uptimeHead.className = 'dash-muted-inline dash-uptime-account';
      uptimeHead.textContent = uptimeAccountHint;
      scroll.appendChild(uptimeHead);
    }

    const list = document.createElement('ul');
    list.className = 'dash-uptime-grid';
    const monitors = Array.isArray(data?.uptimeMonitors) ? data.uptimeMonitors : [];
    for (const m of monitors) {
      const li = document.createElement('li');
      const down = m.is_down || m.status === 8 || m.status === 9;
      const pct = m.uptime_ratio_7d != null ? `${Number(m.uptime_ratio_7d).toFixed(1)}%` : '';
      li.className = `dash-uptime-tile${down ? ' dash-uptime-tile--down' : ''}`;
      li.innerHTML =
        `<span class="dash-uptime-dot" aria-hidden="true"></span>` +
        `<div class="dash-uptime-name">${escHtml(m.friendly_name || m.url || `Monitor ${m.id}`)}</div>` +
        `<div class="dash-uptime-meta">${escHtml(down ? 'down' : pct || 'up')}</div>`;
      list.appendChild(li);
    }

    const addLi = document.createElement('li');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'dash-uptime-tile dash-uptime-tile--add';
    addBtn.innerHTML =
      `<span class="dash-uptime-add-icon" aria-hidden="true">+</span>` +
      `<div class="dash-uptime-name">Add site</div>`;
    addBtn.addEventListener('click', () => showAddUptimeSiteDialog());
    addLi.appendChild(addBtn);
    list.appendChild(addLi);

    const syncLi = document.createElement('li');
    const syncBtn = document.createElement('button');
    syncBtn.type = 'button';
    syncBtn.className = 'dash-uptime-tile dash-uptime-tile--add dash-uptime-tile--sync dash-uptime-sync-sites-btn';
    syncBtn.innerHTML =
      `<span class="dash-uptime-add-icon" aria-hidden="true">↻</span>` +
      `<div class="dash-uptime-name">Sync sites</div>`;
    syncBtn.addEventListener('click', () => syncUptimeSitesFromPlatforms());
    syncLi.appendChild(syncBtn);
    list.appendChild(syncLi);
    if (uptimePlatformSyncActive) {
      setUptimeSyncButtonBusy(true, { running: true, phase: 'creating' });
      ensureUptimePlatformSyncPolling();
    } else {
      void refreshUptimeSyncButtonState();
    }

    if (isDeploymentOwnerClient && uptimeConfigured) {
      const pullLi = document.createElement('li');
      const pullBtn = document.createElement('button');
      pullBtn.type = 'button';
      pullBtn.className = 'dash-uptime-tile dash-uptime-tile--add dash-uptime-tile--sync';
      pullBtn.innerHTML =
        `<span class="dash-uptime-add-icon" aria-hidden="true">⟳</span>` +
        `<div class="dash-uptime-name">Sync status</div>`;
      pullBtn.addEventListener('click', () => syncUptimeMonitorsFromApi());
      pullLi.appendChild(pullBtn);
      list.appendChild(pullLi);
    }

    scroll.appendChild(list);

    const recent = Array.isArray(uptimeSummary?.recent_incidents) ? uptimeSummary.recent_incidents : [];
    if (recent.length) {
      const incHead = document.createElement('h3');
      incHead.className = 'dash-uptime-inc-head';
      incHead.textContent = 'Recent incidents';
      scroll.appendChild(incHead);
      const incList = document.createElement('ul');
      incList.className = 'dash-uptime-incidents';
      for (const inc of recent.slice(0, 5)) {
        const li = document.createElement('li');
        li.className = 'dash-uptime-incident';
        li.innerHTML =
          `<span class="dash-uptime-inc-title">${escHtml(inc.monitor_name || 'Monitor')} — ${escHtml(inc.alert_type || 'incident')}</span>` +
          `<span class="dash-uptime-inc-when">${escHtml(formatEmailWhen(inc.created_at))}</span>`;
        incList.appendChild(li);
      }
      scroll.appendChild(incList);
    }
  }

  const inboxPanel = document.createElement('section');
  inboxPanel.className = 'dash-panel';
  inboxPanel.innerHTML = `<div class="dash-panel-head"><h2 class="dash-panel-title">Recent inbox</h2></div>`;
  const recent = Array.isArray(data?.recentEmails) ? data.recentEmails : [];
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = 'No emails yet.';
    inboxPanel.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'dash-inbox-list';
    for (const mail of recent) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dash-inbox-item';
      btn.innerHTML =
        `<span class="dash-inbox-subject">${escHtml(mail.subject)}</span>` +
        `<span class="dash-inbox-meta">${escHtml(mail.from || 'Unknown')} · ${escHtml(formatEmailWhen(mail.receivedAt))}</span>`;
      btn.addEventListener('click', () => setActiveMap('email', { force: true }));
      const li = document.createElement('li');
      li.appendChild(btn);
      list.appendChild(li);
    }
    inboxPanel.appendChild(list);
  }
  scroll.appendChild(inboxPanel);

  const grid = document.createElement('div');
  grid.className = 'home-dashboard-grid';
  for (const key of wrenchMenuTabKeys(cachedTabOrder || defaultTabKeys())) {
    const m = MAPS[key];
    if (!m) continue;
    if (m.link) {
      grid.appendChild(buildHomeLinkTile({ href: m.link, label: m.title, icon: mapIconName(key) }));
    } else if (
      key !== 'home' &&
      !SETTINGS_MAP_TYPES.has(key) &&
      !HOME_DASHBOARD_FOOTER_KEYS.has(key)
    ) {
      grid.appendChild(buildHomeMapTile(key, m));
    }
  }
  scroll.appendChild(grid);

  root.appendChild(scroll);
}

function showAddUptimeSiteDialog() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
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

    titleEl.textContent = 'Add site to UptimeRobot';
    bodyEl.innerHTML =
      '<p class="em-book-dialog-lead">Create an HTTP monitor with 5-minute checks.</p>' +
      '<label class="de-label sched-create-field">' +
        '<span>URL</span>' +
        '<div class="control-field">' +
          '<input id="uptime-add-url" type="url" inputmode="url" autocapitalize="none" autocomplete="url" placeholder="https://example.com" required>' +
        '</div>' +
      '</label>' +
      '<label class="de-label sched-create-field">' +
        '<span>Display name (optional)</span>' +
        '<div class="control-field">' +
          '<input id="uptime-add-name" type="text" autocapitalize="words" placeholder="example.com">' +
        '</div>' +
      '</label>';
    actionsEl.innerHTML = '';

    const urlInput = bodyEl.querySelector('#uptime-add-url');
    const nameInput = bodyEl.querySelector('#uptime-add-name');

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
    const addBtn = mkBtn('Add site', 'os-dialog-btn--primary', async () => {
      const url = urlInput?.value.trim() || '';
      if (!url) {
        urlInput?.focus();
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        const res = await fetch('/api/uptime/monitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            friendlyName: nameInput?.value.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        finish(true);
        await loadHomeDashboard();
      } catch (e) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add site';
        await osAlert({ title: 'Could not add site', bodyHtml: escHtml(e.message || String(e)) });
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(false), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    urlInput?.focus();
  });
}

async function syncUptimeSitesFromPlatforms() {
  if (uptimePlatformSyncActive) {
    setUptimeSyncButtonBusy(true, { running: true, phase: 'creating' });
    ensureUptimePlatformSyncPolling();
    return;
  }

  uptimePlatformSyncActive = true;
  setUptimeSyncButtonBusy(true, { running: true, phase: 'starting' });

  try {
    const res = await fetch('/api/uptime/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(`HTTP ${res.status}`);

    if (data.alreadyRunning) {
      ensureUptimePlatformSyncPolling();
      return;
    }

    if (!data.ok || !data.started) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    ensureUptimePlatformSyncPolling();
  } catch (e) {
    uptimePlatformSyncActive = false;
    stopUptimePlatformSyncPolling();
    setUptimeSyncButtonBusy(false);
    await osAlert({ title: 'Sync failed', bodyHtml: escHtml(e.message || String(e)) });
  }
}

async function syncUptimeMonitorsFromApi() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return;

  titleEl.textContent = 'Sync monitor status';
  bodyEl.innerHTML = '<p class="em-book-dialog-lead">Syncing monitor status from UptimeRobot API…</p>';
  actionsEl.innerHTML = '';
  openOsDialogBackdrop();

  try {
    const res = await fetch('/api/admin/uptimerobot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(`HTTP ${res.status}`);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    bodyEl.innerHTML = `<p>Synced <strong>${data.synced}</strong> monitor${data.synced === 1 ? '' : 's'} from UptimeRobot.</p>`;

    actionsEl.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'os-dialog-btn os-dialog-btn--primary';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', async () => {
      closeOsDialogBackdrop();
      if (data.synced > 0) await loadHomeDashboard();
    });
    actionsEl.appendChild(closeBtn);
    closeBtn.focus();
  } catch (e) {
    closeOsDialogBackdrop();
    await osAlert({ title: 'Sync failed', bodyHtml: escHtml(e.message || String(e)) });
  }
}

async function loadHomeDashboard() {
  const root = document.getElementById('home-dashboard');
  if (!root) return;
  root.innerHTML = '<div class="home-dashboard-scroll"><div class="dash-loading">Loading dashboard…</div></div>';

  try {
    const res = await fetch('/api/admin/dashboard', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    syncDashboardFooterBadges(data.stats);
    renderHomeDashboard(data);
  } catch (e) {
    root.innerHTML =
      `<div class="home-dashboard-scroll">` +
        `<p class="dash-empty">Could not load dashboard: ${escHtml(e.message)}</p>` +
      `</div>`;
  }
}

// ---- Social media dashboard ----
let socialRangeDays = 30;

const SOCIAL_PLATFORM_UI = {
  twitter: { slug: 'x', color: '#1d9bf0' },
  instagram: { slug: 'instagram', color: '#e1306c' },
  linkedin: { slug: 'linkedin', color: '#0a66c2' },
  facebook: { slug: 'facebook', color: '#1877f2' },
  youtube: { slug: 'youtube', color: '#ff0000' },
  tiktok: { slug: 'tiktok', color: '#ff0050' },
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
      (dir === 'flat' ? '' : navIcon(icon, 14)) +
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
    settingsBtn.addEventListener('click', () => setActiveMap('socials'));
  }
}

async function loadSocialTab() {
  const root = document.getElementById('social-panel');
  if (!root) return;
  root.innerHTML = '<div class="social-scroll"><div class="dash-loading">Loading social dashboard…</div></div>';

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
  root.innerHTML = '<div class="social-scroll"><div class="dash-loading">Loading analytics…</div></div>';

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

const PROFILE_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

function profileTimezoneOptions(selected) {
  return PROFILE_TIMEZONES.map((tz) => {
    const label = tz.replace(/_/g, ' ');
    const sel = tz === selected ? ' selected' : '';
    return `<option value="${escHtml(tz)}"${sel}>${escHtml(label)}</option>`;
  }).join('');
}

const AUTOSAVE_DEBOUNCE_MS = 650;
const FORM_FIELD_SAVING = 'form-field--saving';
const FORM_FIELD_SAVED = 'form-field--saved';
const FORM_FIELD_INVALID = 'form-field--invalid';

let settingsAutosaveFlush = null;

function setFormFieldState(el, state) {
  if (!el) return;
  el.classList.remove(FORM_FIELD_SAVING, FORM_FIELD_SAVED, FORM_FIELD_INVALID);
  el.removeAttribute('aria-invalid');
  if (!state) return;
  el.classList.add(`form-field--${state}`);
  if (state === 'invalid') el.setAttribute('aria-invalid', 'true');
}

function flashFormFieldSaved(el) {
  if (!el) return;
  setFormFieldState(el, 'saved');
  const prev = el.dataset.savedTimerId;
  if (prev) clearTimeout(Number(prev));
  const id = window.setTimeout(() => {
    if (document.activeElement !== el) setFormFieldState(el, null);
    delete el.dataset.savedTimerId;
  }, 2000);
  el.dataset.savedTimerId = String(id);
}

function isValidEmailField(value) {
  const v = (value || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhoneField(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return true;
  return digits.length >= 10 && digits.length <= 15;
}

function isValidUrlField(value) {
  const v = (value || '').trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function defaultFieldValidator(el) {
  if (el.disabled) return true;
  const type = (el.getAttribute('type') || '').toLowerCase();
  const name = (el.getAttribute('name') || '').toLowerCase();
  if (type === 'email' || name.includes('email')) return isValidEmailField(el.value);
  if (type === 'tel' || name.includes('phone')) return isValidPhoneField(el.value);
  if (type === 'url') return isValidUrlField(el.value);
  if (el.required && !String(el.value || '').trim()) return false;
  return true;
}

function getFormEditableFields(form) {
  return [...form.querySelectorAll(
    'input:not([disabled]):not([type=file]):not([type=hidden]), select, textarea',
  )];
}

function serializeFormData(form) {
  return JSON.stringify(Object.fromEntries(new FormData(form)));
}

function bindAutosaveForm(scope, opts) {
  const form = scope.querySelector(opts.formSelector);
  if (!(form instanceof HTMLFormElement)) return { flush: async () => {} };

  let baseline = serializeFormData(form);
  let activeEl = null;
  let debounceTimer = null;
  let saving = false;
  let pendingFlush = false;

  const validateField = opts.validateField || defaultFieldValidator;

  const canSave = () => {
    let ok = true;
    for (const el of getFormEditableFields(form)) {
      const valid = validateField(el, form);
      if (!valid) {
        ok = false;
        if (el === activeEl) setFormFieldState(el, 'invalid');
      }
    }
    return ok;
  };

  const flush = async () => {
    clearTimeout(debounceTimer);
    debounceTimer = null;

    if (saving) {
      pendingFlush = true;
      return;
    }

    const current = serializeFormData(form);
    if (current === baseline) return;
    if (!canSave()) return;

    saving = true;
    if (activeEl) setFormFieldState(activeEl, 'saving');

    try {
      const payload = Object.fromEntries(new FormData(form));
      const result = await opts.save(payload);
      if (result.ok) {
        baseline = serializeFormData(form);
        if (activeEl) flashFormFieldSaved(activeEl);
        else if (opts.alertEl) showProfileAlert(opts.alertEl, 'Saved.', 'success');
      } else {
        if (activeEl) setFormFieldState(activeEl, 'invalid');
        if (opts.alertEl && result.error) showProfileAlert(opts.alertEl, result.error, 'error');
      }
    } catch {
      if (activeEl) setFormFieldState(activeEl, 'invalid');
      if (opts.alertEl) showProfileAlert(opts.alertEl, 'Network error — please try again.', 'error');
    } finally {
      saving = false;
      if (
        activeEl &&
        !activeEl.classList.contains(FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(FORM_FIELD_INVALID)
      ) {
        setFormFieldState(activeEl, null);
      }
      if (pendingFlush) {
        pendingFlush = false;
        await flush();
      }
    }
  };

  const schedule = (el) => {
    activeEl = el;
    if (!el.classList.contains(FORM_FIELD_INVALID) && !el.classList.contains(FORM_FIELD_SAVED)) {
      setFormFieldState(el, null);
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, opts.debounceMs ?? AUTOSAVE_DEBOUNCE_MS);
  };

  for (const el of getFormEditableFields(form)) {
    const handler = () => schedule(el);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    el.addEventListener('blur', () => {
      activeEl = el;
      const valid = validateField(el, form);
      if (!valid) setFormFieldState(el, 'invalid');
      clearTimeout(debounceTimer);
      void flush();
    });
    el.addEventListener('focus', () => {
      if (!el.classList.contains(FORM_FIELD_INVALID)) setFormFieldState(el, null);
    });
  }

  form.addEventListener('submit', (e) => e.preventDefault());

  settingsAutosaveFlush = flush;
  return { flush };
}

async function flushSettingsAutosave() {
  if (typeof settingsAutosaveFlush === 'function') {
    await settingsAutosaveFlush();
    settingsAutosaveFlush = null;
  }
  destroyCompanyMap();
}

function showProfileAlert(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `prof-alert prof-alert--${type}`;
  el.hidden = false;
  clearTimeout(el.dataset.timerId ? Number(el.dataset.timerId) : 0);
  const timerId = window.setTimeout(() => {
    el.hidden = true;
  }, 4000);
  el.dataset.timerId = String(timerId);
}

function companyLogoPreviewUrl(company) {
  if (!company?.logoPath || company.logoSource === 'hidden') return '';
  const path = String(company.logoPath);
  const v = company.logoVersion ? `?v=${encodeURIComponent(company.logoVersion)}` : '';
  if (/^https?:\/\//i.test(path)) return path + (company.logoVersion ? v : '');
  return `${path.startsWith('/') ? path : `/${path}`}${v}`;
}

function hasCustomCompanyLogo(company) {
  return company?.logoSource === 'admin' && !!companyLogoPreviewUrl(company);
}

function bindCompanyLogoUpload(root, companyAlert) {
  const fileInput = root.querySelector('#company-logo-file');
  const fileWrap = root.querySelector('#company-logo-file-wrap');
  const previewWrap = root.querySelector('#company-logo-preview-wrap');
  const preview = root.querySelector('#company-logo-preview');
  const removeBtn = root.querySelector('#company-logo-remove');

  const refreshPreview = (company) => {
    const hasLogo = hasCustomCompanyLogo(company);
    const url = hasLogo ? companyLogoPreviewUrl(company) : '';

    if (preview instanceof HTMLImageElement) {
      preview.src = url;
    }
    if (previewWrap instanceof HTMLElement) {
      previewWrap.hidden = !hasLogo;
    }
    if (fileWrap instanceof HTMLElement) {
      fileWrap.hidden = hasLogo;
    }
  };

  fileInput?.addEventListener('change', async () => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;
    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append('logo', file);
    if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = true;
    fileInput.disabled = true;
    try {
      const res = await fetch('/api/admin/company/logo', { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok && json.company) {
        refreshPreview(json.company);
        showProfileAlert(companyAlert, 'Logo updated.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Logo upload failed.', 'error');
      }
    } catch {
      showProfileAlert(companyAlert, 'Network error — please try again.', 'error');
    } finally {
      fileInput.value = '';
      fileInput.disabled = false;
      if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = false;
    }
  });

  removeBtn?.addEventListener('click', async () => {
    if (!(removeBtn instanceof HTMLButtonElement)) return;
    removeBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/company/logo', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.company) {
        refreshPreview(json.company);
        showProfileAlert(companyAlert, 'Logo removed — using site default.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Could not remove logo.', 'error');
      }
    } catch {
      showProfileAlert(companyAlert, 'Network error — please try again.', 'error');
    } finally {
      removeBtn.disabled = false;
    }
  });
}

function bindProfileForm(root) {
  bindAutosaveForm(root, {
    formSelector: '#profile-form',
    alertEl: root.querySelector('#profile-alert'),
    async save(payload) {
      const res = await fetch('/api/admin/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      return { ok: res.ok, error: json.error };
    },
  });
}

let companyMapController = null;
let companyPendingGeo = null;
let destroyCompanyAddressAutocomplete = null;

function destroyCompanyMap() {
  if (companyMapController) {
    companyMapController.destroy();
    companyMapController = null;
  }
  if (destroyCompanyAddressAutocomplete) {
    destroyCompanyAddressAutocomplete();
    destroyCompanyAddressAutocomplete = null;
  }
  companyPendingGeo = null;
}

function bindCompanyForm(root, company) {
  destroyCompanyMap();

  const addressInput = root.querySelector('#company-address');
  const mapHost = root.querySelector('#company-map-host');
  if (mapHost) {
    companyMapController = createClientMap(mapHost, {
      token: window.__mapboxAccessToken,
      lat: company?.geo?.lat,
      lng: company?.geo?.lng,
      address: company?.address || '',
      showDirections: false,
    });
  }

  if (addressInput) {
    destroyCompanyAddressAutocomplete = mountAddressAutocomplete(
      addressInput,
      root.closest('.profile-panel-scroll') || document.getElementById('settings-panel'),
      async (pickedAddress) => {
        companyPendingGeo = await geocodeClientAddressPreview(pickedAddress);
        if (companyPendingGeo && companyMapController) {
          companyMapController.setLocation(
            companyPendingGeo.lat,
            companyPendingGeo.lng,
            pickedAddress,
          );
        }
      },
    );

    addressInput.addEventListener('input', () => {
      companyPendingGeo = null;
    });
    addressInput.addEventListener('blur', () => {
      void (async () => {
        const q = addressInput.value.trim();
        if (!q) {
          companyMapController?.setLocation(null, null, '');
          return;
        }
        const geo = await geocodeClientAddressPreview(q);
        if (geo) {
          companyPendingGeo = geo;
          companyMapController?.setLocation(geo.lat, geo.lng, q);
        }
      })();
    });

    if (company?.address?.trim() && !company?.geo?.lat) {
      void geocodeClientAddressPreview(company.address).then((geo) => {
        if (geo && companyMapController) {
          companyPendingGeo = geo;
          companyMapController.setLocation(geo.lat, geo.lng, company.address);
        }
      });
    }
  }

  bindAutosaveForm(root, {
    formSelector: '#company-form',
    alertEl: root.querySelector('#company-alert'),
    async save(payload) {
      if (companyPendingGeo) payload.geo = companyPendingGeo;
      const res = await fetch('/api/admin/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) companyPendingGeo = null;
      return { ok: res.ok, error: json.error };
    },
  });

  bindCompanyLogoUpload(root, root.querySelector('#company-alert'));
}

const SOCIAL_OAUTH_ERRORS = {
  not_configured: "That platform isn't set up yet — add its API credentials first.",
  denied: 'Authorization was cancelled.',
  state_mismatch: 'Security check failed. Please try connecting again.',
  missing_code: "The provider didn't return an authorization code.",
  exchange_failed: 'Could not complete the connection. Check the app credentials and callback URL.',
  unknown_platform: 'Unknown platform.',
};

function showSocialOAuthReturnAlert(root) {
  const params = new URLSearchParams(location.search);
  const connected = params.get('social_connected');
  const error = params.get('social_error');
  const errPlatform = params.get('platform');
  if (!connected && !error) return;

  const alertEl = root.querySelector('#socials-alert');
  if (connected) {
    showProfileAlert(alertEl, `Connected ${socialPlatformLabel(connected)}.`, 'success');
  } else if (error) {
    const prefix = errPlatform ? `${socialPlatformLabel(errPlatform)}: ` : '';
    showProfileAlert(alertEl, prefix + (SOCIAL_OAUTH_ERRORS[error] || 'Connection failed.'), 'error');
  }

  params.delete('social_connected');
  params.delete('social_error');
  params.delete('platform');
  const qs = params.toString();
  history.replaceState({}, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

function bindSocialsForm(root) {
  bindAutosaveForm(root, {
    formSelector: '#socials-form',
    alertEl: root.querySelector('#socials-alert'),
    async save(payload) {
      const res = await fetch('/api/admin/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      return { ok: res.ok, error: json.error };
    },
  });

  root.querySelectorAll('[data-soc-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      copyChatText(btn.getAttribute('data-soc-copy') || '', btn);
    });
  });

  root.querySelectorAll('[data-soc-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platform = btn.getAttribute('data-soc-disconnect');
      if (!platform) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/social/disconnect/${platform}`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        await loadSocialsTab();
      } catch (e) {
        btn.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Disconnect failed.', 'error');
      }
    });
  });

  showSocialOAuthReturnAlert(root);
}

function industriesRowsHtml(industries) {
  const list = Array.isArray(industries) && industries.length ? industries : [];
  if (!list.length) {
    return `<div class="ind-empty">No industries yet — add one below.</div>`;
  }
  return list
    .map((item) => {
      const enabled = item.enabled !== false;
      return (
        `<div class="ind-row">` +
          `<input class="ind-label" type="text" value="${escHtml(item.label || '')}" placeholder="Label" aria-label="Industry label" />` +
          `<input class="ind-slug" type="text" value="${escHtml(item.slug || '')}" placeholder="slug" aria-label="Industry slug" />` +
          `<label class="ind-enabled"><input type="checkbox" class="ind-enabled-cb"${enabled ? ' checked' : ''} /> On</label>` +
          `<button type="button" class="prof-btn-secondary ind-remove" aria-label="Remove">Remove</button>` +
        `</div>`
      );
    })
    .join('');
}

function collectIndustriesFromDom(root) {
  return Array.from(root.querySelectorAll('.ind-row'))
    .map((row, i) => {
      const label = row.querySelector('.ind-label')?.value?.trim() || '';
      const slug = row.querySelector('.ind-slug')?.value?.trim() || '';
      const enabled = !!row.querySelector('.ind-enabled-cb')?.checked;
      return { label, slug, enabled, sortOrder: i };
    })
    .filter((r) => r.label);
}

function bindIndustriesEditor(root) {
  const listEl = root.querySelector('#industries-list');
  const alertEl = root.querySelector('#industries-alert');
  const addBtn = root.querySelector('#industries-add-btn');
  if (!listEl) return;

  let baseline = JSON.stringify(collectIndustriesFromDom(root));
  let activeEl = null;
  let debounceTimer = null;
  let saving = false;
  let pendingFlush = false;

  const snapshot = () => JSON.stringify(collectIndustriesFromDom(root));

  const flush = async () => {
    clearTimeout(debounceTimer);
    debounceTimer = null;

    if (saving) {
      pendingFlush = true;
      return;
    }

    const current = snapshot();
    if (current === baseline) return;

    saving = true;
    if (activeEl) setFormFieldState(activeEl, 'saving');

    try {
      const industries = collectIndustriesFromDom(root);
      const res = await fetch('/api/admin/deck-industries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industries }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        listEl.innerHTML = industriesRowsHtml(json.industries);
        baseline = JSON.stringify(json.industries || []);
        if (activeEl) flashFormFieldSaved(activeEl);
      } else {
        if (activeEl) setFormFieldState(activeEl, 'invalid');
        showProfileAlert(alertEl, json.error || 'Save failed.', 'error');
      }
    } catch {
      if (activeEl) setFormFieldState(activeEl, 'invalid');
      showProfileAlert(alertEl, 'Network error — please try again.', 'error');
    } finally {
      saving = false;
      if (
        activeEl &&
        !activeEl.classList.contains(FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(FORM_FIELD_INVALID)
      ) {
        setFormFieldState(activeEl, null);
      }
      if (pendingFlush) {
        pendingFlush = false;
        await flush();
      }
    }
  };

  const schedule = (el) => {
    activeEl = el;
    if (!el.classList.contains(FORM_FIELD_INVALID) && !el.classList.contains(FORM_FIELD_SAVED)) {
      setFormFieldState(el, null);
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  };

  listEl.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.ind-remove');
    if (!btn) return;
    btn.closest('.ind-row')?.remove();
    activeEl = null;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  });

  listEl.addEventListener('input', (e) => {
    if (e.target?.matches?.('.ind-label, .ind-slug')) schedule(e.target);
  });

  listEl.addEventListener('change', (e) => {
    if (e.target?.matches?.('.ind-enabled-cb')) schedule(e.target);
  });

  addBtn?.addEventListener('click', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      `<div class="ind-row">` +
        `<input class="ind-label" type="text" value="" placeholder="Label" aria-label="Industry label" />` +
        `<input class="ind-slug" type="text" value="" placeholder="slug (auto)" aria-label="Industry slug" />` +
        `<label class="ind-enabled"><input type="checkbox" class="ind-enabled-cb" checked /> On</label>` +
        `<button type="button" class="prof-btn-secondary ind-remove" aria-label="Remove">Remove</button>` +
      `</div>`;
    listEl.querySelector('.ind-empty')?.remove();
    listEl.appendChild(wrap.firstElementChild);
    const labelInput = listEl.querySelector('.ind-row:last-child .ind-label');
    labelInput?.focus();
    if (labelInput) schedule(labelInput);
  });

  settingsAutosaveFlush = flush;
}

function renderProfileOnlyPanel(profile) {
  const p = profile || {};
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Profile</h1>` +
        `<p class="prof-subtitle">Your account details and preferences.</p>` +
        `<div id="profile-alert" class="prof-alert" hidden></div>` +
        `<form id="profile-form" class="prof-form">` +
          `<div class="prof-field-row">` +
            `<div class="prof-field"><label for="profile-firstName">First Name</label>` +
            `<input id="profile-firstName" name="firstName" type="text" value="${escHtml(p.firstName || '')}" autocomplete="given-name" /></div>` +
            `<div class="prof-field"><label for="profile-lastName">Last Name</label>` +
            `<input id="profile-lastName" name="lastName" type="text" value="${escHtml(p.lastName || '')}" autocomplete="family-name" /></div>` +
          `</div>` +
          `<div class="prof-field"><label for="profile-email">Email</label>` +
          `<input id="profile-email" name="email" type="email" value="${escHtml(p.email || '')}" disabled autocomplete="email" />` +
          `<span class="prof-hint">Email is managed through your Clerk account.</span></div>` +
          `<div class="prof-field-row">` +
            `<div class="prof-field"><label for="profile-phone">Phone</label>` +
            `<input id="profile-phone" name="phone" type="tel" value="${escHtml(p.phone || '')}" autocomplete="tel" placeholder="+1 (555) 000-0000" /></div>` +
            `<div class="prof-field"><label for="profile-timezone">Time Zone</label>` +
            `<select id="profile-timezone" name="timezone">${profileTimezoneOptions(p.timezone || '')}</select></div>` +
          `</div>` +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

function renderCompanyPanel(company) {
  const c = company || {};
  const logoUrl = companyLogoPreviewUrl(c);
  const hasLogo = hasCustomCompanyLogo(c);
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Company</h1>` +
        `<p class="prof-subtitle">Branding shown on client pages, emails, documents, and legal pages.</p>` +
        `<div id="company-alert" class="prof-alert" hidden></div>` +
        `<form id="company-form" class="prof-form">` +
          `<div class="prof-field"><label for="company-name">Display name</label>` +
          `<input id="company-name" name="name" type="text" value="${escHtml(c.name || '')}" placeholder="Acme Corp" autocomplete="organization" /></div>` +
          `<div class="prof-field"><label for="company-legalName">Legal name</label>` +
          `<input id="company-legalName" name="legalName" type="text" value="${escHtml(c.legalName || '')}" placeholder="Acme Corporation LLC" />` +
          `<span class="prof-hint">Used in contracts and NDAs. Defaults to display name if empty.</span></div>` +
          `<div class="prof-field"><label for="company-description">Tagline / description</label>` +
          `<input id="company-description" name="description" type="text" value="${escHtml(c.description || '')}" placeholder="Automated client communication" /></div>` +
          `<div class="prof-field"><label for="company-address">Business address</label>` +
          `<input id="company-address" name="address" type="text" value="${escHtml(c.address || '')}" placeholder="123 Main St, Boston, MA 02108" autocomplete="street-address" autocapitalize="words" />` +
          `<span class="prof-hint prof-hint--block">Office location for the map below, driving directions, and address autocomplete defaults.</span></div>` +
          `<div id="company-map-host" class="cl-map-section"></div>` +
          `<div class="prof-field"><label for="company-logo-file">Logo</label>` +
          `<div class="prof-logo-upload">` +
            `<div id="company-logo-preview-wrap" class="prof-logo-preview-wrap"${hasLogo ? '' : ' hidden'}>` +
              `<img id="company-logo-preview" class="prof-logo-preview" src="${escHtml(logoUrl)}" alt="" />` +
              `<button type="button" id="company-logo-remove" class="prof-logo-remove" aria-label="Remove logo">×</button>` +
            `</div>` +
            `<div id="company-logo-file-wrap" class="prof-logo-file-wrap"${hasLogo ? ' hidden' : ''}>` +
              `<input id="company-logo-file" type="file" accept="image/png,image/jpeg,image/webp" />` +
            `</div>` +
          `</div>` +
          `<span class="prof-hint prof-hint--block">PNG, JPEG, or WebP — max 2 MB. Updates the header and homepage immediately.</span>` +
          (c.domain
            ? `<span class="prof-hint prof-hint--block">Website domain: <code>${escHtml(c.domain)}</code> (from this deployment)</span>`
            : '') +
          `<div class="prof-field-row">` +
            `<div class="prof-field"><label for="company-supportEmail">Support email</label>` +
            `<input id="company-supportEmail" name="supportEmail" type="email" value="${escHtml(c.supportEmail || '')}" placeholder="support@example.com" autocomplete="email" /></div>` +
            `<div class="prof-field"><label for="company-supportPhone">Support phone</label>` +
            `<input id="company-supportPhone" name="supportPhone" type="tel" value="${escHtml(c.supportPhone || '')}" placeholder="+1 (555) 000-0000" autocomplete="tel" /></div>` +
          `</div>` +
          `<div class="prof-field"><label for="company-fromEmail">Outbound email (From)</label>` +
          `<input id="company-fromEmail" name="fromEmail" type="email" value="${escHtml(c.fromEmail || '')}" placeholder="noreply@example.com" autocomplete="email" /></div>` +
          `<span class="prof-hint prof-hint--block">Support email and phone appear as Call / Text / Email on client portal pages. Outbound email is used when <code>RESEND_FROM</code> is not set.</span>` +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

const SOCIAL_PLATFORM_LABELS = {
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

function socialPlatformLabel(platform) {
  return SOCIAL_PLATFORM_LABELS[platform] || platform || '';
}

function socialCopyRow(value) {
  const val = value || '';
  return (
    `<span class="soc-copy-row">` +
      `<code>${escHtml(val)}</code>` +
      `<button type="button" class="soc-copy-btn" data-soc-copy="${escHtml(val)}" aria-label="Copy">Copy</button>` +
    `</span>`
  );
}

function socialSetupDetails(conn) {
  const portalLink = conn.developerPortal
    ? `<a href="${escHtml(conn.developerPortal)}" target="_blank" rel="noopener noreferrer">developer portal ↗</a>`
    : 'developer portal';
  const envVars = (conn.envVars || []).join(', ');
  const steps = [
    `<li><span class="soc-step-body">Open the ${portalLink} and create/register an OAuth app. ${escHtml(conn.setupHint || '')}</span></li>`,
    `<li><span class="soc-step-body">Add this redirect / callback URL to the app:</span>${socialCopyRow(conn.callbackUrl)}</li>`,
    `<li><span class="soc-step-body">Set these environment variables on the server (Railway), then redeploy:</span>${socialCopyRow(envVars)}</li>`,
    `<li><span class="soc-step-body">Return here — the status flips to <strong>Not connected</strong> and a <strong>Connect</strong> button appears so you can sign in and authorize.</span></li>`,
  ];
  const summary = conn.configured ? 'Setup &amp; callback URL' : 'How to set this up ↓';
  return (
    `<details class="soc-conn-setup">` +
      `<summary>${summary}</summary>` +
      `<ol class="soc-conn-steps">${steps.join('')}</ol>` +
    `</details>`
  );
}

function socialConnectionRow(conn) {
  let statusHtml;
  let actionHtml;
  if (!conn.configured) {
    statusHtml = `<span class="soc-conn-pill soc-conn-pill--muted">Setup required</span>`;
    actionHtml = '';
  } else if (conn.connected && !conn.expired) {
    statusHtml = `<span class="soc-conn-pill soc-conn-pill--ok">Connected</span>`;
    actionHtml =
      `<button type="button" class="prof-btn-secondary soc-conn-btn" data-soc-disconnect="${escHtml(conn.platform)}">Disconnect</button>`;
  } else if (conn.connected && conn.expired) {
    statusHtml = `<span class="soc-conn-pill soc-conn-pill--warn">Expired</span>`;
    actionHtml = `<a class="prof-btn-secondary soc-conn-btn" href="${escHtml(conn.connectUrl)}">Reconnect</a>`;
  } else {
    statusHtml = `<span class="soc-conn-pill">Not connected</span>`;
    actionHtml = `<a class="prof-btn-secondary soc-conn-btn" href="${escHtml(conn.connectUrl)}">Connect</a>`;
  }
  const meta =
    conn.connected && conn.accountLabel
      ? `<span class="soc-conn-account">${escHtml(conn.accountLabel)}</span>`
      : '';
  return (
    `<div class="soc-conn-item">` +
      `<div class="soc-conn-row">` +
        `<span class="soc-conn-id">${socialPlatformIcon(conn.platform)}` +
          `<span class="soc-conn-name">${escHtml(conn.label)}${meta}</span></span>` +
        `<div class="soc-conn-actions">${statusHtml}${actionHtml}</div>` +
      `</div>` +
      socialSetupDetails(conn) +
    `</div>`
  );
}

function renderSocialConnectionsCard(connections) {
  const list = Array.isArray(connections) ? connections : [];
  const rows = list.map(socialConnectionRow).join('');
  return (
    `<div class="prof-card">` +
      `<h2 class="prof-title prof-title--section">API access</h2>` +
      `<p class="prof-subtitle">Connect an account to pull real metrics into the Social dashboard. Each platform needs a one-time app setup first (expand “How to set this up” below to add credentials); once configured, a Connect button appears so you can sign in and authorize. Tokens are stored securely on the server.</p>` +
      `<div class="soc-conn-list">${rows || '<p class="dash-empty">No platforms available.</p>'}</div>` +
    `</div>`
  );
}

function renderSocialsPanel(company, connections) {
  const c = company || {};
  const field = (id, name, label, placeholder) =>
    `<div class="prof-field"><label for="${id}">${label}</label>` +
    `<input id="${id}" name="${name}" type="url" value="${escHtml(c[name] || '')}" placeholder="${placeholder}" autocomplete="url" /></div>`;

  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Socials</h1>` +
        `<p class="prof-subtitle">Public profile links for your organization.</p>` +
        `<div id="socials-alert" class="prof-alert" hidden></div>` +
        `<form id="socials-form" class="prof-form">` +
          field('social-twitter', 'socialTwitter', 'X / Twitter', 'https://x.com/yourcompany') +
          field('social-instagram', 'socialInstagram', 'Instagram', 'https://instagram.com/yourcompany') +
          field('social-linkedin', 'socialLinkedin', 'LinkedIn', 'https://linkedin.com/company/yourcompany') +
          field('social-facebook', 'socialFacebook', 'Facebook', 'https://facebook.com/yourcompany') +
          field('social-youtube', 'socialYoutube', 'YouTube', 'https://youtube.com/@yourcompany') +
          field('social-tiktok', 'socialTiktok', 'TikTok', 'https://tiktok.com/@yourcompany') +
        `</form>` +
      `</div>` +
      renderSocialConnectionsCard(connections) +
    `</div>`
  );
}

function renderIndustriesPanel(industries) {
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Industries</h1>` +
        `<p class="prof-subtitle">Categories for <code>/deck?type=…</code> presets. Edit labels and slugs; turn Off to hide without deleting.</p>` +
        `<div id="industries-alert" class="prof-alert" hidden></div>` +
        `<div id="industries-list" class="ind-list">${industriesRowsHtml(industries)}</div>` +
        `<div class="prof-actions ind-actions">` +
          `<button type="button" id="industries-add-btn" class="prof-btn-secondary">Add industry</button>` +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

const VAPI_DEFAULT_FIRST_MESSAGE =
  'Hi! Thanks for reaching out to {{companyName}}. How can I help you today?';

const VAPI_DEFAULT_SYSTEM_PROMPT =
  `[Identity]\nYou are the voice assistant for {{companyName}}.\n\n[About]\n{{companyDescription}}\n\n[Guidelines]\n- Speak naturally and concisely.\n- You represent {{companyName}} only. Never introduce yourself as a different brand, product, or company name.\n- Website: {{companyDomain}}\n- If you do not know an answer, say so and suggest visiting {{companyDomain}} or leaving contact details.\n\n[Channel]\nYou are on the website voice widget (web call). Keep replies short enough to say aloud in one breath.`;

function renderVapiPanel(company) {
  const c = company || {};
  const syncBtn =
    isDeploymentOwnerClient
      ? `<button type="button" id="vapi-sync-btn" class="prof-btn-secondary">Sync assistant now</button>`
      : '';
  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Vapi</h1>` +
        `<p class="prof-subtitle">Voice assistant ID and prompts. Company name and tagline come from Admin → Company. <code>VAPI_API_KEY</code> stays on the server.</p>` +
        `<div id="vapi-alert" class="prof-alert" hidden></div>` +
        `<div id="vapi-plugin-status" class="prof-hint prof-hint--block">Checking status…</div>` +
        `<form id="vapi-form" class="prof-form">` +
          `<div class="prof-field"><label for="vapi-assistant-id">Assistant ID</label>` +
          `<input id="vapi-assistant-id" name="vapiAssistantId" type="text" value="${escHtml(c.vapiAssistantId || '')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" /></div>` +
          `<div class="prof-field"><label for="vapi-first-message">First message</label>` +
          `<textarea id="vapi-first-message" name="vapiFirstMessage" rows="3" placeholder="${escHtml(VAPI_DEFAULT_FIRST_MESSAGE)}">${escHtml(c.vapiFirstMessage || '')}</textarea>` +
          `<span class="prof-hint">Supports <code>{{companyName}}</code> — filled at call time.</span></div>` +
          `<div class="prof-field"><label for="vapi-system-prompt">System prompt</label>` +
          `<textarea id="vapi-system-prompt" name="vapiSystemPrompt" rows="12" placeholder="${escHtml(VAPI_DEFAULT_SYSTEM_PROMPT.slice(0, 120))}…">${escHtml(c.vapiSystemPrompt || '')}</textarea>` +
          `<span class="prof-hint">Supports <code>{{companyName}}</code>, <code>{{companyDescription}}</code>, <code>{{companyDomain}}</code>. Leave blank for the default template.</span></div>` +
          (syncBtn ? `<div class="prof-actions">${syncBtn}</div>` : '') +
        `</form>` +
      `</div>` +
    `</div>`
  );
}

async function loadProfileTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading profile…</div></div>';

  try {
    const profileRes = await fetch('/api/admin/profile', { cache: 'no-store' });
    const profileData = await profileRes.json();
    if (!profileRes.ok || !profileData.ok) throw new Error(profileData.error || `HTTP ${profileRes.status}`);
    root.innerHTML = renderProfileOnlyPanel(profileData.profile);
    bindProfileForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Profile</h1>` +
        `<p class="dash-empty">Could not load profile: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

async function loadCompanyTab() {
  await flushSettingsAutosave();
  destroyCompanyMap();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading company…</div></div>';

  try {
    const companyRes = await fetch('/api/admin/company', { cache: 'no-store' });
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);
    root.innerHTML = renderCompanyPanel(companyData.company);
    bindCompanyForm(root, companyData.company);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Company</h1>` +
        `<p class="dash-empty">Could not load company details: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

async function loadSocialsTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading socials…</div></div>';

  try {
    const [companyRes, connRes] = await Promise.all([
      fetch('/api/admin/company', { cache: 'no-store' }),
      fetch('/api/admin/social/connections', { cache: 'no-store' }),
    ]);
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);

    let connections = [];
    try {
      const connData = await connRes.json();
      if (connRes.ok && connData.ok) connections = connData.connections || [];
    } catch {
      /* connection status is best-effort */
    }

    root.innerHTML = renderSocialsPanel(companyData.company, connections);
    bindSocialsForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Socials</h1>` +
        `<p class="dash-empty">Could not load social links: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

async function loadIndustriesTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading industries…</div></div>';

  try {
    const industriesRes = await fetch('/api/admin/deck-industries', { cache: 'no-store' });
    const industriesData = await industriesRes.json().catch(() => ({}));
    if (!industriesRes.ok || !industriesData.ok) {
      throw new Error(industriesData.error || `HTTP ${industriesRes.status}`);
    }
    root.innerHTML = renderIndustriesPanel(industriesData.industries);
    bindIndustriesEditor(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Industries</h1>` +
        `<p class="dash-empty">Could not load industries: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

function bindVapiForm(root) {
  bindAutosaveForm(root, {
    formSelector: '#vapi-form',
    alertEl: root.querySelector('#vapi-alert'),
    async save(payload) {
      const res = await fetch('/api/admin/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) void refreshVapiPluginStatus();
      return { ok: res.ok, error: json.error };
    },
  });

  const syncBtn = root.querySelector('#vapi-sync-btn');
  const alertEl = root.querySelector('#vapi-alert');

  if (syncBtn && !syncBtn.dataset.bound) {
    syncBtn.dataset.bound = '1';
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      const statusEl = root.querySelector('#vapi-plugin-status');
      if (statusEl) statusEl.textContent = 'Syncing…';
      try {
        const res = await adminFetch('/api/admin/vapi', { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        showProfileAlert(alertEl, `Synced for ${json.companyName}.`, 'success');
      } catch (e) {
        showProfileAlert(alertEl, e.message || 'Sync failed.', 'error');
      } finally {
        syncBtn.disabled = false;
        void refreshVapiPluginStatus();
      }
    });
  }

  void refreshVapiPluginStatus();
}

async function loadVapiTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading Vapi…</div></div>';

  try {
    const companyRes = await fetch('/api/admin/company', { cache: 'no-store' });
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);
    root.innerHTML = renderVapiPanel(companyData.company);
    bindVapiForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Vapi</h1>` +
        `<p class="dash-empty">Could not load Vapi settings: ${escHtml(e.message)}</p></div>` +
      `</div>`;
  }
}

async function refreshVapiPluginStatus() {
  const statusEl = document.getElementById('vapi-plugin-status');
  const btn = document.getElementById('vapi-sync-btn');
  if (!statusEl) return;
  try {
    const res = await adminFetch('/api/admin/vapi', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    const parts = [
      json.pluginEnabled ? 'Vapi module enabled' : 'Add "vapi" to features in install config',
      json.configured ? 'Ready to sync' : 'Not configured — set assistant ID and VAPI_API_KEY',
      json.companyName ? `Company: ${json.companyName}` : '',
      json.assistantId ? `Assistant: ${json.assistantId}` : '',
    ].filter(Boolean);
    statusEl.textContent = parts.join(' · ');
    if (btn) btn.disabled = !json.configured || !json.pluginEnabled;
  } catch (e) {
    statusEl.textContent = `Status unavailable: ${e.message}`;
    if (btn) btn.disabled = true;
  }
}

function footerNavActiveKey() {
  if (activeKey === 'home') return 'home';
  if (activeKey === 'chats' || activeKey === 'knowledge') return 'chat';
  if (activeKey === 'email') return 'inbox';
  if (activeKey === 'schedule') return 'schedule';
  if (activeKey === 'work') return 'work';
  if (activeKey === 'todo') return 'todo';
  if (activeKey === 'clients') return 'clients';
  return null;
}

let footerSaveHandler = null;
let footerSaveNav = null;

function footerSaveNavForEditor() {
  if (activeKey === 'knowledge' && knowledgeState.activeSlug) return 'chat';
  if (activeKey === 'clients' && clientState.activeUid === '__new__') return 'clients';
  if (
    (activeKey === 'work' && workState.activeSlug) ||
    (activeKey === 'documents' && docState.activeSlug === '__new__') ||
    (activeKey === 'rules' && ruleState.activeId)
  ) {
    return 'work';
  }
  return null;
}

function setEditorFooterSave(submitFn) {
  footerSaveNav = footerSaveNavForEditor();
  footerSaveHandler = footerSaveNav && submitFn ? submitFn : null;
  if (!footerSaveHandler) footerSaveNav = null;
  syncFooterNav();
}

function clearEditorFooterSave() {
  footerSaveHandler = null;
  footerSaveNav = null;
  syncFooterNav();
}

/** Drop a stale save handler when the active tab no longer owns it. */
function syncEditorFooterSaveState() {
  if (typeof footerSaveHandler !== 'function') return;
  const owner = footerSaveNavForEditor();
  if (owner && owner === footerSaveNav) return;
  footerSaveHandler = null;
  footerSaveNav = null;
}

function footerNavShowsSave(nav) {
  if (footerNavCollapsed) return false;
  return footerSaveNavForEditor() === nav && typeof footerSaveHandler === 'function';
}

function footerNavShowsCreate(nav) {
  if (footerNavCollapsed || nav === 'home') return false;
  return footerNavActiveKey() === nav;
}

function applyFooterNavBtnMode(btn, iconEl, opts) {
  const { create, icon, label, title } = opts;
  btn.classList.toggle('footer-nav-btn--create', create);
  btn.classList.toggle('footer-nav-btn--save', false);
  if (create) {
    iconEl.innerHTML = navIcon('plus', 20);
    btn.setAttribute('aria-label', title);
    btn.title = title;
    return;
  }
  iconEl.innerHTML = navIcon(icon, 20);
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function syncFooterChatNav() {
  const btn = document.getElementById('footer-nav-chat');
  if (!btn) return;
  const create = footerNavShowsCreate('chat');
  let iconEl = btn.querySelector('.footer-nav-chat-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-chat-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'agent',
    label: 'Chats',
    title: 'New chat',
  });
}

function syncFooterWorkNav() {
  const btn = document.getElementById('footer-nav-work');
  if (!btn) return;
  const create = footerNavShowsCreate('work');
  let iconEl = btn.querySelector('.footer-nav-work-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-work-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'briefcase',
    label: 'Projects',
    title: 'New project',
  });
}

function syncFooterTodoNav() {
  const btn = document.getElementById('footer-nav-todo');
  if (!btn) return;
  const create = footerNavShowsCreate('todo');
  let iconEl = btn.querySelector('.footer-nav-todo-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-todo-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'check-square',
    label: 'To‑dos',
    title: 'New to‑do',
  });
}

function syncFooterInboxNav() {
  const btn = document.getElementById('footer-nav-inbox');
  if (!btn) return;
  const create = footerNavShowsCreate('inbox');
  let iconEl = btn.querySelector('.footer-nav-inbox-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-inbox-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'mail',
    label: 'Inbox',
    title: 'Compose email',
  });
}

function syncFooterScheduleNav() {
  const btn = document.getElementById('footer-nav-schedule');
  if (!btn) return;
  const create = footerNavShowsCreate('schedule');
  let iconEl = btn.querySelector('.footer-nav-schedule-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-schedule-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'calendar',
    label: 'Schedule',
    title: 'New event',
  });
}

function syncFooterClientsNav() {
  const btn = document.getElementById('footer-nav-clients');
  if (!btn) return;
  const create = footerNavShowsCreate('clients');
  let iconEl = btn.querySelector('.footer-nav-clients-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'footer-nav-clients-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    btn.insertBefore(iconEl, btn.firstChild);
  }
  btn.querySelector(':scope > svg')?.remove();
  applyFooterNavBtnMode(btn, iconEl, {
    create,
    icon: 'users',
    label: 'Clients',
    title: 'New client',
  });
}

function footerNavCreateModeActive(nav) {
  return footerNavShowsCreate(nav);
}

async function triggerFooterSave() {
  if (typeof footerSaveHandler !== 'function') return;
  const btn =
    footerSaveNav === 'chat'
      ? document.getElementById('footer-nav-chat')
      : footerSaveNav === 'clients'
        ? document.getElementById('footer-nav-clients')
        : document.getElementById('footer-nav-work');
  if (btn) btn.disabled = true;
  try {
    await footerSaveHandler();
  } finally {
    if (btn) btn.disabled = false;
  }
}

const FOOTER_PANEL_SELECTOR =
  '#home-dashboard, #settings-panel, #chat-panel, #email-panel, #doc-editor, #knowledge-editor, #work-editor, #clients-editor, #rule-editor, #todo-editor, #search-overlay';
const footerPanelScrollTops = new WeakMap();
const FOOTER_SCROLL_DELTA = 4;

function collapseFooterNav() {
  if (!isMobileTabs()) return;
  if (footerNavCollapsed) return;
  footerNavCollapsed = true;
  document.getElementById('admin-footer-nav')?.classList.add('footer-nav-collapsed');
  const homeBtn = document.getElementById('footer-nav-home');
  homeBtn?.setAttribute('title', 'Show navigation');
  syncFooterChatNav();
  syncFooterInboxNav();
  syncFooterScheduleNav();
  syncFooterWorkNav();
  syncFooterTodoNav();
  syncFooterClientsNav();
  syncFooterChatInlineHome();
  syncFooterNavCountTooltips();
  scheduleFooterNavIndicatorSync();
}

function expandFooterNav() {
  if (!footerNavCollapsed) return;
  footerNavCollapsed = false;
  document.getElementById('admin-footer-nav')?.classList.remove('footer-nav-collapsed');
  const homeBtn = document.getElementById('footer-nav-home');
  homeBtn?.setAttribute('title', 'Home');
  syncFooterChatNav();
  syncFooterInboxNav();
  syncFooterScheduleNav();
  syncFooterWorkNav();
  syncFooterTodoNav();
  syncFooterClientsNav();
  syncFooterChatInlineHome();
  syncFooterNavCountTooltips();
  scheduleFooterNavIndicatorSync();
}

function onPanelScrollCollapse(ev) {
  if (!isMobileTabs()) return;
  const target = ev.target;
  if (!(target instanceof Element)) return;
  if (target.closest('#wrap, #admin-footer-nav')) return;
  // Agent chat scrolls inside .aui-viewport; the panel shell does not scroll.
  if (target.closest('.aui-viewport')) return;
  const panel = target.closest(FOOTER_PANEL_SELECTOR);
  if (!panel) return;
  const style = window.getComputedStyle(panel);
  if (style.display === 'none' || style.visibility === 'hidden') return;

  const scrollTop = target.scrollTop;
  const prevTop = footerPanelScrollTops.get(target);
  footerPanelScrollTops.set(target, scrollTop);

  if (scrollTop <= 6) {
    expandFooterNav();
    return;
  }

  if (prevTop == null) return;

  const delta = scrollTop - prevTop;
  if (delta > FOOTER_SCROLL_DELTA) collapseFooterNav();
  else if (delta < -FOOTER_SCROLL_DELTA) expandFooterNav();
}

function initFooterNavScrollCollapse() {
  document.addEventListener('scroll', onPanelScrollCollapse, { capture: true, passive: true });
}

const FOOTER_NAV_DRAG_ORDER = ['home', 'chat', 'inbox', 'schedule', 'work', 'todo', 'clients'];
const FOOTER_NAV_DRAG_THRESHOLD = 8;

function footerNavIndicatorHidden() {
  const indicator = document.getElementById('footer-nav-indicator');
  if (!indicator || indicator.hidden) return true;
  const activeNav = footerNavActiveKey();
  return activeNav != null && activeNav !== 'home' && footerNavCreateModeActive(activeNav);
}

function getVisibleFooterNavButtons() {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill) return [];
  return FOOTER_NAV_DRAG_ORDER.map((nav) => {
    const btn = pill.querySelector(`.footer-nav-btn[data-nav="${nav}"]`);
    if (!btn) return null;
    const style = window.getComputedStyle(btn);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    if (parseFloat(style.opacity) < 0.05) return null;
    if (btn.offsetWidth <= 0) return null;
    return { nav, btn };
  }).filter(Boolean);
}

function footerNavSnapTargets() {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill) return [];
  const pillRect = pill.getBoundingClientRect();
  return getVisibleFooterNavButtons().map(({ nav, btn }) => {
    const rect = btn.getBoundingClientRect();
    const x = rect.left - pillRect.left;
    return { nav, btn, x, width: rect.width, center: x + rect.width / 2 };
  });
}

function parseFooterIndicatorX(indicator) {
  const transform = indicator.style.transform || '';
  const match = transform.match(/translateX\(([-\d.]+)px\)/);
  if (match) return parseFloat(match[1]);
  const matrix = window.getComputedStyle(indicator).transform;
  if (matrix && matrix !== 'none') {
    const values = matrix.match(/matrix\(([^)]+)\)/);
    if (values) {
      const parts = values[1].split(',').map((part) => parseFloat(part.trim()));
      if (parts.length === 6) return parts[4];
    }
  }
  return 0;
}

function setFooterIndicatorPosition(x, width, { animate = true } = {}) {
  const indicator = document.getElementById('footer-nav-indicator');
  if (!indicator) return;
  indicator.classList.toggle('footer-nav-indicator--dragging', !animate);
  indicator.style.transition = animate ? '' : 'none';
  indicator.style.width = `${width}px`;
  indicator.style.transform = `translateX(${x}px)`;
}

function nearestFooterNavTarget(clientX) {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill) return null;
  const targets = footerNavSnapTargets();
  if (!targets.length) return null;
  const x = clientX - pill.getBoundingClientRect().left;
  let best = targets[0];
  let bestDist = Math.abs(x - best.center);
  for (const target of targets.slice(1)) {
    const dist = Math.abs(x - target.center);
    if (dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  }
  return best;
}

function activateFooterChatNav() {
  closeSearchOverlay();
  if (footerNavShowsSave('chat')) {
    void triggerFooterSave();
    return;
  }
  if (activeKey === 'chats') {
    void startNewChat();
    return;
  }
  setActiveMap('chats', { force: activeKey === 'chats' });
}

function activateFooterNavFromDrag(nav) {
  closeSearchOverlay();
  if (nav === 'home') {
    if (footerNavCollapsed) {
      expandFooterNav();
      return;
    }
    setActiveMap('home', { force: activeKey === 'home' });
    return;
  }
  if (nav === 'chat') {
    activateFooterChatNav();
    return;
  }
  if (nav === 'inbox') {
    if (activeKey === 'email') {
      startNewEmail();
      return;
    }
    setActiveMap('email', { force: activeKey === 'email' });
    return;
  }
  if (nav === 'schedule') {
    if (activeKey === 'schedule') {
      scheduleEnsureFocusDate();
      scheduleOpenCreateDialog();
      return;
    }
    setActiveMap('schedule', { force: activeKey === 'schedule' });
    return;
  }
  if (nav === 'work') {
    if (footerNavShowsSave('work')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'work') {
      startNewProject();
      return;
    }
    setActiveMap('work', { force: activeKey === 'work' });
    return;
  }
  if (nav === 'todo') {
    if (activeKey === 'todo') {
      startNewTodo();
      return;
    }
    setActiveMap('todo', { force: activeKey === 'todo' });
    return;
  }
  if (nav === 'clients') {
    if (footerNavShowsSave('clients')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'clients') {
      startNewClient();
      return;
    }
    setActiveMap('clients', { force: activeKey === 'clients' });
  }
}

function initFooterNavIndicatorDrag() {
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!pill || pill.dataset.indicatorDragBound) return;
  pill.dataset.indicatorDragBound = '1';

  let pointerId = null;
  let dragStartX = 0;
  let dragStartIndicatorX = 0;
  let dragWidth = 0;
  let dragActive = false;

  const finishDrag = (ev) => {
    if (pointerId == null || ev.pointerId !== pointerId) return;
    const moved = dragActive;
    const clientX = ev.clientX;
    pill.releasePointerCapture?.(pointerId);
    pointerId = null;
    dragActive = false;
    footerIndicatorDragging = false;
    pill.classList.remove('footer-nav-pill--dragging');

    const indicator = document.getElementById('footer-nav-indicator');
    if (indicator) {
      indicator.classList.remove('footer-nav-indicator--dragging');
      indicator.style.transition = '';
    }

    const target = nearestFooterNavTarget(clientX);
    if (target) {
      setFooterIndicatorPosition(target.x, target.width, { animate: true });
      if (moved) {
        footerIndicatorSuppressClick = true;
        const currentNav = footerNavActiveKey();
        if (target.nav !== currentNav) activateFooterNavFromDrag(target.nav);
      }
    } else {
      scheduleFooterNavIndicatorSync();
    }
  };

  pill.addEventListener('pointerdown', (ev) => {
    if (footerNavIndicatorHidden()) return;
    if (getVisibleFooterNavButtons().length < 2) return;
    if (!(ev.target instanceof Element)) return;
    if (ev.target.closest('.footer-nav-badge')) return;

    pointerId = ev.pointerId;
    dragActive = false;
    footerIndicatorDragging = false;
    footerIndicatorSuppressClick = false;
    dragStartX = ev.clientX;

    const indicator = document.getElementById('footer-nav-indicator');
    if (!indicator) return;
    dragStartIndicatorX = parseFooterIndicatorX(indicator);
    dragWidth = indicator.offsetWidth || parseFloat(indicator.style.width) || 0;
  });

  pill.addEventListener('pointermove', (ev) => {
    if (pointerId == null || ev.pointerId !== pointerId) return;
    const dx = ev.clientX - dragStartX;
    if (!dragActive) {
      if (Math.abs(dx) < FOOTER_NAV_DRAG_THRESHOLD) return;
      dragActive = true;
      footerIndicatorDragging = true;
      pill.classList.add('footer-nav-pill--dragging');
      pill.setPointerCapture(ev.pointerId);
    }

    const pillRect = pill.getBoundingClientRect();
    const maxX = Math.max(0, pillRect.width - dragWidth);
    const nextX = Math.min(maxX, Math.max(0, dragStartIndicatorX + dx));
    setFooterIndicatorPosition(nextX, dragWidth, { animate: false });
    ev.preventDefault();
  });

  pill.addEventListener('pointerup', finishDrag);
  pill.addEventListener('pointercancel', finishDrag);

  pill.addEventListener('click', (ev) => {
    if (!footerIndicatorSuppressClick) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    footerIndicatorSuppressClick = false;
  }, true);
}

function syncFooterNavIndicator() {
  if (footerIndicatorDragging) return;
  const indicator = document.getElementById('footer-nav-indicator');
  const pill = document.querySelector('.admin-footer-nav-pill');
  if (!indicator || !pill) return;

  const activeNav = footerNavActiveKey();
  const hideForCreate = activeNav != null && activeNav !== 'home' && footerNavCreateModeActive(activeNav);

  let targetBtn = activeNav
    ? document.querySelector(`.footer-nav-btn[data-nav="${activeNav}"]`)
    : null;
  if (footerNavCollapsed) {
    targetBtn = document.getElementById('footer-nav-home');
  }

  if (!targetBtn || hideForCreate) {
    indicator.hidden = true;
    indicator.classList.remove('is-visible');
    return;
  }

  indicator.hidden = false;
  const pillRect = pill.getBoundingClientRect();
  const btnRect = targetBtn.getBoundingClientRect();
  indicator.style.width = `${btnRect.width}px`;
  indicator.style.transform = `translateX(${btnRect.left - pillRect.left}px)`;
  indicator.classList.add('is-visible');
}

function scheduleFooterNavIndicatorSync() {
  syncFooterNavIndicator();
  requestAnimationFrame(syncFooterNavIndicator);
  window.setTimeout(syncFooterNavIndicator, 340);
}

function syncFooterChatInlineHome() {
  const use =
    isMobileTabs() &&
    footerNavCollapsed &&
    activeKey === 'chats' &&
    Boolean(chatState.activeId) &&
    !document.body.classList.contains('chat-compose-focused');
  document.body.classList.toggle('footer-chat-inline-home', use);
}

function syncChatComposeViewport() {
  if (!document.body.classList.contains('chat-compose-focused')) {
    document.documentElement.style.removeProperty('--chat-compose-bottom');
    return;
  }
  const vv = window.visualViewport;
  if (!vv) {
    document.documentElement.style.setProperty('--chat-compose-bottom', '0px');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--chat-compose-bottom', `${inset}px`);
}

function syncChatComposeFormNav(focused) {
  const header = getChatPanel()?.querySelector('.ch-pane-header');
  if (header instanceof HTMLElement) {
    header.inert = Boolean(focused);
  }
  const searchInput = document.getElementById('search-overlay-input');
  if (searchInput instanceof HTMLInputElement && !searchOverlayOpen) {
    searchInput.disabled = Boolean(focused);
  }
}

function setChatComposeFocused(focused) {
  if (!isMobileTabs() || activeKey !== 'chats' || !chatState.activeId) {
    focused = false;
  }
  document.body.classList.toggle('chat-compose-focused', focused);
  syncChatComposeFormNav(focused);
  if (focused) syncChatComposeViewport();
  else document.documentElement.style.removeProperty('--chat-compose-bottom');
  syncFooterChatInlineHome();
}

function initChatComposeFocusLayout() {
  if (document.documentElement.dataset.chatComposeFocusBound === '1') return;
  document.documentElement.dataset.chatComposeFocusBound = '1';

  document.addEventListener(
    'focusin',
    (ev) => {
      if (!isMobileTabs() || activeKey !== 'chats' || !chatState.activeId) return;
      const t = ev.target;
      if (!(t instanceof HTMLElement) || !t.classList.contains('aui-input')) return;
      setChatComposeFocused(true);
    },
    true,
  );

  document.addEventListener(
    'focusout',
    (ev) => {
      if (!isMobileTabs()) return;
      const related = ev.relatedTarget;
      if (
        related instanceof HTMLElement &&
        related.closest('.aui-compose, .aui-compose-footer, .aui-composer-shell, .aui-composer-card, .ch-compose')
      ) {
        return;
      }
      requestAnimationFrame(() => {
        const panel = getChatPanel();
        if (panel?.contains(document.activeElement)) return;
        setChatComposeFocused(false);
      });
    },
    true,
  );

  window.visualViewport?.addEventListener('resize', syncChatComposeViewport);
  window.visualViewport?.addEventListener('scroll', syncChatComposeViewport);
  MOBILE_TABS_MQ.addEventListener('change', () => setChatComposeFocused(false));

  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!document.body.classList.contains('chat-compose-focused')) return;
      const t = ev.target;
      if (t instanceof HTMLElement && t.closest('.aui-compose, .aui-compose-footer, .aui-composer-shell, .aui-composer-card, .ch-compose')) {
        return;
      }
      const input = document.querySelector('#chat-panel .aui-input');
      if (input instanceof HTMLElement) input.blur();
    },
    true,
  );
}

function syncFooterNav() {
  syncEditorFooterSaveState();
  syncFooterChatInlineHome();
  const activeNav = footerNavActiveKey();
  document.querySelectorAll('.footer-nav-btn[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', activeNav != null && btn.dataset.nav === activeNav);
  });
  syncFooterChatNav();
  syncFooterInboxNav();
  syncFooterScheduleNav();
  syncFooterWorkNav();
  syncFooterTodoNav();
  syncFooterClientsNav();
  syncFooterNavCountTooltips();
  scheduleFooterNavIndicatorSync();
}

function syncProfileMenuActive() {
  const activeSection = isSettingsMapType(MAP?.type) ? MAP.type : null;
  for (const key of window.__installConfig?.profileMenu || []) {
    const el = document.getElementById(`topbar-${key}-link`);
    if (el) el.classList.toggle('active', activeSection === key);
  }
}

function initFooterNav() {
  document.getElementById('footer-nav-home')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (footerNavCollapsed) {
      expandFooterNav();
      return;
    }
    setActiveMap('home', { force: activeKey === 'home' });
  });
  document.getElementById('footer-nav-chat')?.addEventListener('click', () => {
    activateFooterChatNav();
  });
  document.getElementById('footer-nav-inbox')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (activeKey === 'email') {
      startNewEmail();
      return;
    }
    setActiveMap('email', { force: activeKey === 'email' });
  });
  document.getElementById('footer-nav-schedule')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (activeKey === 'schedule') {
      scheduleEnsureFocusDate();
      scheduleOpenCreateDialog();
      return;
    }
    setActiveMap('schedule', { force: activeKey === 'schedule' });
  });
  document.getElementById('footer-nav-work')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (footerNavShowsSave('work')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'work') {
      startNewProject();
      return;
    }
    setActiveMap('work', { force: activeKey === 'work' });
  });
  document.getElementById('footer-nav-todo')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (activeKey === 'todo') {
      startNewTodo();
      return;
    }
    setActiveMap('todo', { force: activeKey === 'todo' });
  });
  document.getElementById('footer-nav-clients')?.addEventListener('click', () => {
    closeSearchOverlay();
    if (footerNavShowsSave('clients')) {
      void triggerFooterSave();
      return;
    }
    if (activeKey === 'clients') {
      startNewClient();
      return;
    }
    setActiveMap('clients', { force: activeKey === 'clients' });
  });
  window.addEventListener('resize', () => {
    if (!isMobileTabs() && footerNavCollapsed) expandFooterNav();
    syncFooterNavIndicator();
  }, { passive: true });
  initFooterNavIndicatorDrag();
  if (!isMobileTabs() && footerNavCollapsed) expandFooterNav();
  void refreshInboxBadgeQuiet();
}

function openSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-overlay-input');
  if (!overlay) return;
  searchOverlayOpen = true;
  expandFooterNav();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  if (input instanceof HTMLInputElement) input.disabled = false;
  renderSearchResults('');
  syncSearchOverlayClearBtn();
  syncFooterNav();
  requestAnimationFrame(() => input?.focus());
}

function syncSearchOverlayClearBtn() {
  const input = document.getElementById('search-overlay-input');
  const clearBtn = document.getElementById('search-overlay-clear');
  syncSearchFieldAdornment(input, clearBtn);
}

function closeSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay || !searchOverlayOpen) return;
  searchOverlayOpen = false;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  const input = document.getElementById('search-overlay-input');
  if (input instanceof HTMLInputElement) {
    input.value = '';
    input.disabled = true;
  }
  syncSearchOverlayClearBtn();
  syncFooterNav();
}

function toggleSearchOverlay() {
  if (searchOverlayOpen) closeSearchOverlay();
  else openSearchOverlay();
}

function buildSearchResultItem(opts) {
  const { label, sub, icon, onClick, href, external } = opts;
  const el = href ? document.createElement('a') : document.createElement('button');
  el.className = 'search-result-item';
  if (href) {
    el.href = href;
    if (external) {
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  } else {
    el.type = 'button';
    el.addEventListener('click', () => {
      closeSearchOverlay();
      onClick?.();
    });
  }
  el.innerHTML =
    `<span class="search-result-icon">${navIcon(icon || 'search')}</span>` +
    `<span class="search-result-body">` +
      `<div class="search-result-title">${escHtml(label)}</div>` +
      (sub ? `<div class="search-result-sub">${escHtml(sub)}</div>` : '') +
    `</span>`;
  if (href && !external) {
    el.addEventListener('click', () => closeSearchOverlay());
  }
  return el;
}

async function renderSearchResults(query) {
  const root = document.getElementById('search-overlay-results');
  if (!root) return;
  root.innerHTML = '';

  const q = query.trim().toLowerCase();
  const sections = dashboardSectionItems().filter((item) => {
    if (!q) return true;
    return item.label.toLowerCase().includes(q);
  });

  for (const item of sections) {
    if (item.kind === 'href' || item.kind === 'link') {
      root.appendChild(buildSearchResultItem({
        label: item.label,
        sub: item.href?.replace(/^https?:\/\//, '') || '',
        icon: item.icon,
        href: item.href,
        external: item.href?.startsWith('http'),
      }));
      continue;
    }
    root.appendChild(buildSearchResultItem({
      label: item.label,
      sub: 'Open section',
      icon: item.icon,
      onClick: () => setActiveMap(item.key, { force: item.key === activeKey && isPanelMapKey(item.key) }),
    }));
  }

  if (q.length >= 2) {
    try {
      const params = new URLSearchParams({ q: query.trim(), limit: '8' });
      const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
      const data = await res.json();
      const clients = Array.isArray(data.clients) ? data.clients : [];
      for (const client of clients) {
        const name = client.displayName || client.name || client.uid || 'Client';
        root.appendChild(buildSearchResultItem({
          label: name,
          sub: client.email || client.uid || '',
          icon: 'users',
          onClick: () => setActiveMap('clients', { force: true }),
        }));
      }
    } catch {
      // Ignore client search failures in the overlay.
    }
  }

  if (!root.children.length) {
    const empty = document.createElement('div');
    empty.className = 'search-result-empty';
    empty.textContent = q ? 'No matches.' : 'Search sections and clients…';
    root.appendChild(empty);
  }
}

function initSearchOverlay() {
  const input = document.getElementById('search-overlay-input');
  const clearBtn = document.getElementById('search-overlay-clear');
  if (input instanceof HTMLInputElement) input.disabled = !searchOverlayOpen;

  input?.addEventListener('input', () => {
    syncSearchOverlayClearBtn();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => renderSearchResults(input.value), 180);
  });

  const resultsRoot = document.getElementById('search-overlay-results');
  if (input instanceof HTMLInputElement && resultsRoot && !input.dataset.keyNavBound) {
    input.dataset.keyNavBound = '1';
    attachAutosuggestKeyboardNav(input, resultsRoot, {
      optionSelector: '.search-result-item',
      onClose: () => closeSearchOverlay(),
    });
  }

  clearBtn?.addEventListener('click', () => {
    if (!(input instanceof HTMLInputElement) || !(clearBtn instanceof HTMLButtonElement)) return;
    if (clearBtn.dataset.mode === 'clear') {
      input.value = '';
      syncSearchFieldAdornment(input, clearBtn);
      renderSearchResults('');
      input.focus();
    } else {
      input.focus();
    }
  });

  syncSearchOverlayClearBtn();

  if (!document.documentElement.dataset.searchOverlayBound) {
    document.documentElement.dataset.searchOverlayBound = '1';
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && searchOverlayOpen) closeSearchOverlay();
    });
  }
}

async function buildMobileToolsMenu(order) {
  cachedTabOrder = order || cachedTabOrder;
  if (activeKey === 'home') loadHomeDashboard();
}

let reviewsPendingCount = 0;

const footerNavCounts = {
  chats: null,
  emails: null,
  meetings: null,
  projects: null,
  todos: null,
  clients: null,
};

function footerNavCountLabel(n, singular, plural) {
  const num = Math.max(0, Number(n) || 0);
  return `${num} ${num === 1 ? singular : plural}`;
}

function footerNavShowsCountTooltip(btn) {
  return (
    btn &&
    !btn.classList.contains('footer-nav-btn--create') &&
    !btn.classList.contains('footer-nav-btn--save')
  );
}

function syncFooterNavCountTooltips() {
  const defs = [
    { id: 'footer-nav-chat', key: 'chats', singular: 'chat', plural: 'chats' },
    { id: 'footer-nav-inbox', key: 'emails', singular: 'email', plural: 'emails' },
    { id: 'footer-nav-schedule', key: 'meetings', singular: 'meeting', plural: 'meetings' },
    { id: 'footer-nav-work', key: 'projects', singular: 'project', plural: 'projects' },
    { id: 'footer-nav-todo', key: 'todos', singular: 'to-do', plural: 'to-dos' },
    { id: 'footer-nav-clients', key: 'clients', singular: 'client', plural: 'clients' },
  ];

  document.getElementById('footer-nav-home')?.removeAttribute('data-footer-count');

  for (const { id, key, singular, plural } of defs) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    if (!footerNavShowsCountTooltip(btn)) {
      btn.removeAttribute('data-footer-count');
      continue;
    }
    const raw = footerNavCounts[key];
    if (raw == null) {
      btn.removeAttribute('data-footer-count');
      continue;
    }
    btn.setAttribute('data-footer-count', footerNavCountLabel(raw, singular, plural));
  }
}

function syncReviewBadge(count) {
  reviewsPendingCount = Math.max(0, Number(count) || 0);
  window.ReviewBadge?.sync(reviewsPendingCount);
}

function syncDashboardFooterBadges(stats) {
  if (!stats || typeof stats !== 'object') return;
  syncReviewBadge(stats.reviewsPending ?? stats.automationPending ?? 0);
  footerNavCounts.chats = stats.chats ?? 0;
  footerNavCounts.emails = stats.emailsTotal ?? stats.emails ?? 0;
  footerNavCounts.meetings = stats.meetingsTotal ?? null;
  footerNavCounts.projects = stats.projectsTotal ?? stats.projectsPending ?? 0;
  footerNavCounts.todos = stats.todosOpen ?? 0;
  footerNavCounts.clients = stats.clients ?? null;
  syncFooterNavCountTooltips();
}

function syncDashboardFooterBadgesWithoutReview(stats) {
  if (!stats || typeof stats !== 'object') return;
  footerNavCounts.chats = stats.chats ?? 0;
  footerNavCounts.emails = stats.emailsTotal ?? stats.emails ?? 0;
  footerNavCounts.meetings = stats.meetingsTotal ?? null;
  footerNavCounts.projects = stats.projectsTotal ?? stats.projectsPending ?? 0;
  footerNavCounts.todos = stats.todosOpen ?? 0;
  footerNavCounts.clients = stats.clients ?? null;
  syncFooterNavCountTooltips();
}

function initTopbarMenus() {
  if (!document.documentElement.dataset.topbarMenuBound) {
    document.documentElement.dataset.topbarMenuBound = '1';
    document.addEventListener('click', () => {
      closeTopbarMenus();
      document.getElementById('topbar-deploy-dot')?.classList.remove('tooltip-open');
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        closeTopbarMenus();
        document.getElementById('topbar-deploy-dot')?.classList.remove('tooltip-open');
      }
    });
  }

  const profileToggle = document.getElementById('topbar-profile-toggle');
  const profileMenu = document.getElementById('topbar-profile-menu');
  if (profileToggle && profileMenu && !profileToggle.dataset.bound) {
    profileToggle.dataset.bound = '1';
    profileToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleTopbarMenu(profileMenu, profileToggle);
    });
  }

  for (const key of window.__installConfig?.profileMenu || []) {
    const el = document.getElementById(`topbar-${key}-link`);
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        closeTopbarMenus();
        setActiveMap(key, { force: activeKey === key });
      });
    }
  }

  const signOutBtn = document.getElementById('topbar-sign-out');
  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.dataset.bound = '1';
    signOutBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      closeTopbarMenus();
      const clerk = window.Clerk;
      if (clerk) {
        await clerk.signOut();
        window.location.href = '/';
      } else {
        window.location.href = '/sign-out';
      }
    });
  }

  const logoLink = document.querySelector('.app-header-logo');
  if (logoLink && !logoLink.dataset.bound) {
    logoLink.dataset.bound = '1';
    logoLink.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      closeTopbarMenus();
      closeSearchOverlay();
      setActiveMap('home', { force: true });
    });
  }
}

const DEPLOY_POLL_MS = 60_000;
let deployPollTimer = null;

async function refreshDeployDot() {
  const dot = document.getElementById('topbar-deploy-dot');
  if (!dot) return;
  try {
    const res = await fetch('/api/admin/deploy-status', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.deploy) {
      dot.hidden = true;
      return;
    }
    const { tone, tooltip } = data.deploy;
    dot.hidden = false;
    dot.className = `topbar-deploy-dot topbar-deploy-dot--${tone || 'alert'} tt-left`;
    dot.dataset.tooltip = tooltip || 'Deploy status unavailable';
    dot.setAttribute('aria-label', tooltip || 'Deploy status');
  } catch {
    dot.hidden = false;
    dot.className = 'topbar-deploy-dot topbar-deploy-dot--alert tt-left';
    dot.dataset.tooltip = 'Could not check deploy status';
    dot.setAttribute('aria-label', 'Could not check deploy status');
  }
}

function startDeployPoll() {
  stopDeployPoll();
  void refreshDeployDot();
  deployPollTimer = setInterval(() => void refreshDeployDot(), DEPLOY_POLL_MS);
}

function stopDeployPoll() {
  if (deployPollTimer) {
    clearInterval(deployPollTimer);
    deployPollTimer = null;
  }
}

function initDeployIndicator() {
  const dot = document.getElementById('topbar-deploy-dot');
  if (!dot || dot.dataset.deployBound) return;
  dot.dataset.deployBound = '1';
  dot.addEventListener('click', (ev) => {
    ev.stopPropagation();
    dot.classList.toggle('tooltip-open');
  });
  startDeployPoll();
}

document.addEventListener('click', () => closeTabDropdowns());

// ---- legend ----
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  for (const g of MAP.groups) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span class="dot" style="background:hsl(${g.hue} 75% 58%)"></span>${g.title}`;
    legend.appendChild(chip);
  }

  // Status key (only meaningful on the live System map).
  if (activeKey === 'system') {
    const states = [
      ['up', 'Online'],
      ['down', 'Down'],
      ['configured', 'Configured'],
      ['unconfigured', 'Not set'],
      ['unknown', 'Unknown'],
    ];
    for (const [s, label] of states) {
      const chip = document.createElement('span');
      chip.className = `chip st-key st-${s}`;
      chip.innerHTML = `<span class="dot st-dot"></span>${label}`;
      legend.appendChild(chip);
    }
  }
}

// ---- rules tab (list + editor, like Knowledge/Work) ----

// ───────────────────────── Newsletter / email automation ─────────────────────────
let newsletterState = {
  enabled: false,
  automations: [],
  templates: [],
  sends: [],
  composeTemplate: '',
};

function getNewsletterEditor() {
  return document.getElementById('newsletter-editor');
}

function nlDelayLabel(mins) {
  const m = Number(mins) || 0;
  if (m === 0) return 'immediately';
  if (m % 1440 === 0) return `${m / 1440} day${m / 1440 === 1 ? '' : 's'}`;
  if (m % 60 === 0) return `${m / 60} hour${m / 60 === 1 ? '' : 's'}`;
  return `${m} min`;
}

/** Split minutes into a {value, unit} pair for the delay editor. */
function nlDelayParts(mins) {
  const m = Number(mins) || 0;
  if (m === 0) return { value: 0, unit: 'minutes' };
  if (m % 1440 === 0) return { value: m / 1440, unit: 'days' };
  if (m % 60 === 0) return { value: m / 60, unit: 'hours' };
  return { value: m, unit: 'minutes' };
}

function nlPartsToMinutes(value, unit) {
  const v = Math.max(0, Number(value) || 0);
  if (unit === 'days') return Math.round(v * 1440);
  if (unit === 'hours') return Math.round(v * 60);
  return Math.round(v);
}

async function loadNewsletterTab() {
  const root = getNewsletterEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading newsletter…</div>';
  try {
    const [aRes, tRes, sRes] = await Promise.all([
      fetch('/api/newsletter/automations', { cache: 'no-store' }),
      fetch('/api/newsletter/templates', { cache: 'no-store' }),
      fetch('/api/newsletter/sends?limit=50', { cache: 'no-store' }),
    ]);
    const a = await aRes.json();
    const t = await tRes.json();
    const s = await sRes.json();
    if (!aRes.ok) throw new Error(a.error || `HTTP ${aRes.status}`);
    newsletterState.enabled = !!a.enabled;
    newsletterState.automations = a.automations || [];
    newsletterState.templates = (t && t.templates) || [];
    newsletterState.sends = (s && s.sends) || [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load newsletter: ${escHtml(e.message)}</div>`;
    return;
  }
  renderNewsletterEditor();
}

function nlBroadcastTemplates() {
  const list = newsletterState.templates.filter((t) => t.kind === 'broadcast');
  return list.length ? list : newsletterState.templates;
}

function renderNewsletterEditor() {
  const root = getNewsletterEditor();
  if (!root) return;
  const { enabled, automations } = newsletterState;
  const broadcastTemplates = nlBroadcastTemplates();
  if (!newsletterState.composeTemplate && broadcastTemplates[0]) {
    newsletterState.composeTemplate = broadcastTemplates[0].id;
  }

  const statusPill = enabled
    ? '<span style="color:#4ade80">● Active</span>'
    : '<span style="color:#f87171">● Inactive</span>';

  const disabledNote = enabled
    ? ''
    : `<div class="nl-warn">Sending is off. Enable the <b>email_marketing</b> feature and set <b>RESEND_API_KEY</b> to activate. You can still configure automations and drafts below.</div>`;

  const automationRows = automations
    .map((a) => {
      const parts = nlDelayParts(a.delayMinutes);
      return `
      <div class="nl-auto-row" data-id="${escHtml(a.id)}">
        <div class="nl-auto-main">
          <label class="nl-switch">
            <input type="checkbox" class="nl-auto-enabled" ${a.enabled ? 'checked' : ''} />
            <span class="nl-switch-track"></span>
          </label>
          <div class="nl-auto-text">
            <div class="nl-auto-title">${escHtml(a.label)}</div>
            <div class="nl-auto-desc">${escHtml(a.description)}</div>
          </div>
        </div>
        <div class="nl-auto-delay">
          <span class="nl-delay-lead">Send</span>
          <input type="number" min="0" class="nl-delay-value" value="${parts.value}" />
          <select class="nl-delay-unit">
            <option value="minutes" ${parts.unit === 'minutes' ? 'selected' : ''}>min</option>
            <option value="hours" ${parts.unit === 'hours' ? 'selected' : ''}>hours</option>
            <option value="days" ${parts.unit === 'days' ? 'selected' : ''}>days</option>
          </select>
          <span class="nl-delay-lead">after ${a.trigger === 'contact_created' ? 'signup' : 'completion'}</span>
        </div>
      </div>`;
    })
    .join('');

  const templateOptions = broadcastTemplates
    .map(
      (t) =>
        `<option value="${escHtml(t.id)}" ${t.id === newsletterState.composeTemplate ? 'selected' : ''}>${escHtml(t.icon)} ${escHtml(t.label)}</option>`,
    )
    .join('');

  const sendRows = newsletterState.sends.length
    ? newsletterState.sends
        .map((s) => {
          const when = s.sentAt || s.dueAt || s.createdAt;
          const whenLabel = when ? new Date(when).toLocaleString() : '';
          const color =
            s.status === 'sent'
              ? '#4ade80'
              : s.status === 'failed'
                ? '#f87171'
                : s.status === 'skipped'
                  ? '#a1a1aa'
                  : '#c084fc';
          return `
        <div class="nl-log-row">
          <span class="nl-log-status" style="color:${color}">${escHtml(s.status)}</span>
          <span class="nl-log-to">${escHtml(s.toEmail)}</span>
          <span class="nl-log-subj">${escHtml(s.subject || s.templateId)}</span>
          <span class="nl-log-src">${escHtml(s.source)}</span>
          <span class="nl-log-when">${escHtml(whenLabel)}</span>
        </div>`;
        })
        .join('')
    : '<div class="de-empty" style="padding:0.75rem">No emails sent yet.</div>';

  root.innerHTML = `
    <div class="nl-wrap">
      <div class="nl-head">
        <div>
          <div class="nl-title">Newsletter &amp; Automation</div>
          <div class="nl-sub">Lifecycle emails + broadcasts · ${statusPill}</div>
        </div>
        <button type="button" class="nl-btn nl-refresh">Refresh</button>
      </div>
      ${disabledNote}

      <div class="nl-card">
        <div class="nl-card-title">Automations <span class="nl-card-hint">— when lifecycle emails fire</span></div>
        <div class="nl-auto-list">${automationRows || '<div class="de-empty">No automations.</div>'}</div>
      </div>

      <div class="nl-card">
        <div class="nl-card-title">Send a broadcast <span class="nl-card-hint">— one-off email to all contacts</span></div>
        <label class="nl-field"><span>Template</span>
          <select class="nl-compose-template">${templateOptions}</select>
        </label>
        <label class="nl-field"><span>Subject <em>(optional — template default used if blank)</em></span>
          <input type="text" class="nl-compose-subject" placeholder="Subject line" />
        </label>
        <label class="nl-field"><span>Heading / lead line <em>(optional)</em></span>
          <input type="text" class="nl-compose-heading" placeholder="Opening line" />
        </label>
        <label class="nl-field"><span>Body <em>(optional — blank paragraphs use template copy)</em></span>
          <textarea class="nl-compose-body" rows="5" placeholder="Write your message. Separate paragraphs with a blank line."></textarea>
        </label>
        <div class="nl-field-row">
          <label class="nl-field"><span>Button link <em>(optional)</em></span>
            <input type="text" class="nl-compose-cta-url" placeholder="https://…" />
          </label>
          <label class="nl-field"><span>Button label</span>
            <input type="text" class="nl-compose-cta-label" placeholder="Learn more" />
          </label>
        </div>
        <div class="nl-actions">
          <button type="button" class="nl-btn nl-preview">Preview</button>
          <button type="button" class="nl-btn nl-btn-primary nl-send">Send to all contacts</button>
          <span class="nl-send-status"></span>
        </div>
        <div class="nl-preview-box" style="display:none"></div>
      </div>

      <div class="nl-card">
        <div class="nl-card-title">Recent sends</div>
        <div class="nl-log">${sendRows}</div>
      </div>
    </div>`;

  wireNewsletterEditor(root);
}

function nlComposePayload(root) {
  return {
    templateId: root.querySelector('.nl-compose-template')?.value || '',
    subject: root.querySelector('.nl-compose-subject')?.value.trim() || undefined,
    heading: root.querySelector('.nl-compose-heading')?.value.trim() || undefined,
    body: root.querySelector('.nl-compose-body')?.value.trim() || undefined,
    ctaUrl: root.querySelector('.nl-compose-cta-url')?.value.trim() || undefined,
    ctaLabel: root.querySelector('.nl-compose-cta-label')?.value.trim() || undefined,
  };
}

function wireNewsletterEditor(root) {
  root.querySelector('.nl-refresh')?.addEventListener('click', () => void loadNewsletterTab());

  root.querySelector('.nl-compose-template')?.addEventListener('change', (e) => {
    newsletterState.composeTemplate = e.target.value;
  });

  // Automation autosave (enable toggle + delay).
  root.querySelectorAll('.nl-auto-row').forEach((rowEl) => {
    const id = rowEl.getAttribute('data-id');
    const saveDelay = async () => {
      const value = rowEl.querySelector('.nl-delay-value')?.value;
      const unit = rowEl.querySelector('.nl-delay-unit')?.value;
      await nlSaveAutomation(id, { delayMinutes: nlPartsToMinutes(value, unit) });
    };
    rowEl.querySelector('.nl-auto-enabled')?.addEventListener('change', async (e) => {
      await nlSaveAutomation(id, { enabled: e.target.checked });
    });
    rowEl.querySelector('.nl-delay-value')?.addEventListener('change', saveDelay);
    rowEl.querySelector('.nl-delay-unit')?.addEventListener('change', saveDelay);
  });

  root.querySelector('.nl-preview')?.addEventListener('click', async () => {
    const box = root.querySelector('.nl-preview-box');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<div class="de-loading">Rendering preview…</div>';
    try {
      const res = await fetch('/api/newsletter/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nlComposePayload(root)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const frame = document.createElement('iframe');
      frame.className = 'nl-preview-frame';
      frame.setAttribute('sandbox', '');
      box.innerHTML = `<div class="nl-preview-subj">Subject: ${escHtml(data.subject)}</div>`;
      box.appendChild(frame);
      frame.srcdoc = data.html;
    } catch (e) {
      box.innerHTML = `<div class="de-error">Preview failed: ${escHtml(e.message)}</div>`;
    }
  });

  root.querySelector('.nl-send')?.addEventListener('click', async () => {
    const statusEl = root.querySelector('.nl-send-status');
    const btn = root.querySelector('.nl-send');
    if (!confirm('Send this email to ALL contacts with an email address? This cannot be undone.')) return;
    btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Sending…';
    try {
      const res = await fetch('/api/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nlComposePayload(root), audience: 'all', sendNow: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (statusEl)
        statusEl.textContent = `Queued ${data.queued} · sent ${data.sent || 0} · skipped ${(data.skippedUnsubscribed || 0) + (data.skippedNoEmail || 0)}`;
      setTimeout(() => void loadNewsletterTab(), 800);
    } catch (e) {
      if (statusEl) statusEl.textContent = `Failed: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  });
}

async function nlSaveAutomation(id, patch) {
  try {
    const res = await fetch('/api/newsletter/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const idx = newsletterState.automations.findIndex((a) => a.id === id);
    if (idx !== -1 && data.automation) newsletterState.automations[idx] = data.automation;
  } catch (e) {
    alert(`Could not save automation: ${e.message}`);
    void loadNewsletterTab();
  }
}

let ruleState = {
  rules: [],
  notifyOnUnmatched: true,
  storage: 'files',
  search: '',
  activeId: null,
  dirty: false,
};

function getRuleEditor() {
  return document.getElementById('rule-editor');
}

function ruleSubline(rule) {
  const bits = [];
  if (rule.status) bits.push(rule.status);
  bits.push(rule.notify ? 'Notify' : 'Silent');
  if (!rule.enabled) bits.push('Off');
  return bits.join(' · ');
}

function appendRuleField(parent, label, el) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  wrap.appendChild(el);
  parent.appendChild(wrap);
}

async function loadRulesTab() {
  const root = getRuleEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading rules…</div>';
  try {
    const res = await fetch('/api/email/rules', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.rules = data.rules || [];
    ruleState.notifyOnUnmatched = !!data.notifyOnUnmatched;
    ruleState.storage = data.storage || 'files';
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load rules: ${escHtml(e.message)}</div>`;
    return;
  }
  if (ruleState.activeId && !ruleState.rules.some((r) => r.id === ruleState.activeId)) {
    ruleState.activeId = null;
    ruleState.dirty = false;
    getRuleEditor()?.classList.remove('de-pane-active');
  }
  renderRulesEditor();
}

function createRuleListItem(rule, activeId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ch-list-item${activeId === rule.id ? ' active' : ''}${rule.enabled === false ? ' re-list-disabled' : ''}`;
  btn.dataset.id = rule.id;
  btn.innerHTML = `
    <span class="ch-item-row">
      <span class="ch-item-title">${escHtml(rule.title || rule.status)}</span>
    </span>
    <span class="de-item-slug">${escHtml(ruleSubline(rule))}</span>`;
  btn.addEventListener('click', () => openRuleEditor(rule.id));
  return btn;
}

function createRuleSwipeRow(rule, activeId) {
  return createSwipeRow(createRuleListItem(rule, activeId), [
    swipeAgentAction(() => askAgentAboutRule(rule)),
    swipeDeleteAction({
      onClick: () => deleteRule(rule.id),
    }),
  ]);
}

function renderRulesEditor() {
  const root = getRuleEditor();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const { rules, activeId, notifyOnUnmatched, storage } = ruleState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const ordered = [...rules]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((rule) =>
      matchesListSearch(ruleState.search, rule.title, rule.status, ruleSubline(rule), rule.description),
    );

  const subheader = listSearchSubheader({
    itemCount: rules.length,
    search: {
      value: ruleState.search,
      placeholder: `Search ${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`,
      onInput: (value) => {
        ruleState.search = value;
        renderRulesEditor();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.65rem 0.5rem';
  hint.textContent = 'First match wins · inbound email triage';
  sidebar.appendChild(hint);

  if (storage === 'files') {
    const warn = document.createElement('div');
    warn.className = 're-warn-inline';
    warn.textContent = 'Using local file storage — set DATABASE_URL on Railway for production.';
    sidebar.appendChild(warn);
  }

  const settings = document.createElement('div');
  settings.className = 're-settings';
  const notifyLb = document.createElement('label');
  notifyLb.className = 're-check';
  const notifyCb = document.createElement('input');
  notifyCb.type = 'checkbox';
  notifyCb.checked = notifyOnUnmatched;
  notifyCb.addEventListener('change', async (e) => {
    const next = e.target.checked;
    try {
      const res = await fetch('/api/email/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyOnUnmatched: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ruleState.notifyOnUnmatched = next;
    } catch (err) {
      e.target.checked = !next;
      alert(`Could not save setting: ${err.message}`);
    }
  });
  notifyLb.append(notifyCb, document.createTextNode(' Notify when no rule matches'));
  settings.appendChild(notifyLb);
  sidebar.appendChild(settings);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const rule of ordered) {
    list.appendChild(createRuleSwipeRow(rule, activeId));
  }
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = ruleState.search.trim() ? 'No matches.' : 'No rules yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  if (activeId) {
    renderRuleEditPane(pane);
  } else {
    clearEditorFooterSave();
    appendEmptyDetailPane(pane, {
      mapKey: 'rules',
      iconName: 'zap',
      bodyHtml: '<p>Select a rule to edit, or create a new one.</p>',
      onCreate: () => void startNewRule(),
    });
  }
  root.appendChild(pane);
  finishSidebarListScroll(root, savedSidebarScroll);
}

async function openRuleEditor(id) {
  await flushRuleAutosave();
  if (ruleState.dirty && ruleState.activeId && ruleState.activeId !== id) {
    if (!(await confirmDiscardChanges())) return;
  }
  ruleState.activeId = id;
  ruleState.dirty = false;
  getRuleEditor()?.classList.add('de-pane-active');
  renderRulesEditor();
}

async function closeRuleEditor(checkDirty = true) {
  await flushRuleAutosave();
  if (checkDirty && ruleState.dirty && !(await confirmDiscardChanges())) return;
  ruleState.activeId = null;
  ruleState.dirty = false;
  clearEditorFooterSave();
  getRuleEditor()?.classList.remove('de-pane-active');
  renderRulesEditor();
}

function renderRuleEditPane(pane) {
  const rule = ruleState.rules.find((r) => r.id === ruleState.activeId);
  if (!rule) {
    pane.innerHTML = '<div class="de-loading de-error">Rule not found.</div>';
    return;
  }

  const agentBtn = document.createElement('button');
  agentBtn.type = 'button';
  agentBtn.className = 'de-new-btn em-agent-btn em-header-action-btn';
  agentBtn.setAttribute('aria-label', 'Agent');
  agentBtn.title = 'Agent';
  agentBtn.innerHTML = navIcon('agent', 16);
  agentBtn.addEventListener('click', () => askAgentAboutRule(rule));

  const header = createPaneSubheader({
    back: { label: 'Back to rules', onClick: () => closeRuleEditor() },
    title: rule.title || rule.status || 'Rule',
    subtitle: rule.status || '',
    beforeIcons: [agentBtn],
    icons: [
      paneDeleteIcon({
        label: 'Delete rule',
        onClick: () => deleteRule(rule.id),
      }),
    ],
  }).header;
  pane.appendChild(header);

  const form = document.createElement('div');
  form.className = 're-form-scroll';

  const titleIn = document.createElement('input');
  titleIn.className = 'de-input';
  titleIn.type = 'text';
  titleIn.value = rule.title || '';
  titleIn.addEventListener('input', () => { ruleState.dirty = true; });

  const statusIn = document.createElement('input');
  statusIn.className = 'de-input';
  statusIn.type = 'text';
  statusIn.value = rule.status || '';
  statusIn.placeholder = 'DOWN, RECEIPT, …';
  statusIn.addEventListener('input', () => { ruleState.dirty = true; });

  const descIn = document.createElement('textarea');
  descIn.className = 're-textarea';
  descIn.rows = 2;
  descIn.value = rule.description || '';
  descIn.addEventListener('input', () => { ruleState.dirty = true; });

  const phrasesIn = document.createElement('textarea');
  phrasesIn.className = 're-textarea';
  phrasesIn.rows = 6;
  phrasesIn.placeholder = 'One keyword or phrase per line';
  phrasesIn.value = (rule.phrases || []).join('\n');
  phrasesIn.addEventListener('input', () => { ruleState.dirty = true; });

  const matchSel = document.createElement('select');
  matchSel.className = 'de-input';
  matchSel.innerHTML = '<option value="any">Any phrase matches</option><option value="all">All phrases must match</option>';
  matchSel.value = rule.matchMode === 'all' ? 'all' : 'any';
  matchSel.addEventListener('change', () => { ruleState.dirty = true; });

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 're-checks';
  const fieldSet = new Set(rule.fields || ['subject', 'body']);
  for (const [val, lab] of [['subject', 'Subject'], ['body', 'Body'], ['from', 'From']]) {
    const lb = document.createElement('label');
    lb.className = 're-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    cb.checked = fieldSet.has(val);
    cb.addEventListener('change', () => { ruleState.dirty = true; });
    lb.append(cb, document.createTextNode(` ${lab}`));
    fieldsWrap.appendChild(lb);
  }

  const notifyLb = document.createElement('label');
  notifyLb.className = 're-check';
  const notifyCb = document.createElement('input');
  notifyCb.type = 'checkbox';
  notifyCb.checked = !!rule.notify;
  notifyCb.addEventListener('change', () => { ruleState.dirty = true; });
  notifyLb.append(notifyCb, document.createTextNode(' Send push alert'));

  const enabledLb = document.createElement('label');
  enabledLb.className = 're-check';
  const enabledCb = document.createElement('input');
  enabledCb.type = 'checkbox';
  enabledCb.checked = rule.enabled !== false;
  enabledCb.addEventListener('change', () => { ruleState.dirty = true; });
  enabledLb.append(enabledCb, document.createTextNode(' Rule enabled'));

  appendRuleField(form, 'Title', titleIn);
  appendRuleField(form, 'Status tag', statusIn);
  appendRuleField(form, 'Description', descIn);
  appendRuleField(form, 'Keywords / phrases', phrasesIn);
  appendRuleField(form, 'Match mode', matchSel);
  appendRuleField(form, 'Search in', fieldsWrap);
  form.appendChild(notifyLb);
  form.appendChild(enabledLb);
  pane.appendChild(form);

  const ruleInputs = {
    titleIn,
    statusIn,
    descIn,
    phrasesIn,
    matchSel,
    fieldsWrap,
    notifyCb,
    enabledCb,
  };
  bindRuleAutosave(rule, ruleInputs);
  clearEditorFooterSave();
}

function collectRulePayload(inputs) {
  const fields = [];
  inputs.fieldsWrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    if (cb.checked) fields.push(cb.value);
  });
  return {
    title: inputs.titleIn.value.trim(),
    status: inputs.statusIn.value.trim(),
    description: inputs.descIn.value.trim(),
    phrases: inputs.phrasesIn.value.split('\n').map((s) => s.trim()).filter(Boolean),
    matchMode: inputs.matchSel.value,
    fields: fields.length ? fields : ['subject', 'body'],
    notify: inputs.notifyCb.checked,
    enabled: inputs.enabledCb.checked,
  };
}

let ruleAutosaveTimer = null;
let ruleAutosaveFlush = null;

function serializeRulePayload(payload) {
  return JSON.stringify(payload);
}

function syncRuleListItem(id, payload) {
  const rule = ruleState.rules.find((r) => r.id === id);
  if (rule) Object.assign(rule, payload);
  const row = getRuleEditor()?.querySelector(`.ch-list-item[data-id="${CSS.escape(id)}"] .ch-item-title`);
  if (row) row.textContent = payload.title || payload.status || 'Rule';
}

function bindRuleAutosave(rule, inputs) {
  let baseline = serializeRulePayload(collectRulePayload(inputs));
  let activeEl = null;
  let saving = false;
  let pendingFlush = false;

  const allFields = () => [
    inputs.titleIn,
    inputs.statusIn,
    inputs.descIn,
    inputs.phrasesIn,
    inputs.matchSel,
    ...inputs.fieldsWrap.querySelectorAll('input[type=checkbox]'),
    inputs.notifyCb,
    inputs.enabledCb,
  ];

  const flush = async () => {
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = null;

    if (saving) {
      pendingFlush = true;
      return;
    }

    const payload = collectRulePayload(inputs);
    const current = serializeRulePayload(payload);
    if (current === baseline) {
      ruleState.dirty = false;
      return;
    }
    if (!payload.title || !payload.status) {
      if (activeEl) setFormFieldState(activeEl, 'invalid');
      return;
    }

    saving = true;
    if (activeEl) setFormFieldState(activeEl, 'saving');

    try {
      const res = await fetch(`/api/email/rules/${encodeURIComponent(rule.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      baseline = current;
      ruleState.dirty = false;
      syncRuleListItem(rule.id, payload);
      if (activeEl) flashFormFieldSaved(activeEl);
    } catch (e) {
      console.warn('[rules] autosave failed', e);
      if (activeEl) setFormFieldState(activeEl, 'invalid');
    } finally {
      saving = false;
      if (
        activeEl &&
        !activeEl.classList.contains(FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(FORM_FIELD_INVALID)
      ) {
        setFormFieldState(activeEl, null);
      }
      if (pendingFlush) {
        pendingFlush = false;
        await flush();
      }
    }
  };

  const schedule = (el) => {
    activeEl = el;
    ruleState.dirty = serializeRulePayload(collectRulePayload(inputs)) !== baseline;
    if (!el.classList.contains(FORM_FIELD_INVALID) && !el.classList.contains(FORM_FIELD_SAVED)) {
      setFormFieldState(el, null);
    }
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  };

  for (const el of allFields()) {
    const handler = () => schedule(el);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    el.addEventListener('blur', () => {
      activeEl = el;
      const payload = collectRulePayload(inputs);
      if (!payload.title && el === inputs.titleIn) setFormFieldState(el, 'invalid');
      else if (!payload.status && el === inputs.statusIn) setFormFieldState(el, 'invalid');
      clearTimeout(ruleAutosaveTimer);
      void flush();
    });
    el.addEventListener('focus', () => {
      if (!el.classList.contains(FORM_FIELD_INVALID)) setFormFieldState(el, null);
    });
  }

  ruleAutosaveFlush = flush;
}

async function flushRuleAutosave() {
  if (ruleAutosaveTimer) {
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = null;
  }
  if (typeof ruleAutosaveFlush === 'function') {
    await ruleAutosaveFlush();
    ruleAutosaveFlush = null;
  }
}

async function saveRule(id, inputs) {
  const payload = collectRulePayload(inputs);
  if (!payload.title || !payload.status) {
    alert('Title and status tag are required.');
    return;
  }
  if (inputs.saveBtn) {
    inputs.saveBtn.disabled = true;
    inputs.saveBtn.textContent = 'Saving…';
  }
  try {
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.dirty = false;
    await loadRulesTab();
    openRuleEditor(id);
  } catch (e) {
    if (inputs.saveBtn) {
      inputs.saveBtn.textContent = 'Save';
      inputs.saveBtn.disabled = false;
    }
    alert(`Save failed: ${e.message}`);
  }
}

async function deleteRule(id) {
  try {
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ruleState.dirty = false;
    ruleState.activeId = null;
    getRuleEditor()?.classList.remove('de-pane-active');
    await loadRulesTab();
  } catch (e) {
    alert(`Delete failed: ${e.message}`);
  }
}

async function startNewRule() {
  if (ruleState.dirty && !(await confirmDiscardChanges())) return;
  try {
    const res = await fetch('/api/email/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New rule',
        status: 'CUSTOM',
        description: '',
        phrases: [],
        matchMode: 'any',
        fields: ['subject', 'body'],
        notify: true,
        enabled: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.activeId = data.rule.id;
    ruleState.dirty = false;
    await loadRulesTab();
    openRuleEditor(data.rule.id);
  } catch (e) {
    alert(`Could not create rule: ${e.message}`);
  }
}

// ---- todo tab ----

const TODO_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const TODO_STATUS_LABELS = {
  open: 'Open',
  done: 'Done',
};

let todoState = {
  todos: [],
  jobs: [],
  priorities: ['low', 'normal', 'high', 'urgent'],
  statuses: ['open', 'done'],
  search: '',
  filter: 'open',
  activeId: null,
  dirty: false,
  draft: null,
  linkedJob: null,
  returnToWorkSlug: null,
};

let todoSaveTimer = null;

function getTodoEditor() {
  return document.getElementById('todo-editor');
}

function todoJobTitle(slug) {
  if (!slug) return '';
  const job = todoState.jobs.find((j) => j.slug === slug);
  return job?.title || slug;
}

const TODO_WEEKDAY_SHORT = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];

/** True for legacy DATE-only values stored as UTC midnight. */
function isUtcDateOnlyInstant(raw, d) {
  if (!d) return false;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return true;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

function parseTodoDueInstant(raw) {
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

function normalizeTodoDueDateRaw(raw) {
  if (raw == null || raw === '') return null;
  const d = parseTodoDueInstant(raw);
  return d ? d.toISOString() : null;
}

function normalizeTodoItemDates(todo) {
  if (!todo || typeof todo !== 'object') return todo;
  return { ...todo, due_date: normalizeTodoDueDateRaw(todo.due_date) };
}

function todoDueDatePart(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  if (isUtcDateOnlyInstant(raw, d)) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function todoDueTimePart(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  if (isUtcDateOnlyInstant(raw, d)) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function combineTodoDueDateTime(dateStr, timeStr) {
  if (!dateStr?.trim()) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr?.trim() || '00:00').split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function formatTodoDueTime(d) {
  const h = d.getHours();
  const min = d.getMinutes();
  if (h === 0 && min === 0) return null;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  if (min === 0) return `${hour12}${period}`;
  return `${hour12}:${String(min).padStart(2, '0')}${period}`;
}

function formatTodoDueDate(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  const dateOnly = isUtcDateOnlyInstant(raw, d);
  const wd = dateOnly
    ? TODO_WEEKDAY_SHORT[new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getUTCDay()]
    : TODO_WEEKDAY_SHORT[d.getDay()];
  const month = dateOnly
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toLocaleDateString(undefined, {
        month: 'short',
        timeZone: 'UTC',
      })
    : d.toLocaleDateString(undefined, { month: 'short' });
  const day = dateOnly ? d.getUTCDate() : d.getDate();
  const time = dateOnly ? null : formatTodoDueTime(d);
  const datePart = `${wd}, ${month} ${day}`;
  return time ? `Due ${datePart} @ ${time}` : `Due ${datePart}`;
}

function todoSubline(todo) {
  const bits = [];
  if (todo.section) bits.push(todo.section);
  if (todo.job_slug) bits.push(todoJobTitle(todo.job_slug));
  if (todo.assignee) bits.push(todo.assignee);
  if (todo.due_date) bits.push(formatTodoDueDate(todo.due_date));
  if (todo.priority && todo.priority !== 'normal') {
    bits.push(TODO_PRIORITY_LABELS[todo.priority] || todo.priority);
  }
  return bits.join(' · ');
}

function todoPriorityDotClass(priority) {
  if (priority === 'urgent' || priority === 'high' || priority === 'low') {
    return `td-priority-dot td-priority-dot--${priority}`;
  }
  return 'td-priority-dot';
}

function todoSearchPlaceholder() {
  const count = todoState.todos.filter((t) => t.status === todoState.filter).length;
  const label = count === 1 ? 'To Do Item' : 'To Do Items';
  return `Search ${count} ${label}`;
}

function filterTodoItems(todos) {
  const q = todoState.search.trim().toLowerCase();
  return todos.filter((todo) => {
    if (todo.status !== todoState.filter) return false;
    if (!q) return true;
    return matchesListSearch(
      q,
      todo.title,
      todo.section,
      todo.assignee,
      todo.job_slug ? todoJobTitle(todo.job_slug) : '',
      todoSubline(todo),
    );
  });
}

async function loadTodoTab(opts = {}) {
  const root = getTodoEditor();
  if (!root) return;
  const preserveNew =
    todoState.activeId === '__new__' &&
    todoState.draft &&
    (opts.todoId === '__new__' || pendingTodoDeepLinkId === '__new__');
  if (!preserveNew) {
    root.innerHTML = '<div class="de-loading">Loading to‑dos…</div>';
  }
  try {
    const todoRes = await adminFetch('/api/todos');
    const todoData = await readAdminJson(todoRes, 'To-dos');
    if (!todoRes.ok) throw new Error(todoData.error || `HTTP ${todoRes.status}`);
    todoState.todos = (todoData.todos || []).map(normalizeTodoItemDates);
    todoState.priorities = todoData.priorities || todoState.priorities;
    todoState.statuses = todoData.statuses || todoState.statuses;
    todoState.jobs = [];
    try {
      const workRes = await adminFetch('/api/work');
      const workData = await readAdminJson(workRes, 'Projects');
      if (workRes.ok) todoState.jobs = workData.jobs || [];
    } catch (workErr) {
      if (workErr.message === 'Session expired') throw workErr;
      console.warn('[todo] project list unavailable', workErr);
    }
  } catch (e) {
    if (e.message === 'Session expired') return;
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  const deepId = opts.todoId ?? pendingTodoDeepLinkId;
  pendingTodoDeepLinkId = null;

  if (preserveNew) {
    getTodoEditor()?.classList.add('de-pane-active');
    renderTodoEditor();
    return;
  }

  if (deepId === '__new__') {
    startNewTodo({ keepReturnSlug: true });
    return;
  }

  if (deepId) {
    await openTodo(Number(deepId), { keepReturnSlug: true });
    return;
  }

  if (
    todoState.activeId &&
    todoState.activeId !== '__new__' &&
    !todoState.todos.some((t) => t.id === todoState.activeId)
  ) {
    try {
      await openTodo(todoState.activeId, { keepReturnSlug: true });
      return;
    } catch {
      todoState.activeId = null;
      todoState.draft = null;
      todoState.linkedJob = null;
      getTodoEditor()?.classList.remove('de-pane-active');
    }
  }
  renderTodoEditor();
}

function startNewTodo(opts = {}) {
  if (!opts.keepReturnSlug) todoState.returnToWorkSlug = null;
  todoState.activeId = '__new__';
  todoState.dirty = false;
  todoState.linkedJob = null;
  if (!todoState.draft || !opts.keepReturnSlug) {
    todoState.draft = {
      title: '',
      priority: 'normal',
      status: 'open',
      due_date: '',
      job_slug: opts.jobSlug || '',
      assignee: '',
      section: '',
    };
  }
  if (todoState.draft.job_slug) {
    void refreshTodoLinkedJob(todoState.draft.job_slug);
  }
  getTodoEditor()?.classList.add('de-pane-active');
  renderTodoEditor();
  syncFooterNav();
}

function fillTodoSidebarList(list) {
  const visible = filterTodoItems(todoState.todos);
  list.innerHTML = '';
  for (const todo of visible) {
    list.appendChild(createTodoSwipeRow(todo));
  }
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = todoState.search.trim()
      ? 'No matches.'
      : todoState.filter === 'done'
        ? 'No completed to‑dos yet.'
        : 'No open to‑dos yet.';
    list.appendChild(empty);
  } else if (todoState.filter === 'open' && !todoState.search.trim()) {
    attachTodoListReorder(list, visible.map((t) => t.id));
  }
}

function refreshTodoSidebarList() {
  const root = getTodoEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderTodoEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    searchInput.placeholder = todoSearchPlaceholder();
  }
  fillTodoSidebarList(list);
}

function renderTodoEditor() {
  const root = getTodoEditor();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const { todos, activeId, search, filter } = todoState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const openCount = todos.filter((t) => t.status === 'open').length;
  const doneCount = todos.filter((t) => t.status === 'done').length;
  const subheader = listSearchAddNew({
    itemCount: openCount,
    search: {
      value: search,
      placeholder: todoSearchPlaceholder(),
      onInput: (value) => {
        todoState.search = value;
        refreshTodoSidebarList();
      },
    },
    addNew: false,
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const filterTabs = document.createElement('div');
  filterTabs.className = 'td-filter-tabs';
  for (const tab of [
    { key: 'open', label: `Open (${openCount})` },
    { key: 'done', label: `Done (${doneCount})` },
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-filter-tab' + (filter === tab.key ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      if (todoState.filter === tab.key) return;
      todoState.filter = tab.key;
      renderTodoEditor();
    });
    filterTabs.appendChild(btn);
  }
  sidebar.appendChild(filterTabs);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillTodoSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  if (activeId === '__new__') {
    renderTodoEditPane(pane, true);
  } else if (activeId) {
    renderTodoEditPane(pane, false);
  } else {
    appendEmptyDetailPane(pane, {
      mapKey: 'todo',
      iconName: 'check-square',
      bodyHtml: '<p>Select a to‑do, or create a new one.</p>',
      onCreate: () => startNewTodo(),
    });
  }
  root.appendChild(pane);
  finishSidebarListScroll(root, savedSidebarScroll);
}

function createTodoListItem(todo) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'ch-list-item' +
    (todo.id === todoState.activeId ? ' active' : '') +
    (todo.status === 'done' ? ' ch-list-item--done' : '');
  item.dataset.id = String(todo.id);
  const grip =
    todo.status === 'open'
      ? SIDEBAR_LIST_GRIP
      : '';
  item.innerHTML =
    `<span class="td-list-row">${grip}` +
    `<span class="${todoPriorityDotClass(todo.priority)}" aria-hidden="true"></span>` +
    `<span class="td-list-body">` +
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(todo.title)}</span></span>` +
    `<span class="de-item-slug">${escHtml(todoSubline(todo) || 'No project')}</span>` +
    `</span></span>`;
  item.addEventListener('click', () => openTodo(todo.id));
  return item;
}

function createTodoSwipeRow(todo) {
  const actions =
    todo.status === 'open'
      ? [
          swipeArchiveAction({
            label: 'Done',
            onClick: () => markTodoDone(todo.id),
          }),
          swipeDeleteAction({ onClick: () => deleteTodo(todo.id) }),
        ]
      : [
          swipeArchiveAction({
            label: 'Reopen',
            onClick: () => reopenTodo(todo.id),
          }),
          swipeDeleteAction({ onClick: () => deleteTodo(todo.id) }),
        ];
  return createSwipeRow(createTodoListItem(todo), actions);
}

async function openTodo(id, opts = {}) {
  await flushTodoAutosave();
  if (todoState.dirty && todoState.activeId && todoState.activeId !== id) {
    if (!(await confirmDiscardChanges())) return;
  }
  if (opts.fromWorkSlug) todoState.returnToWorkSlug = opts.fromWorkSlug;

  let todo = todoState.todos.find((t) => t.id === id);
  if (!todo) {
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      todo = normalizeTodoItemDates(data);
      const idx = todoState.todos.findIndex((t) => t.id === id);
      if (idx === -1) todoState.todos.unshift(todo);
      else todoState.todos[idx] = todo;
    } catch (e) {
      osAlert({ title: 'To‑do not found', bodyHtml: escHtml(e.message) });
      return;
    }
  }

  todoState.activeId = id;
  todoState.dirty = false;
  todoState.draft = {
    title: todo.title,
    priority: todo.priority,
    status: todo.status,
    due_date: normalizeTodoDueDateRaw(todo.due_date),
    job_slug: todo.job_slug || '',
    assignee: todo.assignee || '',
    section: todo.section || '',
  };
  todoState.linkedJob = null;
  if (todo.job_slug) {
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(todo.job_slug)}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) todoState.linkedJob = data;
    } catch {
      todoState.linkedJob = null;
    }
  }
  getTodoEditor()?.classList.add('de-pane-active');
  renderTodoEditor();
  syncFooterNav();
}

async function closeTodoEditor(checkDirty = true) {
  await flushTodoAutosave();
  if (checkDirty && todoState.dirty && !(await confirmDiscardChanges())) return;
  const returnSlug = todoState.returnToWorkSlug;
  todoState.activeId = null;
  todoState.draft = null;
  todoState.linkedJob = null;
  todoState.dirty = false;
  todoState.returnToWorkSlug = null;
  getTodoEditor()?.classList.remove('de-pane-active');
  if (returnSlug) {
    navigateToWork(returnSlug);
    return;
  }
  renderTodoEditor();
  syncFooterNav();
}

function scheduleTodoAutosave(saveFn) {
  if (todoSaveTimer) clearTimeout(todoSaveTimer);
  todoSaveTimer = setTimeout(() => {
    todoSaveTimer = null;
    void saveFn();
  }, 450);
}

async function flushTodoAutosave() {
  if (todoSaveTimer) {
    clearTimeout(todoSaveTimer);
    todoSaveTimer = null;
    await saveActiveTodoDraft(true);
  }
}

async function saveActiveTodoDraft(silent = false) {
  if (!todoState.draft) return true;
  const isNew = todoState.activeId === '__new__';
  const payload = {
    title: todoState.draft.title.trim(),
    priority: todoState.draft.priority || 'normal',
    status: todoState.draft.status || 'open',
    due_date: normalizeTodoDueDateRaw(todoState.draft.due_date),
    job_slug: todoState.draft.job_slug?.trim() || null,
    assignee: todoState.draft.assignee?.trim() || null,
    section: todoState.draft.section?.trim() || null,
  };
  if (!payload.title) return false;

  try {
    if (isNew) {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson(res);
      todoState.todos.unshift(normalizeTodoItemDates(data));
      todoState.activeId = data.id;
      todoState.dirty = false;
      todoState.draft = {
        title: data.title,
        priority: data.priority,
        status: data.status,
        due_date: normalizeTodoDueDateRaw(data.due_date),
        job_slug: data.job_slug || '',
        assignee: data.assignee || '',
        section: data.section || '',
      };
      if (data.job_slug) await refreshTodoLinkedJob(data.job_slug);
    } else {
      const res = await fetch(`/api/todos/${todoState.activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson(res);
      const idx = todoState.todos.findIndex((t) => t.id === data.id);
      if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
      todoState.dirty = false;
      if (payload.job_slug !== (todoState.linkedJob?.slug || null)) {
        await refreshTodoLinkedJob(payload.job_slug);
      }
    }
    refreshTodoSidebarList();
    return true;
  } catch (e) {
    if (!silent) osAlert({ title: 'Save failed', bodyHtml: escHtml(e.message) });
    return false;
  }
}

async function refreshTodoLinkedJob(slug) {
  if (!slug) {
    todoState.linkedJob = null;
    return;
  }
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    const data = await res.json();
    todoState.linkedJob = res.ok ? data : null;
  } catch {
    todoState.linkedJob = null;
  }
}

function renderTodoEditPane(pane, isNew) {
  const draft = todoState.draft;
  if (!draft) return;

  const linkTrackEl = document.createElement('div');
  linkTrackEl.className = 'wk-link-track';
  linkTrackEl.hidden = true;

  const linked = todoState.linkedJob;
  const icons = [];
  const shareBtn = linked?.contact_uid
    ? createPortalShareBtn(linked.contact_uid, {
        tab: 'work',
        jobSlug: linked.slug,
        trackEl: linkTrackEl,
        title: `${linked.contact_name || linked.client || 'Client'} — Work`,
        recipient: {
          contactUid: linked.contact_uid,
          name: linked.contact_name || linked.client || 'Client',
          email: linked.contact_email,
          phone: linked.contact_phone,
        },
      })
    : null;
  if (shareBtn) icons.push(shareBtn);
  if (!isNew) {
    icons.push(
      paneDeleteIcon({
        label: 'Delete to‑do',
        onClick: () => deleteTodo(todoState.activeId),
      }),
    );
  }

  const { header, titleInput } = createPaneSubheader({
    back: {
      label: todoState.returnToWorkSlug ? 'Back to project' : 'Back to to‑dos',
      onClick: () => closeTodoEditor(),
    },
    editableTitle: {
      value: draft.title,
      placeholder: 'To‑do title',
      ariaLabel: 'To‑do title',
    },
    icons,
  });
  pane.appendChild(header);

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll';
  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const markDirty = () => {
    todoState.dirty = true;
    scheduleTodoAutosave(() => saveActiveTodoDraft(true));
  };

  const priorityPill = createSlidingPillSelect({
    label: 'Priority',
    value: draft.priority || 'normal',
    options: todoState.priorities.map((p) => ({
      value: p,
      label: TODO_PRIORITY_LABELS[p] || p,
    })),
    ariaLabel: 'Priority',
    onChange: () => {
      draft.priority = priorityPill.getValue();
      markDirty();
    },
  });
  fields.appendChild(priorityPill.el);

  const statusPill = createSlidingPillSelect({
    label: 'Status',
    value: draft.status || 'open',
    options: todoState.statuses.map((s) => ({
      value: s,
      label: TODO_STATUS_LABELS[s] || s,
    })),
    ariaLabel: 'Status',
    onChange: () => {
      draft.status = statusPill.getValue();
      markDirty();
    },
  });
  fields.appendChild(statusPill.el);

  const dueWrap = document.createElement('div');
  dueWrap.className = 'de-label td-due-field';
  dueWrap.textContent = 'Due';
  const dueRow = document.createElement('div');
  dueRow.className = 'td-due-row';
  const dueDateInput = document.createElement('input');
  dueDateInput.className = 'de-input';
  dueDateInput.type = 'date';
  dueDateInput.value = todoDueDatePart(draft.due_date);
  const dueTimeInput = document.createElement('input');
  dueTimeInput.className = 'de-input';
  dueTimeInput.type = 'time';
  dueTimeInput.value = todoDueTimePart(draft.due_date);
  const syncDueDraft = () => {
    draft.due_date = combineTodoDueDateTime(dueDateInput.value, dueTimeInput.value);
    markDirty();
  };
  dueDateInput.addEventListener('change', syncDueDraft);
  dueTimeInput.addEventListener('change', syncDueDraft);
  dueRow.appendChild(dueDateInput);
  dueRow.appendChild(dueTimeInput);
  dueWrap.appendChild(dueRow);
  fields.appendChild(dueWrap);

  const assigneeLabel = document.createElement('label');
  assigneeLabel.className = 'de-label';
  assigneeLabel.textContent = 'Assigned to';
  const assigneeInput = document.createElement('input');
  assigneeInput.className = 'de-input';
  assigneeInput.placeholder = 'Name or team member';
  assigneeInput.value = draft.assignee || '';
  assigneeInput.addEventListener('input', () => {
    draft.assignee = assigneeInput.value;
    markDirty();
  });
  assigneeLabel.appendChild(assigneeInput);
  fields.appendChild(assigneeLabel);

  const sectionLabel = document.createElement('label');
  sectionLabel.className = 'de-label';
  sectionLabel.textContent = 'Section';
  const sectionInput = document.createElement('input');
  sectionInput.className = 'de-input';
  sectionInput.placeholder = 'Product Backlog, Voice Agent…';
  sectionInput.value = draft.section || '';
  sectionInput.addEventListener('input', () => {
    draft.section = sectionInput.value;
    markDirty();
  });
  sectionLabel.appendChild(sectionInput);
  fields.appendChild(sectionLabel);

  mountTodoProjectPicker(fields, draft, markDirty);

  scroll.appendChild(fields);
  pane.appendChild(scroll);

  titleInput.addEventListener('input', () => {
    draft.title = titleInput.value;
    markDirty();
  });
  titleInput.addEventListener('blur', () => {
    void saveActiveTodoDraft(true);
  });
}

async function ensureTodoJobsLoaded() {
  if (todoState.jobs.length) return;
  try {
    const res = await fetch('/api/work', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) todoState.jobs = data.jobs || [];
  } catch {
    /* non-fatal */
  }
}

function mountTodoProjectPicker(parent, draft, markDirty) {
  let changing = !draft.job_slug?.trim();

  const wrap = document.createElement('div');
  wrap.className = 'wk-client-picker td-project-picker';

  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'de-label';
  fieldLabel.textContent = 'Project';
  wrap.appendChild(fieldLabel);

  const selectedEl = document.createElement('div');
  selectedEl.className = 'wk-client-selected';
  const profileLink = document.createElement('button');
  profileLink.type = 'button';
  profileLink.className = 'wk-client-profile-link';
  const selectedName = document.createElement('span');
  selectedName.className = 'wk-client-name';
  profileLink.appendChild(selectedName);
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';
  selectedEl.appendChild(profileLink);
  selectedEl.appendChild(changeBtn);
  wrap.appendChild(selectedEl);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search projects…';
  searchInput.autocomplete = 'off';
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);
  wrap.appendChild(searchWrap);

  function syncView() {
    const slug = draft.job_slug?.trim();
    const has = !!slug;
    selectedEl.style.display = has && !changing ? 'flex' : 'none';
    searchWrap.style.display = changing || !has ? 'block' : 'none';
    if (has) {
      selectedName.textContent = todoJobTitle(slug);
      profileLink.title = `Open ${selectedName.textContent}`;
    }
  }

  profileLink.addEventListener('click', async () => {
    const slug = draft.job_slug?.trim();
    if (!slug) return;
    await flushTodoAutosave();
    const todoId = typeof todoState.activeId === 'number' ? todoState.activeId : null;
    navigateToWork(slug, todoId ? { fromTodoId: todoId } : {});
  });

  function renderDropdown(matches, query) {
    dropdown.innerHTML = '';
    for (const job of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      btn.innerHTML =
        `${escHtml(job.title || job.slug)}` +
        `<span class="sub">${escHtml(job.contact_name || job.client || '—')}</span>`;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => pickJob(job));
      dropdown.appendChild(btn);
    }
    const q = query.trim();
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'wk-client-option wk-client-add';
    createBtn.textContent = q ? `+ Create "${q}" as new project` : '+ Create new project…';
    createBtn.addEventListener('mousedown', (e) => e.preventDefault());
    createBtn.addEventListener('click', () => beginCreateProject(q));
    dropdown.appendChild(createBtn);
    if (q.length >= 1 && draft.job_slug?.trim()) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'wk-client-option wk-client-add';
      clearBtn.textContent = 'Remove project link';
      clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
      clearBtn.addEventListener('click', () => pickJob(null));
      dropdown.appendChild(clearBtn);
    }
    dropdown.style.display = 'block';
  }

  async function beginCreateProject(suggestedTitle) {
    dropdown.style.display = 'none';
    searchInput.value = '';
    changing = false;
    syncView();
    await navigateToNewWorkFromTodo({ suggestedTitle });
  }

  function filterJobs(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return null;
    return todoState.jobs
      .filter((job) =>
        matchesListSearch(q, job.title, job.slug, job.contact_name, job.client, job.status),
      )
      .slice(0, 8);
  }

  async function scheduleSearch() {
    const q = searchInput.value.trim();
    await ensureTodoJobsLoaded();
    const matches = q.length >= 1 ? filterJobs(q) || [] : [];
    renderDropdown(matches, q);
  }

  function pickJob(job) {
    draft.job_slug = job?.slug || '';
    changing = !draft.job_slug;
    searchInput.value = '';
    dropdown.style.display = 'none';
    syncView();
    markDirty();
    void refreshTodoLinkedJob(draft.job_slug).then(() => renderTodoEditor());
  }

  changeBtn.addEventListener('click', () => {
    changing = true;
    syncView();
    searchInput.focus();
    void scheduleSearch();
  });

  searchInput.addEventListener('input', () => {
    void scheduleSearch();
  });
  searchInput.addEventListener('focus', () => {
    void scheduleSearch();
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!wrap.contains(document.activeElement) && draft.job_slug?.trim()) {
        changing = false;
        searchInput.value = '';
        dropdown.style.display = 'none';
        syncView();
      }
    }, 150);
  });
  attachAutosuggestKeyboardNav(searchInput, dropdown, {
    optionSelector: '.wk-client-option',
    onClose: () => {
      dropdown.style.display = 'none';
    },
  });

  syncView();
  parent.appendChild(wrap);
}

function sidebarListRowHost(list) {
  return pullRefreshContentRoot(list) || list;
}

function sidebarRowKey(row) {
  return (
    row.dataset.id ||
    row.dataset.slug ||
    row.querySelector('.ch-list-item')?.dataset.id ||
    row.querySelector('.ch-list-item')?.dataset.slug ||
    ''
  );
}

function sidebarListRowKeys(list) {
  return [...sidebarListRowHost(list).querySelectorAll(':scope > .swipe-row')]
    .map(sidebarRowKey)
    .filter(Boolean);
}

function clearSidebarDropTargets(list) {
  sidebarListRowHost(list).querySelectorAll('.swipe-row').forEach((el) => {
    el.classList.remove('td-drop-target');
  });
}

function repositionSidebarRowByPointer(list, dragEl, pointerY) {
  const host = sidebarListRowHost(list);
  clearSidebarDropTargets(list);
  const siblings = [...host.querySelectorAll(':scope > .swipe-row')].filter((node) => node !== dragEl);
  if (!siblings.length) return;

  for (const sib of siblings) {
    const rect = sib.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (pointerY < mid) {
      host.insertBefore(dragEl, sib);
      sib.classList.add('td-drop-target');
      return;
    }
  }

  host.appendChild(dragEl);
  siblings[siblings.length - 1]?.classList.add('td-drop-target');
}

function attachSidebarListReorder(list, orderedKeys, persistFn) {
  let dragEl = null;
  let dragStartKeys = null;
  let moved = false;

  list.querySelectorAll('.td-list-grip').forEach((grip) => {
    grip.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = grip.closest('.ch-list-item');
      const row = grip.closest('.swipe-row');
      if (!item || !row) return;
      dragEl = row;
      dragStartKeys = sidebarListRowKeys(list);
      moved = false;
      row.classList.add('td-dragging');
      grip.setPointerCapture(ev.pointerId);

      function onMove(moveEv) {
        if (!dragEl) return;
        moved = true;
        repositionSidebarRowByPointer(list, dragEl, moveEv.clientY);
      }

      function onUp(upEv) {
        grip.releasePointerCapture(upEv.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        dragEl?.classList.remove('td-dragging');
        clearSidebarDropTargets(list);
        if (dragEl && moved) {
          const keys = sidebarListRowKeys(list);
          const changed =
            keys.length !== dragStartKeys.length ||
            keys.some((key, idx) => key !== dragStartKeys[idx]);
          if (changed) void persistFn(keys);
        }
        dragEl = null;
        dragStartKeys = null;
        moved = false;
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

function attachTodoListReorder(list, orderedIds) {
  attachSidebarListReorder(list, orderedIds.map(String), persistTodoOrder);
}

async function persistTodoOrder(ids) {
  try {
    const numericIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    const res = await fetch('/api/todos/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: numericIds }),
    });
    const data = await readApiJson(res);
    todoState.todos = data.todos || todoState.todos;
    refreshTodoSidebarList();
  } catch (e) {
    osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    renderTodoEditor();
  }
}

async function persistChatOrder(ids) {
  try {
    const res = await fetch('/api/chats/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await readApiJson(res);
    chatState.threads = data.threads || chatState.threads;
    refreshChatSidebarList();
  } catch (e) {
    osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    refreshChatSidebarList();
  }
}

async function persistWorkOrder(slugs) {
  try {
    const res = await fetch('/api/work/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs }),
    });
    const data = await readApiJson(res);
    workState.jobs = data.jobs || workState.jobs;
    refreshWorkSidebarList();
  } catch (e) {
    osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    refreshWorkSidebarList();
  }
}

async function persistKnowledgeOrder(slugs) {
  try {
    const res = await adminFetch(`${KNOWLEDGE_API}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs }),
    });
    const data = await readApiJson(res);
    knowledgeState.entries = data.entries || knowledgeState.entries;
    refreshKnowledgeSidebarList();
  } catch (e) {
    if (e.message === 'Session expired') return;
    osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    refreshKnowledgeSidebarList();
  }
}

async function persistClientOrder(uids) {
  try {
    const res = await fetch('/api/clients/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uids }),
    });
    const data = await readApiJson(res);
    clientState.clients = data.clients || clientState.clients;
    clientState.total = data.total ?? clientState.clients.length;
    refreshClientsSidebarList();
  } catch (e) {
    osAlert({ title: 'Reorder failed', bodyHtml: escHtml(e.message) });
    refreshClientsSidebarList();
  }
}

async function markTodoDone(id) {
  try {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    const data = await readApiJson(res);
    const idx = todoState.todos.findIndex((t) => t.id === id);
    if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
    if (todoState.activeId === id) {
      todoState.draft = { ...todoState.draft, status: 'done' };
    }
    refreshTodoSidebarList();
  } catch (e) {
    osAlert({ title: 'Could not complete', bodyHtml: escHtml(e.message) });
  }
}

async function reopenTodo(id) {
  try {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    const data = await readApiJson(res);
    const idx = todoState.todos.findIndex((t) => t.id === id);
    if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
    todoState.filter = 'open';
    refreshTodoSidebarList();
  } catch (e) {
    osAlert({ title: 'Could not reopen', bodyHtml: escHtml(e.message) });
  }
}

async function deleteTodo(id) {
  try {
    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    await readApiJson(res);
    todoState.todos = todoState.todos.filter((t) => t.id !== id);
    if (todoState.activeId === id) {
      todoState.activeId = null;
      todoState.draft = null;
      todoState.linkedJob = null;
      getTodoEditor()?.classList.remove('de-pane-active');
    }
    renderTodoEditor();
    syncFooterNav();
  } catch (e) {
    osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

// ---- documents tab ----

let docState = {
  templates: [],    // [{ slug, title }]
  shortcodes: [],   // [{ code, token, label, description, category }]
  search: '',
  activeSlug: null,
  dirty: false,
  savedHtml: '',
  autosaveGetHtml: null,
  paneMode: 'edit', // 'edit' | 'view'
};
let docAutosaveTimer = null;

function getDocEditor() { return document.getElementById('doc-editor'); }

async function loadDocumentsTab() {
  const root = getDocEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading templates…</div>';
  try {
    const [templatesRes, shortcodesRes] = await Promise.all([
      fetch('/api/documents', { cache: 'no-store' }),
      fetch('/api/documents/shortcodes', { cache: 'no-store' }),
    ]);
    if (!templatesRes.ok) throw new Error(`HTTP ${templatesRes.status}`);
    docState.templates = await templatesRes.json();
    docState.shortcodes = shortcodesRes.ok ? await shortcodesRes.json() : [];
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load templates: ${e.message}</div>`;
    return;
  }
  docState.activeSlug = null;
  docState.dirty = false;
  clearEditorFooterSave();
  getDocEditor()?.classList.remove('de-pane-active');
  renderDocEditor();
}

function renderDocEditor() {
  const root = getDocEditor();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const { templates, activeSlug, dirty, search } = docState;
  const visibleTemplates = templates.filter((tpl) =>
    matchesListSearch(search, tpl.title, tpl.slug),
  );

  root.innerHTML = '';

  // ── Sidebar ──
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const subheader = listSearchSubheader({
    itemCount: templates.length,
    search: {
      value: search,
      placeholder: `Search ${templates.length} ${templates.length === 1 ? 'document' : 'documents'}`,
      onInput: (value) => {
        docState.search = value;
        renderDocEditor();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const tpl of visibleTemplates) {
    list.appendChild(createDocumentSwipeRow(tpl));
  }
  if (visibleTemplates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = search.trim() ? 'No matches.' : 'No templates yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);

  // ── Shortcodes directory ──
  const shortcodes = docState.shortcodes || [];
  if (shortcodes.length > 0) {
    const scDir = document.createElement('div');
    scDir.className = 'de-sc-dir';

    const scHdr = document.createElement('div');
    scHdr.className = 'de-sc-dir-hdr';
    scHdr.innerHTML = '<span>Shortcodes</span><span class="de-sc-dir-hint">type { to insert</span>';
    scDir.appendChild(scHdr);

    const scBody = document.createElement('div');
    scBody.className = 'de-sc-dir-body';

    const categories = [...new Set(shortcodes.map((s) => s.category))];
    for (const cat of categories) {
      const catLabel = document.createElement('div');
      catLabel.className = 'de-sc-dir-cat';
      catLabel.textContent = cat;
      scBody.appendChild(catLabel);

      for (const sc of shortcodes.filter((s) => s.category === cat)) {
        const item = document.createElement('div');
        item.className = 'de-sc-dir-item';
        item.title = sc.description;
        item.innerHTML = `<code class="de-sc-token">${escHtml(sc.token)}</code><span class="de-sc-lbl">${escHtml(sc.label)}</span>`;
        // Click-to-copy
        item.addEventListener('click', () => {
          navigator.clipboard?.writeText(sc.token).catch(() => {});
          item.classList.add('de-sc-copied');
          setTimeout(() => item.classList.remove('de-sc-copied'), 1200);
        });
        scBody.appendChild(item);
      }
    }

    scDir.appendChild(scBody);
    sidebar.appendChild(scDir);
  }

  root.appendChild(sidebar);

  // ── Editor pane ──
  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeSlug === '__new__') {
    renderNewForm(pane);
  } else if (activeSlug) {
    renderEditForm(pane);
  } else {
    clearEditorFooterSave();
    appendEmptyDetailPane(pane, {
      mapKey: 'documents',
      iconName: 'file-text',
      bodyHtml: '<p>Select a template to edit, or create a new one.</p>',
      onCreate: () => void startNewDocument(),
    });
  }

  root.appendChild(pane);
  finishSidebarListScroll(root, savedSidebarScroll);
}

function renderNewForm(pane) {
  pane.innerHTML = '';
  pane.appendChild(
    createPaneSubheader({
      back: { label: 'Back to documents', onClick: () => backToList() },
      title: 'New Document',
    }).header,
  );

  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const slugLabel = document.createElement('label');
  slugLabel.className = 'de-label';
  slugLabel.textContent = 'Filename (slug)';
  const slugInput = document.createElement('input');
  slugInput.className = 'de-input';
  slugInput.type = 'text';
  slugInput.placeholder = 'e.g. service-agreement';
  slugInput.pattern = '[a-zA-Z0-9_-]+';
  slugInput.id = 'de-new-slug';
  slugLabel.appendChild(slugInput);
  fields.appendChild(slugLabel);
  pane.appendChild(fields);

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.id = 'de-new-html';
  ta.spellcheck = false;
  ta.placeholder = '<!-- title: My Document -->\n<h1>Title</h1>\n<p>Content…</p>';
  attachShortcodePopover(ta);
  pane.appendChild(ta);

  setEditorFooterSave(() => createDocument(slugInput.value.trim(), ta.value));
}

function renderEditForm(pane) {
  const slug = docState.activeSlug;
  const tpl = docState.templates.find((t) => t.slug === slug);
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/documents/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ html }) => {
      pane.innerHTML = '';

      const modeTabs = document.createElement('div');
      modeTabs.className = 'de-mode-tabs';

      const editTab = document.createElement('button');
      editTab.className = 'de-mode-tab' + (docState.paneMode !== 'view' ? ' active' : '');
      editTab.textContent = 'Edit';

      const viewTab = document.createElement('button');
      viewTab.className = 'de-mode-tab' + (docState.paneMode === 'view' ? ' active' : '');
      viewTab.textContent = 'View';

      modeTabs.appendChild(editTab);
      modeTabs.appendChild(viewTab);

      const { header } = createPaneSubheader({
        back: { label: 'Back to documents', onClick: () => backToList() },
        title: tpl?.title ?? slug,
        afterTitle: modeTabs,
        icons: [
          paneShareIcon({
            label: 'Send to a client',
            onClick: () => openDocumentShareSheet({ slug, title: tpl?.title ?? slug }),
          }),
          paneDeleteIcon({
            label: 'Delete document',
            onClick: () => deleteDocument(slug),
          }),
        ],
      });
      pane.appendChild(header);

      docState.savedHtml = html;
      docState.dirty = false;

      // ── Textarea (edit mode) ──
      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.id = `de-edit-${slug}`;
      ta.spellcheck = false;
      ta.value = html;
      docState.autosaveGetHtml = () => ta.value;
      ta.addEventListener('input', () => {
        docState.dirty = ta.value !== docState.savedHtml;
        scheduleDocAutosave(slug);
      });
      attachShortcodePopover(ta);

      // ── Preview iframe (view mode, sandboxed — no scripts) ──
      const preview = document.createElement('iframe');
      preview.className = 'de-preview';
      preview.setAttribute('sandbox', 'allow-same-origin');
      preview.srcdoc = html;
      preview.title = 'Document preview';

      if (docState.paneMode === 'view') {
        ta.style.display = 'none';
      } else {
        preview.style.display = 'none';
      }

      pane.appendChild(ta);
      pane.appendChild(preview);

      // ── Tab switching ──
      editTab.addEventListener('click', () => {
        docState.paneMode = 'edit';
        editTab.classList.add('active');
        viewTab.classList.remove('active');
        ta.style.display = '';
        preview.style.display = 'none';
      });

      viewTab.addEventListener('click', async () => {
        await flushDocAutosave();
        docState.paneMode = 'view';
        viewTab.classList.add('active');
        editTab.classList.remove('active');
        preview.srcdoc = ta.value;
        ta.style.display = 'none';
        preview.style.display = '';
      });
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">Failed to load: ${e.message}</div>`;
    });
}

function syncDocSidebarTitle(slug, html) {
  const newTitle = html.match(/<!--\s*title:\s*(.+?)\s*-->/i)?.[1]?.trim()
    ?? slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const tpl = docState.templates.find((t) => t.slug === slug);
  if (tpl) tpl.title = newTitle;
  const titleEl = document.querySelector(
    `.ch-list-item[data-slug="${CSS.escape(slug)}"] .ch-item-title`,
  );
  if (titleEl) titleEl.textContent = newTitle;
  if (docState.activeSlug === slug) {
    const nameEl = getDocEditor()?.querySelector('.de-doc-name');
    if (nameEl) nameEl.textContent = newTitle;
  }
}

function scheduleDocAutosave(slug) {
  clearTimeout(docAutosaveTimer);
  docAutosaveTimer = setTimeout(() => {
    docAutosaveTimer = null;
    if (docState.autosaveGetHtml) autosaveDocument(slug, docState.autosaveGetHtml());
  }, 650);
}

async function flushDocAutosave() {
  if (docAutosaveTimer) {
    clearTimeout(docAutosaveTimer);
    docAutosaveTimer = null;
  }
  const slug = docState.activeSlug;
  if (!slug || slug === '__new__' || !docState.autosaveGetHtml) return;
  await autosaveDocument(slug, docState.autosaveGetHtml());
}

async function autosaveDocument(slug, html) {
  if (html === docState.savedHtml) {
    docState.dirty = false;
    return;
  }
  if (!html.trim()) return;
  const ta = document.getElementById(`de-edit-${slug}`);
  if (ta) setFormFieldState(ta, 'saving');
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.savedHtml = html;
    docState.dirty = false;
    syncDocSidebarTitle(slug, html);
    if (ta) flashFormFieldSaved(ta);
  } catch (e) {
    console.warn('[documents] autosave failed', e);
    if (ta) setFormFieldState(ta, 'invalid');
  }
}

async function openDocument(slug) {
  await flushDocAutosave();
  if (docState.dirty && !(await confirmDiscardChanges())) return;
  docState.activeSlug = slug;
  docState.dirty = false;
  docState.savedHtml = '';
  docState.autosaveGetHtml = null;
  docState.paneMode = 'edit';
  renderDocEditor();
  getDocEditor()?.classList.add('de-pane-active');
}

async function startNewDocument() {
  await flushDocAutosave();
  if (docState.dirty && !(await confirmDiscardChanges())) return;
  docState.activeSlug = '__new__';
  docState.dirty = false;
  docState.savedHtml = '';
  docState.autosaveGetHtml = null;
  renderDocEditor();
  getDocEditor()?.classList.add('de-pane-active');
}

async function backToList() {
  await flushDocAutosave();
  if (docState.dirty && !(await confirmDiscardChanges())) return;
  docState.activeSlug = null;
  docState.dirty = false;
  docState.savedHtml = '';
  docState.autosaveGetHtml = null;
  clearEditorFooterSave();
  getDocEditor()?.classList.remove('de-pane-active');
  renderDocEditor();
}

async function createDocument(slug, html) {
  if (!slug) { alert('Please enter a filename (slug).'); return; }
  if (!/^[a-z0-9_-]+$/i.test(slug)) { alert('Slug may only contain letters, numbers, hyphens, and underscores.'); return; }
  if (!html.trim()) { alert('HTML content cannot be empty.'); return; }
  try {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, html }),
    });
    if (res.status === 409) { alert('A template with that slug already exists.'); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.dirty = false;
    await loadDocumentsTab();
    docState.activeSlug = slug;
    renderDocEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function deleteDocument(slug) {
  closeOpenSwipeRow();
  if (docAutosaveTimer) {
    clearTimeout(docAutosaveTimer);
    docAutosaveTimer = null;
  }
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.activeSlug = null;
    docState.dirty = false;
    docState.savedHtml = '';
    docState.autosaveGetHtml = null;
    getDocEditor()?.classList.remove('de-pane-active');
    await loadDocumentsTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- shortcode popover ----

let _scPop = null;          // singleton popover element
let _scTriggerIdx = -1;     // textarea index where { or [ was typed
let _scTa = null;           // active textarea
let _scItems = [];          // currently shown shortcodes
let _scSel = 0;             // selected row index

function _getScPop() {
  if (!_scPop) {
    _scPop = document.createElement('div');
    _scPop.className = 'de-sc-pop';
    _scPop.setAttribute('role', 'listbox');
    document.body.appendChild(_scPop);
  }
  return _scPop;
}

// Canvas-based monospace cursor X measurement.
let _scCanvas = null;
function _caretPixelPos(ta) {
  const computed = window.getComputedStyle(ta);
  const rect = ta.getBoundingClientRect();
  const lh = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.5;
  const pt = parseFloat(computed.paddingTop) || 0;
  const pl = parseFloat(computed.paddingLeft) || 0;

  const textBefore = ta.value.slice(0, ta.selectionStart);
  const lines = textBefore.split('\n');
  const lineIdx = lines.length - 1;
  const col = lines[lineIdx];

  if (!_scCanvas) _scCanvas = document.createElement('canvas');
  const ctx = _scCanvas.getContext('2d');
  ctx.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  const colW = ctx.measureText(col).width;

  const rawX = rect.left + pl + colW - ta.scrollLeft;
  const rawY = rect.top + pt + lineIdx * lh - ta.scrollTop + lh + 4;

  // Clamp so popover stays in viewport
  const popW = 280;
  const popMaxH = 260;
  const x = Math.min(Math.max(rawX, 8), window.innerWidth - popW - 8);
  const y = rawY + popMaxH > window.innerHeight
    ? rawY - popMaxH - lh - 8
    : rawY;

  return { x, y };
}

function _renderScPop(ta, query) {
  const all = docState.shortcodes || [];
  const q = (query || '').toLowerCase();
  _scItems = q
    ? all.filter((sc) => sc.code.toLowerCase().includes(q) || sc.label.toLowerCase().includes(q))
    : all;
  _scSel = 0;

  const pop = _getScPop();

  if (_scItems.length === 0) { pop.style.display = 'none'; return; }

  pop.innerHTML = '';
  for (let i = 0; i < _scItems.length; i++) {
    const sc = _scItems[i];
    const row = document.createElement('div');
    row.className = 'de-sc-pop-row' + (i === 0 ? ' active' : '');
    row.setAttribute('role', 'option');
    row.innerHTML = `<code class="de-sc-pop-token">${escHtml(sc.token)}</code><span class="de-sc-pop-lbl">${escHtml(sc.label)}</span>`;
    row.addEventListener('mousedown', (e) => { e.preventDefault(); _insertSc(ta, sc.token); });
    pop.appendChild(row);
  }

  const { x, y } = _caretPixelPos(ta);
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.style.display = 'block';
}

function _hideScPop() {
  if (_scPop) _scPop.style.display = 'none';
  _scTriggerIdx = -1;
  _scTa = null;
}

function _moveSc(delta) {
  if (!_scItems.length) return;
  _scSel = (_scSel + delta + _scItems.length) % _scItems.length;
  const rows = _scPop?.querySelectorAll('.de-sc-pop-row') || [];
  rows.forEach((r, i) => r.classList.toggle('active', i === _scSel));
  rows[_scSel]?.scrollIntoView({ block: 'nearest' });
}

function _insertSc(ta, token) {
  const start = _scTriggerIdx;
  const end = ta.selectionStart;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  ta.value = before + token + after;
  ta.selectionStart = ta.selectionEnd = start + token.length;
  ta.dispatchEvent(new Event('input'));
  _hideScPop();
  ta.focus();
}

function attachShortcodePopover(ta) {
  ta.addEventListener('keydown', (e) => {
    if (_scTriggerIdx < 0 || _scPop?.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _moveSc(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _moveSc(-1); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      const sc = _scItems[_scSel];
      if (sc) { e.preventDefault(); _insertSc(ta, sc.token); }
    } else if (e.key === 'Escape') { _hideScPop(); }
  });

  ta.addEventListener('input', () => {
    const pos = ta.selectionStart;
    const text = ta.value;

    // Walk backwards from cursor to find an open { or [ with no closing bracket/newline between
    let trigIdx = -1;
    for (let i = pos - 1; i >= Math.max(0, pos - 80); i--) {
      const ch = text[i];
      if (ch === '{' || ch === '[') { trigIdx = i; break; }
      if (ch === '}' || ch === ']' || ch === '\n') break;
    }

    if (trigIdx >= 0) {
      _scTriggerIdx = trigIdx;
      _scTa = ta;
      _renderScPop(ta, text.slice(trigIdx + 1, pos));
    } else {
      _hideScPop();
    }
  });

  ta.addEventListener('blur', () => setTimeout(_hideScPop, 160));
  ta.addEventListener('scroll', () => {
    if (_scTriggerIdx >= 0 && _scPop?.style.display !== 'none') {
      const { x, y } = _caretPixelPos(ta);
      if (_scPop) { _scPop.style.left = `${x}px`; _scPop.style.top = `${y}px`; }
    }
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LINKIFY_TRAILING_PUNCT = /[.,;:!?)]+$/;

function linkifyPlainText(str) {
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

// ---- knowledge tab ----

let knowledgeState = {
  entries: [],
  search: '',
  activeSlug: null,
  dirty: false,
  content: '',
};

let knowledgeAutosaveTimer = null;
let knowledgeAutosaveFlush = null;

function syncKnowledgeSidebarTitle(slug, content) {
  const newTitle = titleFromKnowledgeMarkdown(content, slug);
  const entry = knowledgeState.entries.find((e) => e.slug === slug);
  if (entry) entry.title = newTitle;
  const titleEl = document.querySelector(
    `.ch-list-item[data-slug="${CSS.escape(slug)}"] .ch-item-title`,
  );
  if (titleEl) titleEl.textContent = newTitle;
  if (knowledgeState.activeSlug === slug) {
    const nameEl = getKnowledgeEditor()?.querySelector('.de-doc-name');
    if (nameEl) nameEl.textContent = newTitle;
  }
}

function scheduleKnowledgeAutosave(slug, ta) {
  clearTimeout(knowledgeAutosaveTimer);
  knowledgeAutosaveTimer = setTimeout(() => {
    knowledgeAutosaveTimer = null;
    void autosaveKnowledgeQuiet(slug, ta.value, ta);
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function flushKnowledgeAutosave() {
  if (knowledgeAutosaveTimer) {
    clearTimeout(knowledgeAutosaveTimer);
    knowledgeAutosaveTimer = null;
  }
  if (typeof knowledgeAutosaveFlush === 'function') {
    await knowledgeAutosaveFlush();
    knowledgeAutosaveFlush = null;
  }
}

async function autosaveKnowledgeQuiet(slug, content, ta) {
  if (!content.trim()) {
    if (ta) setFormFieldState(ta, 'invalid');
    return false;
  }
  if (content === knowledgeState.content) {
    knowledgeState.dirty = false;
    return true;
  }
  if (ta) setFormFieldState(ta, 'saving');
  try {
    const res = await adminFetch(`${KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleFromKnowledgeMarkdown(content, slug),
        content,
        source: 'manual',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.content = content;
    knowledgeState.dirty = false;
    syncKnowledgeSidebarTitle(slug, content);
    if (ta) flashFormFieldSaved(ta);
    return true;
  } catch (e) {
    console.warn('[knowledge] autosave failed', e);
    if (ta) setFormFieldState(ta, 'invalid');
    return false;
  }
}

function getKnowledgeEditor() { return document.getElementById('knowledge-editor'); }

async function loadKnowledgeTab() {
  const root = getKnowledgeEditor();
  if (!root) return;
  if (!userId) {
    root.innerHTML = '<div class="de-loading de-error">Sign in required to view knowledge.</div>';
    return;
  }
  root.innerHTML = '<div class="de-loading">Loading knowledge…</div>';
  try {
    const res = await adminFetch(KNOWLEDGE_API);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.entries = data.entries || [];
  } catch (e) {
    if (e.message === 'Session expired') return;
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }
  knowledgeState.activeSlug = null;
  knowledgeState.dirty = false;
  knowledgeState.content = '';
  clearEditorFooterSave();
  getKnowledgeEditor()?.classList.remove('de-pane-active');
  renderKnowledgeEditor();
}

function visibleKnowledgeEntries() {
  const { entries, search } = knowledgeState;
  return entries.filter((entry) =>
    matchesListSearch(search, entry.title, entry.slug, entry.source, entry.isDefault ? 'default' : 'custom'),
  );
}

function fillKnowledgeSidebarList(list) {
  const visibleEntries = visibleKnowledgeEntries();
  list.innerHTML = '';
  for (const entry of visibleEntries) {
    list.appendChild(createKnowledgeSwipeRow(entry));
  }
  if (visibleEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = knowledgeState.search.trim() ? 'No matches.' : 'No knowledge files yet.';
    list.appendChild(empty);
  } else if (!knowledgeState.search.trim()) {
    attachSidebarListReorder(list, visibleEntries.map((e) => e.slug), persistKnowledgeOrder);
  }
}

function refreshKnowledgeSidebarList() {
  const root = getKnowledgeEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderKnowledgeEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    const count = knowledgeState.entries.length;
    searchInput.placeholder = `Search ${count} ${count === 1 ? 'doc' : 'docs'}`;
  }
  fillKnowledgeSidebarList(list);
  syncKnowledgeSidebarActiveState();
}

function scrollSidebarListItemIntoView(list, itemEl) {
  const row = itemEl.closest('.swipe-row') || itemEl;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const padding = 8;
  if (rowRect.top >= listRect.top + padding && rowRect.bottom <= listRect.bottom - padding) return;
  if (rowRect.top < listRect.top) {
    list.scrollTop += rowRect.top - listRect.top - padding;
  } else if (rowRect.bottom > listRect.bottom) {
    list.scrollTop += rowRect.bottom - listRect.bottom + padding;
  }
}

function captureSidebarListScroll(root) {
  return root?.querySelector('.ch-sidebar .ch-list')?.scrollTop ?? 0;
}

function finishSidebarListScroll(root, savedScrollTop = 0) {
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) return;
  if (savedScrollTop > 0) list.scrollTop = savedScrollTop;
  requestAnimationFrame(() => {
    const activeEl = list.querySelector('.ch-list-item.active');
    if (activeEl) scrollSidebarListItemIntoView(list, activeEl);
  });
}

function syncKnowledgeSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getKnowledgeEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.slug === knowledgeState.activeSlug;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
      activeEl = el;
    } else {
      el.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function renderKnowledgePane() {
  const root = getKnowledgeEditor();
  if (!root) return;
  let pane = root.querySelector('.de-pane');
  if (!pane) {
    renderKnowledgeEditor();
    return;
  }
  const { activeSlug } = knowledgeState;

  if (activeSlug === '__new__') {
    renderNewKnowledgeForm(pane);
  } else if (activeSlug) {
    renderEditKnowledgeForm(pane);
  } else {
    clearEditorFooterSave();
    pane.innerHTML = '';
    appendEmptyDetailPane(pane, {
      mapKey: 'knowledge',
      iconName: 'book-open',
      bodyHtml: '<p>Select a doc to edit, or create a new one.</p>',
      onCreate: () => startNewKnowledge(),
    });
    root.classList.remove('de-pane-active');
  }
}

function renderKnowledgeEditor() {
  const root = getKnowledgeEditor();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const { entries, search } = knowledgeState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const subheader = listSearchSubheader({
    itemCount: entries.length,
    search: {
      value: search,
      placeholder: `Search ${entries.length} ${entries.length === 1 ? 'doc' : 'docs'}`,
      onInput: (value) => {
        knowledgeState.search = value;
        refreshKnowledgeSidebarList();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.65rem 0.5rem';
  hint.textContent = 'Live DB + bundled docs · bot reads DB first';
  sidebar.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillKnowledgeSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderKnowledgePane();
  finishSidebarListScroll(root, savedSidebarScroll);
}

function startNewKnowledge() {
  knowledgeState.activeSlug = '__new__';
  knowledgeState.dirty = false;
  syncKnowledgeSidebarActiveState();
  renderKnowledgePane();
}

function renderNewKnowledgeForm(pane) {
  pane.innerHTML = '';
  pane.appendChild(
    createPaneSubheader({
      back: {
        label: 'Back to knowledge',
        onClick: () => {
          knowledgeState.activeSlug = null;
          getKnowledgeEditor()?.classList.remove('de-pane-active');
          syncKnowledgeSidebarActiveState();
          renderKnowledgePane();
        },
      },
      title: 'New knowledge doc',
    }).header,
  );

  const fields = document.createElement('div');
  fields.className = 'de-fields';
  const slugLabel = document.createElement('label');
  slugLabel.className = 'de-label';
  slugLabel.textContent = 'Slug (filename)';
  const slugInput = document.createElement('input');
  slugInput.className = 'de-input';
  slugInput.placeholder = 'e.g. billing-notes';
  slugLabel.appendChild(slugInput);
  fields.appendChild(slugLabel);
  pane.appendChild(fields);

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.spellcheck = false;
  ta.placeholder = '# Title\n\nMarkdown content for the admin agent…';
  pane.appendChild(ta);

  setEditorFooterSave(() => createKnowledge(slugInput.value.trim(), ta.value));
  getKnowledgeEditor()?.classList.add('de-pane-active');
}

function renderEditKnowledgeForm(pane) {
  const slug = knowledgeState.activeSlug;
  const entry = knowledgeState.entries.find((e) => e.slug === slug);
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  adminFetch(`${KNOWLEDGE_API}/${encodeURIComponent(slug)}`)
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      knowledgeState.content = data.content;
      knowledgeState.dirty = false;
      pane.innerHTML = '';

      const agentBtn = document.createElement('button');
      agentBtn.type = 'button';
      agentBtn.className = 'de-new-btn em-agent-btn em-header-action-btn';
      agentBtn.setAttribute('aria-label', 'Agent');
      agentBtn.title = 'Agent';
      agentBtn.innerHTML = navIcon('agent', 16);
      agentBtn.addEventListener('click', () => askAgentAboutKnowledge(entry || { slug, title: data.title }));

      const { header } = createPaneSubheader({
        back: {
          label: 'Back to knowledge',
          onClick: async () => {
            await flushKnowledgeAutosave();
            if (knowledgeState.dirty && !(await confirmDiscardChanges())) return;
            knowledgeState.activeSlug = null;
            knowledgeState.dirty = false;
            getKnowledgeEditor()?.classList.remove('de-pane-active');
            syncKnowledgeSidebarActiveState();
            renderKnowledgePane();
          },
        },
        title: data.title || entry?.title || slug,
        subtitle: slug,
        beforeIcons: [agentBtn],
        icons: [
          paneDeleteIcon({
            label: 'Delete knowledge doc',
            onClick: () => deleteKnowledge(slug),
          }),
        ],
      });
      pane.appendChild(header);

      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.spellcheck = false;
      ta.value = data.content;
      ta.addEventListener('input', () => {
        knowledgeState.dirty = ta.value !== knowledgeState.content;
        scheduleKnowledgeAutosave(slug, ta);
      });
      ta.addEventListener('blur', () => {
        knowledgeAutosaveFlush = () => autosaveKnowledgeQuiet(slug, ta.value, ta);
        void autosaveKnowledgeQuiet(slug, ta.value, ta);
      });
      pane.appendChild(ta);

      clearEditorFooterSave();
      getKnowledgeEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openKnowledge(slug) {
  if (slug === knowledgeState.activeSlug) {
    syncKnowledgeSidebarActiveState({ scroll: true });
    return;
  }
  await flushKnowledgeAutosave();
  if (knowledgeState.dirty && knowledgeState.activeSlug && !(await confirmDiscardChanges())) return;
  knowledgeState.activeSlug = slug;
  knowledgeState.dirty = false;
  syncKnowledgeSidebarActiveState({ scroll: true });
  renderKnowledgePane();
}

async function createKnowledge(slug, content) {
  if (!slug) { alert('Enter a slug.'); return; }
  if (!/^[a-z0-9._-]+$/i.test(slug)) { alert('Slug may only contain letters, numbers, dots, hyphens, and underscores.'); return; }
  if (!content.trim()) { alert('Content cannot be empty.'); return; }
  try {
    const res = await adminFetch(KNOWLEDGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        title: titleFromKnowledgeMarkdown(content, slug),
        content,
        source: 'manual',
      }),
    });
    const data = await res.json();
    if (res.status === 409) { alert('That slug already exists.'); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadKnowledgeTab();
    knowledgeState.activeSlug = slug;
    syncKnowledgeSidebarActiveState({ scroll: true });
    renderKnowledgePane();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveKnowledge(slug, content) {
  if (!content.trim()) { alert('Content cannot be empty.'); return; }
  try {
    const res = await adminFetch(`${KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleFromKnowledgeMarkdown(content, slug),
        content,
        source: 'manual',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.content = content;
    knowledgeState.dirty = false;
    await loadKnowledgeTab();
    knowledgeState.activeSlug = slug;
    syncKnowledgeSidebarActiveState({ scroll: true });
    renderKnowledgePane();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function deleteKnowledge(slug) {
  closeOpenSwipeRow();
  try {
    const res = await adminFetch(`${KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.activeSlug = null;
    knowledgeState.dirty = false;
    await loadKnowledgeTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- work tab ----

const WORK_STATUS_LABELS = {
  inquiry: 'Inquiry',
  active: 'Active',
  done: 'Done',
  archived: 'Archived',
};

const WORK_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const WORK_SOURCE_SUGGESTIONS = ['instagram', 'email', 'referral', 'phone'];

let workState = {
  jobs: [],
  statuses: ['inquiry', 'active', 'done', 'archived'],
  priorities: ['low', 'normal', 'high', 'urgent'],
  search: '',
  activeSlug: null,
  dirty: false,
  draft: null,
  returnToEmailId: null,
  returnToTodoId: null,
};

let workAutosaveTimer = null;
let workAutosaveFlush = null;

function syncWorkSidebarTitle(slug, title) {
  const job = workState.jobs.find((j) => j.slug === slug);
  if (job) job.title = title;
  const titleEl = document.querySelector(
    `.ch-list-item[data-slug="${CSS.escape(slug)}"] .ch-item-title`,
  );
  if (titleEl) titleEl.textContent = title;
}

function workPayloadUnchanged(payload, draft) {
  if (!draft) return true;
  const tags = Array.isArray(draft.tags) ? draft.tags.join(', ') : (draft.tags || '');
  const payloadTags = (payload.tags || []).join(', ');
  return (
    payload.title === draft.title &&
    (payload.contact_uid || '') === (draft.contact_uid || '') &&
    payload.status === draft.status &&
    payload.priority === (draft.priority || 'normal') &&
    (payload.due_date || '') === (draft.due_date || '') &&
    String(payload.value ?? '') === String(draft.value ?? '') &&
    payloadTags === tags &&
    (payload.source || '') === (draft.source || '') &&
    payload.body === draft.body
  );
}

function scheduleWorkAutosave(slug, getPayload, activeEl) {
  clearTimeout(workAutosaveTimer);
  workAutosaveTimer = setTimeout(() => {
    workAutosaveTimer = null;
    void autosaveWorkQuiet(slug, getPayload, activeEl);
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function flushWorkAutosave() {
  if (workAutosaveTimer) {
    clearTimeout(workAutosaveTimer);
    workAutosaveTimer = null;
  }
  if (typeof workAutosaveFlush === 'function') {
    await workAutosaveFlush();
    workAutosaveFlush = null;
  }
}

async function autosaveWorkQuiet(slug, getPayload, activeEl) {
  const payload = getPayload();
  if (!payload.title || !payload.contact_uid) {
    if (activeEl) setFormFieldState(activeEl, 'invalid');
    return false;
  }
  const draft = workState.draft;
  if (workPayloadUnchanged(payload, draft)) {
    workState.dirty = false;
    return true;
  }
  if (activeEl) setFormFieldState(activeEl, 'saving');
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    Object.assign(workState.draft, {
      title: payload.title,
      contact_uid: payload.contact_uid,
      contact_name: payload.contact_name,
      status: payload.status,
      priority: payload.priority,
      due_date: payload.due_date || '',
      value: payload.value ?? '',
      tags: payload.tags || [],
      source: payload.source || '',
      body: payload.body,
    });
    workState.dirty = false;
    syncWorkSidebarTitle(slug, payload.title);
    if (activeEl) flashFormFieldSaved(activeEl);
    return true;
  } catch (e) {
    console.warn('[work] autosave failed', e);
    if (activeEl) setFormFieldState(activeEl, 'invalid');
    return false;
  }
}

function filterWorkJobs(jobs, query) {
  return jobs.filter((job) =>
    matchesListSearch(
      query,
      job.title,
      job.contact_name,
      job.client,
      job.status,
      WORK_STATUS_LABELS[job.status],
      job.slug,
      job.tags,
    ),
  );
}

function getWorkEditor() { return document.getElementById('work-editor'); }

function workStatusClass(status) {
  return `wk-status wk-status-${status || 'inquiry'}`;
}

function formatWorkCardDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

function formatWorkCardValue(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const WORK_CHECKBOX_RE = /^- \[([ xX])\] (.+)$/;

function parseWorkChecklistFromBody(body) {
  const lines = String(body || '').split('\n');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(WORK_CHECKBOX_RE);
    if (!m) continue;
    items.push({
      lineIndex: i,
      text: m[2].trim(),
      checked: m[1].toLowerCase() === 'x',
    });
  }
  return items;
}

function renderWorkChecklistPanel(mountEl, opts) {
  const { slug, title, clientName, getBody, setBody } = opts;
  const items = parseWorkChecklistFromBody(getBody());
  mountEl.innerHTML = '';
  if (!items.length) {
    mountEl.hidden = true;
    return;
  }
  mountEl.hidden = false;

  const section = document.createElement('div');
  section.className = 'wk-checklist-section';

  const head = document.createElement('div');
  head.className = 'wk-checklist-head';
  const label = document.createElement('span');
  label.className = 'wk-checklist-label';
  label.textContent = 'Action items';
  head.appendChild(label);
  const doneCount = items.filter((i) => i.checked).length;
  if (doneCount) {
    const badge = document.createElement('span');
    badge.className = 'wk-checklist-progress';
    badge.textContent = `${doneCount}/${items.length} done`;
    head.appendChild(badge);
  }
  section.appendChild(head);

  const list = document.createElement('ul');
  list.className = 'wk-checklist';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'wk-checklist-item' + (item.checked ? ' wk-checklist-item--done' : '');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wk-checklist-btn';
    btn.setAttribute('aria-pressed', item.checked ? 'true' : 'false');
    btn.title = item.checked ? 'Mark as not done' : 'Mark as done';

    const box = document.createElement('span');
    box.className = 'wk-checklist-box';
    box.setAttribute('aria-hidden', 'true');
    box.textContent = item.checked ? '✓' : '';

    const text = document.createElement('span');
    text.className = 'wk-checklist-text';
    text.textContent = item.text;

    btn.append(box, text);
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const nextChecked = !item.checked;
      fetch(`/api/work/${encodeURIComponent(slug)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIndex: item.lineIndex, checked: nextChecked }),
      })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok || !data.ok) throw new Error(data.error || 'Toggle failed');
          setBody(data.body);
          renderWorkChecklistPanel(mountEl, opts);
        })
        .catch((err) => {
          osAlert({ title: 'Could not update item', bodyHtml: escHtml(err.message) });
        })
        .finally(() => {
          btn.disabled = false;
        });
    });

    li.appendChild(btn);
    list.appendChild(li);
  }
  section.appendChild(list);

  const doneItems = items.filter((i) => i.checked);
  if (doneItems.length) {
    const bill = document.createElement('div');
    bill.className = 'wk-billable-section';

    const billHead = document.createElement('div');
    billHead.className = 'wk-billable-head';
    const billLabel = document.createElement('span');
    billLabel.className = 'wk-billable-label';
    billLabel.textContent = 'Ready to invoice';
    billHead.appendChild(billLabel);

    const copyBtn = createIosIconBtn({
      iconKey: 'copy',
      label: 'Copy line descriptions',
      className: 'ios-icon-btn wk-billable-copy',
      onClick: () => {
        const lines = doneItems.map((i) => i.text).join('\n');
        navigator.clipboard.writeText(lines).then(
          () => osAlert({ title: 'Copied', bodyHtml: '<p>Completed item descriptions copied — paste into invoice line items or ask the agent to invoice.</p>' }),
          () => osAlert({ title: 'Copy failed', bodyHtml: '<p>Could not access clipboard.</p>' }),
        );
      },
    });
    billHead.appendChild(copyBtn);
    bill.appendChild(billHead);

    const billList = document.createElement('ul');
    billList.className = 'wk-billable-list';
    for (const item of doneItems) {
      const li = document.createElement('li');
      li.className = 'wk-billable-item';
      li.textContent = item.text;
      billList.appendChild(li);
    }
    bill.appendChild(billList);

    const hint = document.createElement('p');
    hint.className = 'wk-billable-hint';
    hint.textContent = `Use these as Crater line-item descriptions for ${clientName || title || 'this client'}.`;
    bill.appendChild(hint);

    section.appendChild(bill);
  }

  mountEl.appendChild(section);
}

function createClientWorkCard(job) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'cl-job-card';

  const title = document.createElement('span');
  title.className = 'cl-job-card-title';
  title.textContent = job.title || job.slug || 'Untitled';

  const meta = document.createElement('div');
  meta.className = 'cl-job-card-meta';

  const status = document.createElement('span');
  status.className = workStatusClass(job.status);
  status.textContent = WORK_STATUS_LABELS[job.status] || job.status || 'Inquiry';
  meta.appendChild(status);

  if (job.created) {
    const created = document.createElement('span');
    created.className = 'cl-job-card-date';
    created.textContent = formatWorkCardDate(job.created);
    meta.appendChild(created);
  }

  if (job.priority && job.priority !== 'normal') {
    const prio = document.createElement('span');
    prio.className = `cl-job-card-priority cl-job-card-priority--${job.priority}`;
    prio.textContent = WORK_PRIORITY_LABELS[job.priority] || job.priority;
    meta.appendChild(prio);
  }

  if (job.due_date) {
    const due = document.createElement('span');
    due.className = 'cl-job-card-due';
    due.textContent = `Due ${job.due_date}`;
    meta.appendChild(due);
  }

  const valueLabel = formatWorkCardValue(job.value);
  if (valueLabel) {
    const val = document.createElement('span');
    val.className = 'cl-job-card-value';
    val.textContent = valueLabel;
    meta.appendChild(val);
  }

  if (job.source) {
    const source = document.createElement('span');
    source.className = 'cl-job-card-source';
    source.textContent = job.source;
    meta.appendChild(source);
  }

  card.appendChild(title);
  card.appendChild(meta);
  card.addEventListener('click', async () => {
    setActiveMap('work');
    await loadWorkTab();
    openWork(job.slug);
  });
  return card;
}

function renderClientWorkSection(jobsWrap, jobs) {
  jobsWrap.innerHTML = '';
  const jobsLabel = document.createElement('div');
  jobsLabel.className = 'de-label cl-jobs-label';
  jobsLabel.textContent = `Work (${jobs.length})`;
  jobsWrap.appendChild(jobsLabel);
  if (jobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty cl-jobs-empty';
    empty.textContent = 'No active jobs for this client.';
    jobsWrap.appendChild(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'cl-jobs-grid';
  for (const job of jobs) {
    grid.appendChild(createClientWorkCard(job));
  }
  jobsWrap.appendChild(grid);
}

function mountClientWorkSection(pane, uid) {
  const jobsWrap = document.createElement('div');
  jobsWrap.className = 'cl-jobs-section';
  jobsWrap.innerHTML = '<div class="de-loading">Loading jobs…</div>';
  pane.appendChild(jobsWrap);
  fetch(`/api/work?contact_uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((jobData) => {
      const jobs = (jobData.jobs || [])
        .filter((j) => j.status !== 'archived')
        .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
      renderClientWorkSection(jobsWrap, jobs);
    })
    .catch(() => {
      jobsWrap.innerHTML = '';
    });
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function loadWorkTab(opts = {}) {
  const root = getWorkEditor();
  if (!root) return;
  const deepSlug = opts.workSlug || pendingWorkDeepLinkSlug || parseWorkDeepLinkFromUrl();
  const preserveNew =
    workState.activeSlug === '__new__' &&
    workState.draft &&
    (opts.workSlug === '__new__' || pendingWorkDeepLinkSlug === '__new__');
  if (!preserveNew) {
    root.innerHTML = '<div class="de-loading">Loading work…</div>';
  }
  try {
    const res = await adminFetch('/api/work');
    const data = await readAdminJson(res, 'Projects');
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.jobs = data.jobs || [];
    workState.statuses = data.statuses || workState.statuses;
    workState.priorities = data.priorities || workState.priorities;
  } catch (e) {
    if (e.message === 'Session expired') return;
    if (!deepSlug) {
      root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
      return;
    }
    console.warn('[work] project list unavailable', e);
  }
  pendingWorkDeepLinkSlug = null;
  workState.activeSlug = deepSlug || null;
  workState.dirty = false;
  if (!preserveNew) workState.draft = null;
  clearEditorFooterSave();
  if (!workState.activeSlug) getWorkEditor()?.classList.remove('de-pane-active');
  renderWorkEditor();
}

function startNewProject() {
  workState.returnToEmailId = null;
  workState.returnToTodoId = null;
  workState.activeSlug = '__new__';
  workState.dirty = false;
  workState.draft = {
    title: '',
    contact_uid: '',
    contact_name: '',
    status: 'inquiry',
    priority: 'normal',
    due_date: '',
    value: '',
    tags: '',
    source: '',
    body: '',
  };
  renderWorkEditor();
}

function startNewClient() {
  clientState.activeUid = '__new__';
  clientState.dirty = false;
  clientState.draft = {
    name: '',
    email: '',
    phone: '',
    company: '',
    website: '',
    notes: '',
  };
  getClientsEditor()?.classList.add('de-pane-active');
  renderClientsEditor();
}

function fillWorkSidebarList(list) {
  const { search } = workState;
  const visibleJobs = filterWorkJobs(workState.jobs, search);
  list.innerHTML = '';
  for (const job of visibleJobs) {
    list.appendChild(createWorkSwipeRow(job));
  }
  if (visibleJobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = search.trim() ? 'No matches.' : 'No projects yet.';
    list.appendChild(empty);
  } else if (!search.trim()) {
    attachSidebarListReorder(list, visibleJobs.map((j) => j.slug), persistWorkOrder);
  }
}

function refreshWorkSidebarList() {
  const root = getWorkEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderWorkEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    const count = workState.jobs.length;
    const jobLabel = count === 1 ? 'project' : 'projects';
    searchInput.placeholder = `Search ${count} ${jobLabel}`;
  }
  fillWorkSidebarList(list);
}

function renderWorkEditor() {
  const root = getWorkEditor();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const { jobs, activeSlug, search } = workState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const jobLabel = jobs.length === 1 ? 'project' : 'projects';
  const subheader = listSearchSubheader({
    itemCount: jobs.length,
    search: {
      value: search,
      placeholder: `Search ${jobs.length} ${jobLabel}`,
      onInput: (value) => {
        workState.search = value;
        refreshWorkSidebarList();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillWorkSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeSlug === '__new__') {
    renderNewWorkForm(pane);
  } else if (activeSlug) {
    renderEditWorkForm(pane);
  } else {
    clearEditorFooterSave();
    appendEmptyDetailPane(pane, {
      mapKey: 'work',
      iconName: 'briefcase',
      bodyHtml: '<p>Select a job to edit, or create a new one.</p>',
      onCreate: () => startNewProject(),
    });
  }

  root.appendChild(pane);
  finishSidebarListScroll(root, savedSidebarScroll);
}

function workStatusPillOptions() {
  return workState.statuses.map((s) => ({ value: s, label: WORK_STATUS_LABELS[s] || s }));
}

function workPriorityPillOptions() {
  return workState.priorities.map((p) => ({ value: p, label: WORK_PRIORITY_LABELS[p] || p }));
}

function appendWorkMetaFields(fields, draft, markDirty) {
  const priorityPill = createSlidingPillSelect({
    label: 'Priority',
    value: draft?.priority || 'normal',
    options: workPriorityPillOptions(),
    ariaLabel: 'Priority',
    onChange: markDirty || undefined,
  });
  fields.appendChild(priorityPill.el);

  const dueLabel = document.createElement('label');
  dueLabel.className = 'de-label';
  dueLabel.textContent = 'Due date';
  const dueInput = document.createElement('input');
  dueInput.className = 'de-input';
  dueInput.type = 'date';
  dueInput.value = draft?.due_date || '';
  dueLabel.appendChild(dueInput);
  fields.appendChild(dueLabel);

  const valueLabel = document.createElement('label');
  valueLabel.className = 'de-label';
  valueLabel.textContent = 'Value ($)';
  const valueInput = document.createElement('input');
  valueInput.className = 'de-input';
  valueInput.type = 'number';
  valueInput.min = '0';
  valueInput.step = '0.01';
  valueInput.placeholder = '0.00';
  valueInput.value = draft?.value != null && draft?.value !== '' ? String(draft.value) : '';
  valueLabel.appendChild(valueInput);
  fields.appendChild(valueLabel);

  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'de-label';
  tagsLabel.textContent = 'Tags';
  const tagsInput = document.createElement('input');
  tagsInput.className = 'de-input';
  tagsInput.placeholder = 'web-design, seo, hosting';
  tagsInput.value = Array.isArray(draft?.tags) ? draft.tags.join(', ') : (draft?.tags || '');
  tagsLabel.appendChild(tagsInput);
  fields.appendChild(tagsLabel);

  const sourceLabel = document.createElement('label');
  sourceLabel.className = 'de-label';
  sourceLabel.textContent = 'Lead source';
  const sourceInput = document.createElement('input');
  sourceInput.className = 'de-input';
  sourceInput.placeholder = 'instagram, email, referral, phone';
  sourceInput.setAttribute('list', 'wk-source-suggestions');
  sourceInput.value = draft?.source || '';
  sourceLabel.appendChild(sourceInput);
  fields.appendChild(sourceLabel);
  let datalist = document.getElementById('wk-source-suggestions');
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = 'wk-source-suggestions';
    for (const s of WORK_SOURCE_SUGGESTIONS) {
      const opt = document.createElement('option');
      opt.value = s;
      datalist.appendChild(opt);
    }
    document.body.appendChild(datalist);
  }

  if (markDirty) {
    dueInput.addEventListener('input', () => markDirty(dueInput));
    valueInput.addEventListener('input', () => markDirty(valueInput));
    tagsInput.addEventListener('input', () => markDirty(tagsInput));
    sourceInput.addEventListener('input', () => markDirty(sourceInput));
    dueInput.addEventListener('change', () => markDirty(dueInput));
    valueInput.addEventListener('change', () => markDirty(valueInput));
  }

  return {
    getPayload() {
      const valueRaw = valueInput.value.trim();
      return {
        priority: priorityPill.getValue(),
        due_date: dueInput.value.trim() || null,
        value: valueRaw === '' ? null : Number(valueRaw),
        tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
        source: sourceInput.value.trim(),
      };
    },
  };
}

let workClientSearchTimer = null;

/** Extract a client search hint from titles like "Reggie / Solid Builders". */
function extractClientHintFromTitle(title) {
  const trimmed = String(title || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[\/|—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  return parts[parts.length - 1];
}

function workClientSubline(c) {
  const bits = [];
  if (c.matchReason === 'company' && c.company) bits.push(c.company);
  else if (c.company) bits.push(c.company);
  if (c.email) bits.push(c.email);
  if (!bits.length && c.phone) bits.push(c.phone);
  if (!bits.length) bits.push(c.uid.slice(0, 8) + '…');
  return bits.join(' · ');
}

/**
 * Client combobox: search existing contacts, pick one, or add new inline.
 * Returns { getPayload, isValid } — save uses contact_uid (no resolve on save).
 */
function mountWorkClientPicker(parent, initial, onChange, opts = {}) {
  const readOnly = opts.readOnly === true;
  let selected = initial?.contact_uid
    ? {
        uid: initial.contact_uid,
        name: initial.contact_name || initial.client || '',
        logoUrl: initial.contact_logo_url || '',
      }
    : null;
  let changing = false;
  let showingNew = false;

  const wrap = document.createElement('div');
  wrap.className = 'wk-client-picker' + (readOnly ? ' wk-client-picker--readonly' : '');

  let profileLink = null;
  let clientNameEl = null;
  const selectedEl = document.createElement('div');
  selectedEl.className = 'wk-client-selected';
  const selectedName = document.createElement('span');
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';

  if (readOnly) {
    profileLink = document.createElement('button');
    profileLink.type = 'button';
    profileLink.className = 'wk-client-selected wk-client-profile-link';
    profileLink.addEventListener('click', () => {
      if (selected?.uid) navigateToClient(selected.uid);
    });
    clientNameEl = document.createElement('span');
    clientNameEl.className = 'wk-client-name';
    profileLink.appendChild(clientNameEl);
    wrap.appendChild(profileLink);
  } else {
    selectedEl.appendChild(selectedName);
    selectedEl.appendChild(changeBtn);
    wrap.appendChild(selectedEl);
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search clients…';
  searchInput.autocomplete = 'off';
  searchWrap.appendChild(searchInput);
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(dropdown);
  wrap.appendChild(searchWrap);

  const newForm = document.createElement('div');
  newForm.className = 'wk-client-new';
  newForm.style.display = 'none';
  newForm.innerHTML = '<span class="de-label">New client</span>';
  const newName = document.createElement('input');
  newName.className = 'de-input';
  newName.placeholder = 'Full name (required)';
  const newEmail = document.createElement('input');
  newEmail.className = 'de-input';
  newEmail.type = 'email';
  newEmail.placeholder = 'Email (optional)';
  const newActions = document.createElement('div');
  newActions.className = 'wk-client-new-actions';
  const newCancel = document.createElement('button');
  newCancel.type = 'button';
  newCancel.className = 'de-btn de-btn-ghost';
  newCancel.textContent = 'Cancel';
  const newSave = document.createElement('button');
  newSave.type = 'button';
  newSave.className = 'de-btn de-btn-primary';
  newSave.textContent = 'Create client';
  newActions.appendChild(newCancel);
  newActions.appendChild(newSave);
  newForm.appendChild(newName);
  newForm.appendChild(newEmail);
  newForm.appendChild(newActions);
  wrap.appendChild(newForm);

  parent.appendChild(wrap);

  function syncReadOnlyClientLink() {
    const has = !!selected?.uid;
    searchWrap.style.display = 'none';
    newForm.style.display = 'none';
    profileLink.style.display = !showingNew && !changing ? 'flex' : 'none';
    if (has) {
      clientNameEl.textContent = selected.name;
      profileLink.disabled = false;
      profileLink.title = `Open ${selected.name} profile`;
    } else {
      clientNameEl.textContent = 'No client';
      profileLink.disabled = true;
      profileLink.removeAttribute('title');
    }
  }

  function syncView() {
    const has = !!selected?.uid;
    if (readOnly) {
      syncReadOnlyClientLink();
      return;
    }
    selectedEl.style.display = has && !showingNew && !changing ? 'flex' : 'none';
    searchWrap.style.display = showingNew ? 'none' : changing || !has ? 'block' : 'none';
    newForm.style.display = showingNew ? 'flex' : 'none';
    if (has) selectedName.textContent = selected.name;
  }

  function exitChangeMode() {
    changing = false;
    searchInput.value = '';
    dropdown.style.display = 'none';
    syncView();
  }

  function pick(client) {
    const prevUid = selected?.uid || '';
    selected = { uid: client.uid, name: client.name, logoUrl: client.logoUrl || '' };
    showingNew = false;
    changing = false;
    dropdown.style.display = 'none';
    searchInput.value = '';
    syncView();
    if (client.uid !== prevUid) onChange?.();
  }

  function renderDropdown(clients, query) {
    dropdown.innerHTML = '';
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      const matchTag = c.matchReason === 'company'
        ? `<span class="wk-client-match-tag">company match</span>`
        : '';
      btn.innerHTML = `${escHtml(c.name)}${matchTag}<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'wk-client-option wk-client-add';
    addBtn.textContent = query.trim() ? `+ Add "${query.trim()}" as new client` : '+ Add new client';
    addBtn.addEventListener('click', () => beginAddNewClient(query.trim()));
    dropdown.appendChild(addBtn);
    dropdown.style.display = 'block';
  }

  async function resolveClientMatches(name) {
    if (!name?.trim()) return null;
    const res = await fetch('/api/clients/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data;
  }

  async function beginAddNewClient(name) {
    const resolved = await resolveClientMatches(name);
    if (resolved?.match === 'likely' && resolved.contact?.uid) {
      const label = resolved.contact.company
        ? `${resolved.contact.name} (${resolved.contact.company})`
        : resolved.contact.name;
      if (confirm(`"${label}" already exists. Use this client instead of creating a new one?`)) {
        pick(resolved.contact);
        return;
      }
    }
    if (resolved?.match === 'possible' && Array.isArray(resolved.candidates) && resolved.candidates.length) {
      renderDropdown(resolved.candidates, name);
      changing = true;
      showingNew = false;
      searchInput.value = name;
      syncView();
      searchInput.focus();
      return;
    }
    showingNew = true;
    newName.value = name;
    newEmail.value = '';
    dropdown.style.display = 'none';
    syncView();
    newName.focus();
  }

  async function fetchClients(q) {
    const params = new URLSearchParams();
    if (q?.trim()) params.set('q', q.trim());
    params.set('limit', '20');
    const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.clients || [];
  }

  function scheduleSearch() {
    clearTimeout(workClientSearchTimer);
    workClientSearchTimer = setTimeout(async () => {
      try {
        const clients = await fetchClients(searchInput.value);
        renderDropdown(clients, searchInput.value);
      } catch (e) {
        dropdown.innerHTML = `<div class="de-empty">${escHtml(e.message)}</div>`;
        dropdown.style.display = 'block';
      }
    }, 250);
  }

  changeBtn.addEventListener('click', () => {
    if (readOnly) return;
    showingNew = false;
    changing = true;
    syncView();
    searchInput.focus();
    scheduleSearch();
  });

  searchInput.addEventListener('focus', () => scheduleSearch());
  searchInput.addEventListener('input', () => scheduleSearch());
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!wrap.contains(document.activeElement) && changing && !showingNew) exitChangeMode();
    }, 0);
  });
  attachAutosuggestKeyboardNav(searchInput, dropdown, {
    optionSelector: '.wk-client-option',
    onClose: () => {
      dropdown.style.display = 'none';
      if (changing && !showingNew) exitChangeMode();
    },
  });

  newCancel.addEventListener('click', () => {
    showingNew = false;
    changing = !selected?.uid;
    syncView();
    if (changing) searchInput.focus();
  });

  newSave.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (!name) { alert('Enter a client name.'); return; }
    newSave.disabled = true;
    try {
      const resolved = await resolveClientMatches(name);
      if (resolved?.match === 'likely' && resolved.contact?.uid) {
        const label = resolved.contact.company
          ? `${resolved.contact.name} (${resolved.contact.company})`
          : resolved.contact.name;
        if (confirm(`"${label}" already exists. Use this client instead of creating a new one?`)) {
          pick(resolved.contact);
          return;
        }
      }
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: newEmail.value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      pick({ uid: data.uid, name: data.name });
    } catch (e) {
      alert(`Failed to create client: ${e.message}`);
    } finally {
      newSave.disabled = false;
    }
  });

  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) {
      dropdown.style.display = 'none';
      if (changing && !showingNew) exitChangeMode();
    }
  });

  syncView();

  return {
    getPayload() {
      if (!selected?.uid) return null;
      return { contact_uid: selected.uid, contact_name: selected.name };
    },
    isValid: () => !!selected?.uid,
    getSelectedUid: () => selected?.uid || '',
    searchWithHint(hint) {
      if (readOnly || selected?.uid) return;
      const q = String(hint || '').trim();
      if (!q) return;
      changing = true;
      showingNew = false;
      searchInput.value = q;
      syncView();
      scheduleSearch();
    },
  };
}

function createWorkFormScroll(pane) {
  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll wk-form-scroll';
  pane.appendChild(scroll);
  return scroll;
}

function renderNewWorkForm(pane) {
  pane.innerHTML = '';
  const returnTodoId = workState.returnToTodoId;
  const { header, titleInput } = createPaneSubheader({
    back: {
      label: returnTodoId ? 'Back to to‑do' : 'Back to jobs',
      onClick: async () => {
        if (returnTodoId) {
          workState.returnToTodoId = null;
          workState.activeSlug = null;
          workState.draft = null;
          getWorkEditor()?.classList.remove('de-pane-active');
          navigateToTodo(returnTodoId);
          return;
        }
        workState.activeSlug = null;
        workState.draft = null;
        getWorkEditor()?.classList.remove('de-pane-active');
        renderWorkEditor();
      },
    },
    editableTitle: {
      value: workState.draft?.title || '',
      placeholder: 'New job',
      ariaLabel: 'Job title',
    },
  });
  pane.appendChild(header);

  const scroll = createWorkFormScroll(pane);

  const fields = document.createElement('div');
  fields.className = 'de-fields';

  let clientPicker;
  clientPicker = mountWorkClientPicker(fields, workState.draft, () => { workState.dirty = true; });

  let titleHintTimer = null;
  titleInput.addEventListener('input', () => {
    clearTimeout(titleHintTimer);
    titleHintTimer = setTimeout(() => {
      const hint = extractClientHintFromTitle(titleInput.value);
      if (hint) clientPicker.searchWithHint(hint);
    }, 400);
  });
  const initialHint = extractClientHintFromTitle(workState.draft?.title || titleInput.value);
  if (initialHint) clientPicker.searchWithHint(initialHint);

  const statusPill = createSlidingPillSelect({
    label: 'Status',
    value: workState.draft?.status || 'inquiry',
    options: workStatusPillOptions(),
    ariaLabel: 'Status',
  });
  fields.appendChild(statusPill.el);

  const metaFields = appendWorkMetaFields(fields, workState.draft, null);

  scroll.appendChild(fields);

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.spellcheck = false;
  ta.placeholder = '# Job details\n\nScope, notes, links…';
  ta.value = workState.draft?.body || '';
  scroll.appendChild(ta);

  setEditorFooterSave(() => {
    const title = titleInput.value.trim();
    const slug = slugifyTitle(title);
    const client = clientPicker.getPayload();
    if (!client) { alert('Select a client, or add a new one.'); return; }
    return createWork(slug, {
      title,
      ...client,
      status: statusPill.getValue(),
      ...metaFields.getPayload(),
      body: ta.value,
    });
  });
  getWorkEditor()?.classList.add('de-pane-active');
}

function mountWorkCommentsSection(pane, slug) {
  const wrap = document.createElement('div');
  wrap.className = 'wk-comments-section';
  wrap.innerHTML = '<div class="de-loading">Loading comments…</div>';
  pane.appendChild(wrap);

  fetch(`/api/work/${encodeURIComponent(slug)}/comments`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      wrap.innerHTML = '';
      const label = document.createElement('div');
      label.className = 'de-label';
      label.textContent = 'Client comments';
      wrap.appendChild(label);

      const list = document.createElement('div');
      list.className = 'wk-comment-list';
      const comments = data.comments || [];

      if (comments.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'de-empty';
        empty.style.padding = '0.5rem 0';
        empty.textContent = 'No comments yet.';
        list.appendChild(empty);
      } else {
        for (const c of comments) {
          const row = document.createElement('div');
          row.className = `wk-comment wk-comment-${c.author}`;
          const when = c.createdAt ? new Date(c.createdAt).toLocaleString() : '';
          row.innerHTML =
            `<div class="wk-comment-head">` +
            `<span class="wk-comment-author">${escHtml(c.authorName || (c.author === 'staff' ? 'Team' : 'Client'))}</span>` +
            `<span class="wk-comment-time">${escHtml(when)}</span>` +
            `</div>` +
            `<div class="wk-comment-text">${escHtml(c.text)}</div>`;
          list.appendChild(row);
        }
      }
      wrap.appendChild(list);

      const replyLabel = document.createElement('label');
      replyLabel.className = 'de-label';
      replyLabel.textContent = 'Reply (visible on client portal)';
      const replyTa = document.createElement('textarea');
      replyTa.className = 'de-textarea wk-comment-reply';
      replyTa.rows = 3;
      replyTa.maxLength = 4000;
      replyTa.placeholder = 'Write a reply to the client…';
      replyLabel.appendChild(replyTa);
      wrap.appendChild(replyLabel);

      const replyActions = document.createElement('div');
      replyActions.className = 'wk-reply-actions';
      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'de-btn de-btn-primary de-btn-with-icon';
      setDeBtnLabel(replyBtn, 'Post reply', 'send');
      replyBtn.addEventListener('click', async () => {
        const text = replyTa.value.trim();
        if (!text) { replyTa.focus(); return; }
        replyBtn.disabled = true;
        updateDeBtnLabel(replyBtn, 'Posting…');
        try {
          const res = await fetch(`/api/work/${encodeURIComponent(slug)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const payload = await res.json();
          if (!res.ok || !payload.ok) throw new Error(payload.error || `HTTP ${res.status}`);
          replyTa.value = '';
          const parent = wrap.parentElement;
          wrap.remove();
          if (parent) mountWorkCommentsSection(parent, slug);
        } catch (e) {
          alert(`Failed to post reply: ${e.message}`);
        } finally {
          replyBtn.disabled = false;
          updateDeBtnLabel(replyBtn, 'Post reply');
        }
      });
      replyActions.appendChild(replyBtn);
      wrap.appendChild(replyActions);
    })
    .catch(() => {
      wrap.innerHTML = '';
    });
}

function renderEditWorkForm(pane) {
  const slug = workState.activeSlug;
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/work/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then((r) => readApiJson(r))
    .then((data) => {
      workState.draft = {
        title: data.title,
        status: data.status || 'inquiry',
        priority: data.priority || 'normal',
        due_date: data.due_date || '',
        value: data.value ?? '',
        tags: data.tags || [],
        source: data.source || '',
        body: data.body || '',
        contact_uid: data.contact_uid,
        contact_name: data.contact_name || data.client,
      };
      workState.dirty = false;
      pane.innerHTML = '';

      const returnEmailId = workState.returnToEmailId;
      const returnTodoId = workState.returnToTodoId;

      const linkTrackEl = document.createElement('div');
      linkTrackEl.className = 'wk-link-track';
      linkTrackEl.hidden = true;

      const icons = [];
      const shareBtn = data.contact_uid
        ? createPortalShareBtn(data.contact_uid, {
            tab: 'work',
            jobSlug: slug,
            trackEl: linkTrackEl,
            title: `${data.contact_name || data.client || 'Client'} — Work`,
            recipient: {
              contactUid: data.contact_uid,
              name: data.contact_name || data.client || 'Client',
              email: data.contact_email,
              phone: data.contact_phone,
            },
          })
        : null;
      if (shareBtn) icons.push(shareBtn);
      icons.push(
        paneDeleteIcon({
          label: 'Delete project',
          onClick: () => deleteWork(slug),
        }),
      );

      const { header, titleInput } = createPaneSubheader({
        back: {
          label: returnEmailId ? 'Back to email' : returnTodoId ? 'Back to to‑do' : 'Back to jobs',
          onClick: async () => {
            await flushWorkAutosave();
            if (workState.dirty && !(await confirmDiscardChanges())) return;
            if (returnEmailId) {
              workState.returnToEmailId = null;
              workState.activeSlug = null;
              workState.draft = null;
              navigateToEmail(returnEmailId);
              return;
            }
            if (returnTodoId) {
              workState.returnToTodoId = null;
              workState.activeSlug = null;
              workState.draft = null;
              getWorkEditor()?.classList.remove('de-pane-active');
              navigateToTodo(returnTodoId, { fromWorkSlug: slug });
              return;
            }
            workState.activeSlug = null;
            workState.draft = null;
            getWorkEditor()?.classList.remove('de-pane-active');
            renderWorkEditor();
          },
        },
        editableTitle: {
          value: workState.draft.title,
          placeholder: 'Job title',
          ariaLabel: 'Job title',
        },
        icons,
      });
      pane.appendChild(header);

      const scroll = createWorkFormScroll(pane);

      const fields = document.createElement('div');
      fields.className = 'de-fields';

      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.spellcheck = false;
      ta.value = workState.draft.body;

      let clientPicker;
      let metaFields;
      let statusPill;
      let workActiveEl = titleInput;
      const markDirty = () => {
        const client = clientPicker.getPayload();
        const meta = metaFields.getPayload();
        workState.dirty =
          titleInput.value !== workState.draft.title ||
          (client?.contact_uid || '') !== (workState.draft.contact_uid || '') ||
          statusPill.getValue() !== workState.draft.status ||
          meta.priority !== (workState.draft.priority || 'normal') ||
          (meta.due_date || '') !== (workState.draft.due_date || '') ||
          String(meta.value ?? '') !== String(workState.draft.value ?? '') ||
          meta.tags.join(', ') !== (Array.isArray(workState.draft.tags) ? workState.draft.tags.join(', ') : '') ||
          meta.source !== (workState.draft.source || '') ||
          ta.value !== workState.draft.body;
      };
      const getWorkPayload = () => {
        const client = clientPicker.getPayload();
        if (!client) return null;
        return {
          title: titleInput.value.trim(),
          ...client,
          status: statusPill.getValue(),
          ...metaFields.getPayload(),
          body: ta.value,
        };
      };
      const queueWorkAutosave = (el) => {
        if (el) workActiveEl = el;
        markDirty();
        const payloadFn = () => getWorkPayload() || { title: '', contact_uid: '', body: '' };
        workAutosaveFlush = () => autosaveWorkQuiet(slug, payloadFn, workActiveEl);
        scheduleWorkAutosave(slug, payloadFn, workActiveEl);
      };
      const flushWorkField = () => {
        const payloadFn = () => getWorkPayload() || { title: '', contact_uid: '', body: '' };
        workAutosaveFlush = () => autosaveWorkQuiet(slug, payloadFn, workActiveEl);
        return autosaveWorkQuiet(slug, payloadFn, workActiveEl);
      };
      clientPicker = mountWorkClientPicker(fields, workState.draft, () => queueWorkAutosave(workActiveEl), { readOnly: true });
      fields.insertBefore(linkTrackEl, fields.firstChild);
      renderWorkLinkTrackStatus(linkTrackEl, data.tracked_links);

      statusPill = createSlidingPillSelect({
        label: 'Status',
        value: workState.draft.status,
        options: workStatusPillOptions(),
        ariaLabel: 'Status',
        onChange: () => queueWorkAutosave(statusPill.el),
      });
      fields.appendChild(statusPill.el);

      metaFields = appendWorkMetaFields(fields, workState.draft, queueWorkAutosave);

      const checklistMount = document.createElement('div');
      checklistMount.className = 'wk-checklist-mount';
      const checklistOpts = {
        slug,
        get title() { return titleInput.value.trim() || workState.draft.title; },
        get clientName() { return clientPicker.getPayload()?.contact_name || workState.draft.contact_name; },
        getBody: () => ta.value,
        setBody: (v) => {
          ta.value = v;
          workState.draft.body = v;
          queueWorkAutosave(ta);
        },
      };

      titleInput.addEventListener('input', () => queueWorkAutosave(titleInput));
      titleInput.addEventListener('blur', () => { workActiveEl = titleInput; void flushWorkField(); });
      ta.addEventListener('input', () => {
        queueWorkAutosave(ta);
        renderWorkChecklistPanel(checklistMount, checklistOpts);
      });
      ta.addEventListener('blur', () => { workActiveEl = ta; void flushWorkField(); });

      for (const el of fields.querySelectorAll('.de-input')) {
        el.addEventListener('blur', () => { workActiveEl = el; void flushWorkField(); });
      }

      scroll.appendChild(fields);
      scroll.appendChild(checklistMount);
      scroll.appendChild(ta);
      renderWorkChecklistPanel(checklistMount, checklistOpts);
      mountWorkCommentsSection(scroll, slug);
      mountWorkFilesSection(scroll, slug, data.files);
      mountWorkTodosSection(scroll, slug);
      mountWorkRelatedSection(scroll, data.related, data.source_chat_id);

      clearEditorFooterSave();
      getWorkEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openWork(slug) {
  await flushWorkAutosave();
  if (workState.dirty && workState.activeSlug && !(await confirmDiscardChanges())) return;
  workState.returnToEmailId = null;
  workState.returnToTodoId = null;
  workState.activeSlug = slug;
  workState.dirty = false;
  renderWorkEditor();
}

async function createWork(slug, payload) {
  if (!payload.title) { alert('Enter a title.'); return; }
  if (!payload.contact_uid) { alert('Select a client.'); return; }
  if (!slug) { alert('Could not derive a slug from the title.'); return; }
  const returnTodoId = workState.returnToTodoId;
  try {
    const res = await fetch('/api/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...payload }),
    });
    const data = await res.json();
    if (res.status === 409) { alert('A job with that slug already exists.'); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadWorkTab();
    if (returnTodoId) {
      try {
        const linkRes = await fetch(`/api/todos/${encodeURIComponent(returnTodoId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_slug: slug }),
        });
        const linkData = await readApiJson(linkRes);
        if (!linkRes.ok) throw new Error(linkData.error || `HTTP ${linkRes.status}`);
      } catch (e) {
        alert(`Project created, but could not link to-do: ${e.message}`);
      }
      workState.returnToTodoId = null;
      workState.activeSlug = null;
      workState.draft = null;
      getWorkEditor()?.classList.remove('de-pane-active');
      navigateToTodo(returnTodoId, { fromWorkSlug: slug });
      return;
    }
    workState.activeSlug = slug;
    renderWorkEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveWork(slug, payload) {
  if (!payload.title) { alert('Title is required.'); return; }
  if (!payload.contact_uid) { alert('Select a client.'); return; }
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.dirty = false;
    await loadWorkTab();
    workState.activeSlug = slug;
    renderWorkEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function deleteWork(slug) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.activeSlug = null;
    workState.dirty = false;
    workState.draft = null;
    await loadWorkTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

// ---- schedule tab ----

let scheduleState = {
  bookings: [],
  view: 'month',
  focusDate: null,
  selectedDate: null,
  selectedSlot: null,
  activeUid: null,
  meta: {
    bookingFormUrl: '/form/schedule',
    publicBookingUrl: null,
    calcomAdminUrl: null,
  },
  loading: false,
  error: '',
};

const SCHEDULE_VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

const CAL_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAL_HOUR_PX = 48;
const CAL_HOURS = 24;

function getSchedulePanel() { return document.getElementById('schedule-panel'); }

function scheduleDateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduleTodayKey() {
  return scheduleDateKey(new Date());
}

function scheduleParseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function scheduleAddDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function scheduleStartOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function scheduleBookingDateKey(iso) {
  if (!iso) return '';
  return scheduleDateKey(new Date(iso));
}

function scheduleBookingsForDay(key) {
  return scheduleState.bookings
    .filter((b) => scheduleBookingDateKey(b.startTime) === key)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function scheduleVisibleRange(view, focusKey) {
  const focus = scheduleParseDateKey(focusKey);
  if (view === 'month') {
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const gridStart = scheduleStartOfWeek(first);
    const gridEnd = scheduleAddDays(gridStart, 41);
    return { from: scheduleDateKey(gridStart), to: scheduleDateKey(gridEnd) };
  }
  if (view === 'week') {
    const ws = scheduleStartOfWeek(focus);
    const we = scheduleAddDays(ws, 6);
    return { from: scheduleDateKey(ws), to: scheduleDateKey(we) };
  }
  return { from: focusKey, to: focusKey };
}

function scheduleEnsureFocusDate() {
  if (!scheduleState.focusDate) scheduleState.focusDate = scheduleTodayKey();
  if (!scheduleState.selectedDate) scheduleState.selectedDate = scheduleState.focusDate;
}

function scheduleToolbarTitle(view, focusKey) {
  const d = scheduleParseDateKey(focusKey);
  if (view === 'month') {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (view === 'week') {
    const start = scheduleStartOfWeek(d);
    const end = scheduleAddDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const startFmt = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const endFmt = end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : 'short',
      day: 'numeric',
      year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
    });
    return `${startFmt} – ${endFmt}`;
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function scheduleDateInSameMonth(dateKey, focusKey) {
  const d = scheduleParseDateKey(dateKey);
  const f = scheduleParseDateKey(focusKey);
  return d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth();
}

/** Day to show in month-view agenda: explicit selection in this month, else today if visible. */
function scheduleMonthDisplayDate(focusKey) {
  if (
    scheduleState.selectedDate &&
    scheduleDateInSameMonth(scheduleState.selectedDate, focusKey)
  ) {
    return scheduleState.selectedDate;
  }
  const today = scheduleTodayKey();
  if (scheduleDateInSameMonth(today, focusKey)) return today;
  return null;
}

function scheduleShiftFocus(delta) {
  scheduleEnsureFocusDate();
  const d = scheduleParseDateKey(scheduleState.focusDate);
  if (scheduleState.view === 'month') {
    d.setMonth(d.getMonth() + delta);
  } else if (scheduleState.view === 'week') {
    d.setDate(d.getDate() + delta * 7);
  } else {
    d.setDate(d.getDate() + delta);
  }
  scheduleState.focusDate = scheduleDateKey(d);
  if (scheduleState.view !== 'month') {
    scheduleState.selectedDate = scheduleState.focusDate;
  }
  loadScheduleTab();
}

function openScheduleTab(opts = {}) {
  if (opts.uid) scheduleState.activeUid = opts.uid;
  if (opts.view) scheduleState.view = opts.view;
  if (opts.date) {
    scheduleState.focusDate = opts.date;
    scheduleState.selectedDate = opts.date;
  }
  setActiveMap('schedule', { force: true, scheduleUid: opts.uid || null });
}

function formatScheduleWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatScheduleListWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatScheduleRange(startIso, endIso) {
  if (!startIso) return '';
  try {
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : null;
    const datePart = start.toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const timeFmt = { hour: 'numeric', minute: '2-digit' };
    const startTime = start.toLocaleTimeString(undefined, timeFmt);
    const endTime = end ? end.toLocaleTimeString(undefined, timeFmt) : '';
    return endTime ? `${datePart} · ${startTime} – ${endTime}` : `${datePart} · ${startTime}`;
  } catch {
    return formatScheduleWhen(startIso);
  }
}

function scheduleStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'accepted') return 'sched-status-accepted';
  if (s === 'cancelled' || s === 'rejected') return 'sched-status-cancelled';
  if (s === 'pending') return 'sched-status-pending';
  return '';
}

function scheduleBookingWho(b) {
  return b.attendee && b.attendee !== 'Unknown' ? b.attendee : b.email || 'Guest';
}

function findScheduleBooking(uid) {
  return scheduleState.bookings.find((b) => b.uid === uid) || null;
}

async function loadScheduleTab() {
  const root = getSchedulePanel();
  if (!root) return;
  scheduleEnsureFocusDate();
  scheduleState.loading = true;
  scheduleState.error = '';
  renderSchedulePanel();

  try {
    const range = scheduleVisibleRange(scheduleState.view, scheduleState.focusDate);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    const res = await adminFetch(`/api/bookings?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    scheduleState.bookings = Array.isArray(data.bookings) ? data.bookings : [];
    if (data.meta && typeof data.meta === 'object') {
      scheduleState.meta = { ...scheduleState.meta, ...data.meta };
    }
    if (
      scheduleState.activeUid &&
      !findScheduleBooking(scheduleState.activeUid)
    ) {
      const oneRes = await adminFetch(
        `/api/bookings/${encodeURIComponent(scheduleState.activeUid)}`,
      );
      const oneData = await oneRes.json();
      if (oneRes.ok && oneData.booking) {
        scheduleState.bookings = [oneData.booking, ...scheduleState.bookings];
        scheduleState.selectedDate = scheduleBookingDateKey(oneData.booking.startTime);
        scheduleState.focusDate = scheduleState.selectedDate;
      }
    }
  } catch (e) {
    scheduleState.error = e.message || String(e);
    scheduleState.bookings = [];
  } finally {
    scheduleState.loading = false;
    renderSchedulePanel();
  }
}

function selectScheduleBooking(uid) {
  scheduleState.activeUid = uid;
  scheduleState.selectedSlot = null;
  getSchedulePanel()?.classList.add('de-pane-active');
  renderSchedulePanel();
  syncFooterNav();
}

function closeScheduleDetail() {
  scheduleState.activeUid = null;
  getSchedulePanel()?.classList.remove('de-pane-active');
  renderSchedulePanel();
  syncFooterNav();
}

async function cancelScheduleBooking(uid) {
  const res = await fetch(`/api/bookings/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancellationReason: 'Cancelled by user' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await osAlert({ title: 'Could not cancel', bodyHtml: escHtml(data.error || `HTTP ${res.status}`) });
    return;
  }
  scheduleState.activeUid = null;
  getSchedulePanel()?.classList.remove('de-pane-active');
  await loadScheduleTab();
  syncFooterNav();
}

function scheduleStartFromParts(dateKey, hour = 9, minute = 0) {
  const d = scheduleParseDateKey(dateKey);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function scheduleSnapMinute(minute) {
  return Math.min(45, Math.max(0, Math.round(minute / 15) * 15));
}

function scheduleTimeFromClickY(clientY, colTop) {
  const y = Math.max(0, clientY - colTop);
  const totalMin = (y / (CAL_HOURS * CAL_HOUR_PX)) * CAL_HOURS * 60;
  const hour = Math.min(CAL_HOURS - 1, Math.floor(totalMin / 60));
  const minute = scheduleSnapMinute(totalMin % 60);
  return { hour, minute };
}

function scheduleDateInputValue(dateKey) {
  return dateKey;
}

function scheduleTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

async function submitScheduleCreate(payload) {
  const res = await adminFetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    if (data.check) err.check = data.check;
    throw err;
  }
  return data;
}

let schedGuestSearchTimer = null;
let schedAddressSearchTimer = null;
const SCHED_LAST_ADDRESS_KEY = 'sched:lastAddress';

function readScheduleLastAddress() {
  try {
    return localStorage.getItem(SCHED_LAST_ADDRESS_KEY) || '';
  } catch {
    return '';
  }
}

function rememberScheduleAddress(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(SCHED_LAST_ADDRESS_KEY, trimmed);
  } catch {
    /* ignore quota / private mode */
  }
}

function isScheduleAddressError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('address') &&
    (m.includes('geocod') || m.includes('required') || m.includes('missing'))
  );
}

/** Collect a geocodable street address before creating a booking. */
function ensureScheduleAddress({ initial = '', forcePrompt = false } = {}) {
  if (!forcePrompt) {
    const preset = String(initial || readScheduleLastAddress() || '').trim();
    if (preset) return Promise.resolve(preset);
  }

  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let destroyAddressAutocomplete = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      destroyAddressAutocomplete();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(null);
    };

    titleEl.textContent = 'Meeting address';
    bodyEl.innerHTML =
      '<p class="em-book-dialog-lead">Enter the job site or meeting location so the booking can be placed on the map.</p>' +
      '<label class="de-label sched-create-field em-book-address-field">' +
        '<span>Street address</span>' +
        '<div class="control-field">' +
          '<input id="em-book-address" type="text" autocomplete="street-address" autocapitalize="words" placeholder="123 Main St, City, MA 02134" required>' +
        '</div>' +
      '</label>';
    actionsEl.innerHTML = '';
    const addressInput = bodyEl.querySelector('#em-book-address');

    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish(null));
    mkBtn('Continue', 'os-dialog-btn--primary', () => {
      const address = addressInput?.value.trim() || '';
      if (!address) {
        addressInput?.focus();
        return;
      }
      finish(address);
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(null), true);
    document.addEventListener('keydown', onKey);
    destroyAddressAutocomplete = mountScheduleAddressAutocomplete(addressInput);
    addressInput?.focus();
  });
}

function formatScheduleAddressLabel(text) {
  return String(text || '').replace(/, USA$/i, '').trim();
}

function mountScheduleAddressAutocomplete(addressInput) {
  const portal = document.getElementById('os-dialog-backdrop');
  return mountAddressAutocomplete(addressInput, portal);
}

// Shared arrow-key navigation for autosuggest dropdowns. The active option is
// tracked purely via the `.active` class in the DOM so it self-heals when the
// dropdown re-renders on each new search.
function attachAutosuggestKeyboardNav(input, dropdown, options = {}) {
  if (!input || !dropdown) return () => {};
  const optionSelector = options.optionSelector || 'button';
  const onClose = typeof options.onClose === 'function' ? options.onClose : null;

  function isOpen() {
    return dropdown.style.display !== 'none' && dropdown.offsetParent !== null;
  }
  function getOptions() {
    return [...dropdown.querySelectorAll(optionSelector)].filter(
      (el) => !el.disabled && el.offsetParent !== null,
    );
  }
  function setActive(opts, idx) {
    opts.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0) opts[idx]?.scrollIntoView({ block: 'nearest' });
  }
  const onKeyDown = (ev) => {
    if (!isOpen()) return;
    const opts = getOptions();
    if (!opts.length) return;
    const currentIdx = opts.findIndex((el) => el.classList.contains('active'));
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive(opts, currentIdx < 0 ? 0 : (currentIdx + 1) % opts.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive(opts, currentIdx <= 0 ? opts.length - 1 : currentIdx - 1);
    } else if (ev.key === 'Enter') {
      if (currentIdx >= 0) {
        ev.preventDefault();
        opts[currentIdx].click();
      }
    } else if (ev.key === 'Escape') {
      if (onClose) {
        ev.preventDefault();
        onClose();
      }
    }
  };
  input.addEventListener('keydown', onKeyDown);
  return () => input.removeEventListener('keydown', onKeyDown);
}

function mountAddressAutocomplete(addressInput, dropdownPortal, onPick) {
  if (!dropdownPortal || !addressInput) return () => {};

  const dropdown = document.createElement('div');
  dropdown.className = 'sched-guest-dropdown';
  dropdown.style.display = 'none';
  dropdownPortal.appendChild(dropdown);

  let repositionHandler = null;

  function positionDropdown() {
    const rect = addressInput.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.width = `${rect.width}px`;
  }

  function setDropdownOpen(open) {
    if (open) {
      positionDropdown();
      dropdown.style.display = 'block';
      addressInput.setAttribute('aria-expanded', 'true');
      if (!repositionHandler) {
        repositionHandler = () => positionDropdown();
        window.addEventListener('resize', repositionHandler);
        window.addEventListener('scroll', repositionHandler, true);
        window.visualViewport?.addEventListener('resize', repositionHandler);
        window.visualViewport?.addEventListener('scroll', repositionHandler);
      }
      return;
    }
    dropdown.style.display = 'none';
    addressInput.setAttribute('aria-expanded', 'false');
    if (repositionHandler) {
      window.removeEventListener('resize', repositionHandler);
      window.removeEventListener('scroll', repositionHandler, true);
      window.visualViewport?.removeEventListener('resize', repositionHandler);
      window.visualViewport?.removeEventListener('scroll', repositionHandler);
      repositionHandler = null;
    }
  }

  function pick(description) {
    addressInput.value = formatScheduleAddressLabel(description);
    setDropdownOpen(false);
    if (typeof onPick === 'function') void onPick(addressInput.value);
  }

  function renderDropdown(predictions, query) {
    dropdown.innerHTML = '';
    if (!predictions.length) {
      const empty = document.createElement('div');
      empty.className = 'sched-guest-empty';
      empty.textContent = query.trim() ? 'No matching addresses.' : 'Type to search addresses.';
      dropdown.appendChild(empty);
      setDropdownOpen(true);
      return;
    }
    for (const p of predictions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sched-guest-option';
      btn.textContent = formatScheduleAddressLabel(p.description);
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => pick(p.description));
      dropdown.appendChild(btn);
    }
    setDropdownOpen(true);
  }

  async function runSearch() {
    const q = addressInput.value.trim();
    if (q.length < 2) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    try {
      const params = new URLSearchParams({ input: q, types: 'address' });
      const res = await adminFetch(`/api/google/places-autocomplete?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.errorMessage || `HTTP ${res.status}`);
      renderDropdown(data.predictions || [], q);
    } catch (e) {
      if (e.message === 'Session expired') return;
      dropdown.innerHTML = `<div class="sched-guest-empty">${escHtml(e.message)}</div>`;
      setDropdownOpen(true);
    }
  }

  function scheduleSearch() {
    clearTimeout(schedAddressSearchTimer);
    const q = addressInput.value.trim();
    if (!q) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    schedAddressSearchTimer = setTimeout(runSearch, 300);
  }

  const onInput = () => scheduleSearch();
  const onBlur = () => {
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) setDropdownOpen(false);
    }, 150);
  };

  addressInput.autocomplete = 'off';
  addressInput.setAttribute('role', 'combobox');
  addressInput.setAttribute('aria-autocomplete', 'list');
  addressInput.setAttribute('aria-expanded', 'false');
  addressInput.addEventListener('input', onInput);
  addressInput.addEventListener('blur', onBlur);
  const detachKeyNav = attachAutosuggestKeyboardNav(addressInput, dropdown, {
    optionSelector: '.sched-guest-option',
    onClose: () => setDropdownOpen(false),
  });

  return () => {
    clearTimeout(schedAddressSearchTimer);
    addressInput.removeEventListener('input', onInput);
    addressInput.removeEventListener('blur', onBlur);
    detachKeyNav();
    setDropdownOpen(false);
    dropdown.remove();
  };
}

function mountScheduleGuestAutocomplete(nameInput, emailInput) {
  const portal = document.getElementById('os-dialog-backdrop');
  if (!portal || !nameInput) return () => {};

  const dropdown = document.createElement('div');
  dropdown.className = 'sched-guest-dropdown';
  dropdown.style.display = 'none';
  portal.appendChild(dropdown);

  let repositionHandler = null;

  function positionDropdown() {
    const rect = nameInput.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.width = `${rect.width}px`;
  }

  function setDropdownOpen(open) {
    if (open) {
      positionDropdown();
      dropdown.style.display = 'block';
      nameInput.setAttribute('aria-expanded', 'true');
      if (!repositionHandler) {
        repositionHandler = () => positionDropdown();
        window.addEventListener('resize', repositionHandler);
        window.addEventListener('scroll', repositionHandler, true);
        window.visualViewport?.addEventListener('resize', repositionHandler);
        window.visualViewport?.addEventListener('scroll', repositionHandler);
      }
      return;
    }
    dropdown.style.display = 'none';
    nameInput.setAttribute('aria-expanded', 'false');
    if (repositionHandler) {
      window.removeEventListener('resize', repositionHandler);
      window.removeEventListener('scroll', repositionHandler, true);
      window.visualViewport?.removeEventListener('resize', repositionHandler);
      window.visualViewport?.removeEventListener('scroll', repositionHandler);
      repositionHandler = null;
    }
  }

  function pick(client) {
    nameInput.value = client.name || '';
    if (emailInput && client.email) emailInput.value = client.email;
    setDropdownOpen(false);
  }

  function renderDropdown(clients, query) {
    dropdown.innerHTML = '';
    if (!clients.length) {
      const empty = document.createElement('div');
      empty.className = 'sched-guest-empty';
      empty.textContent = query.trim() ? 'No matching clients.' : 'No clients yet.';
      dropdown.appendChild(empty);
      setDropdownOpen(true);
      return;
    }
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sched-guest-option';
      btn.innerHTML =
        `${escHtml(c.name || 'Client')}` +
        `<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
    setDropdownOpen(true);
  }

  async function runSearch() {
    const q = nameInput.value.trim();
    if (!q) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    try {
      const params = new URLSearchParams({ q, limit: '20' });
      const res = await adminFetch(`/api/clients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderDropdown(data.clients || [], q);
    } catch (e) {
      if (e.message === 'Session expired') return;
      dropdown.innerHTML = `<div class="sched-guest-empty">${escHtml(e.message)}</div>`;
      setDropdownOpen(true);
    }
  }

  function scheduleSearch() {
    clearTimeout(schedGuestSearchTimer);
    const q = nameInput.value.trim();
    if (!q) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    schedGuestSearchTimer = setTimeout(runSearch, 250);
  }

  const onInput = () => scheduleSearch();
  const onBlur = () => {
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) setDropdownOpen(false);
    }, 150);
  };

  nameInput.autocomplete = 'off';
  nameInput.setAttribute('role', 'combobox');
  nameInput.setAttribute('aria-autocomplete', 'list');
  nameInput.setAttribute('aria-expanded', 'false');
  nameInput.addEventListener('input', onInput);
  nameInput.addEventListener('blur', onBlur);
  const detachKeyNav = attachAutosuggestKeyboardNav(nameInput, dropdown, {
    optionSelector: '.sched-guest-option',
    onClose: () => setDropdownOpen(false),
  });

  return () => {
    clearTimeout(schedGuestSearchTimer);
    nameInput.removeEventListener('input', onInput);
    nameInput.removeEventListener('blur', onBlur);
    detachKeyNav();
    setDropdownOpen(false);
    dropdown.remove();
  };
}

function scheduleOpenCreateDialog() {
  scheduleEnsureFocusDate();
  const dateKey = scheduleState.selectedDate || scheduleState.focusDate;
  const slot = scheduleState.selectedSlot;
  const useSlot = slot && slot.dateKey === dateKey;
  void openScheduleCreateDialog({
    dateKey,
    hour: useSlot ? slot.hour : 9,
    minute: useSlot ? slot.minute : 0,
  });
}

function openScheduleCreateDialog(initial = {}) {
  const dateKey = initial.dateKey || scheduleState.selectedDate || scheduleTodayKey();
  const startDate = scheduleStartFromParts(
    dateKey,
    initial.hour ?? 9,
    initial.minute ?? 0,
  );

  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let destroyGuestAutocomplete = () => {};
    let destroyAddressAutocomplete = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      destroyGuestAutocomplete();
      destroyAddressAutocomplete();
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (evKey) => {
      if (evKey.key === 'Escape') finish(false);
    };

    titleEl.textContent = 'New event';
    bodyEl.innerHTML =
      `<form class="sched-create-form" id="sched-create-form">` +
        `<label class="de-label sched-create-field">` +
          `<span>Guest name</span>` +
          `<div class="control-field">` +
            `<input name="name" type="text" autocapitalize="words" enterkeyhint="next" required>` +
          `</div>` +
        `</label>` +
        `<label class="de-label sched-create-field">` +
          `<span>Email</span>` +
          `<div class="control-field">` +
            `<input name="email" type="email" autocomplete="email" autocapitalize="none" enterkeyhint="next" required>` +
          `</div>` +
        `</label>` +
        `<div class="sched-create-row">` +
          `<label class="de-label sched-create-field">` +
            `<span>Date</span>` +
            `<div class="control-field">` +
              `<input name="date" type="date" required>` +
            `</div>` +
          `</label>` +
          `<label class="de-label sched-create-field">` +
            `<span>Time</span>` +
            `<div class="control-field">` +
              `<input name="time" type="time" required>` +
            `</div>` +
          `</label>` +
        `</div>` +
        `<label class="de-label sched-create-field">` +
          `<span>Address</span>` +
          `<div class="control-field">` +
            `<input name="address" type="text" autocomplete="street-address" autocapitalize="words" enterkeyhint="next" placeholder="123 Main St, City, MA 02134">` +
          `</div>` +
        `</label>` +
        `<label class="de-label sched-create-field">` +
          `<span>Notes</span>` +
          `<div class="control-field">` +
            `<textarea name="notes" rows="2" enterkeyhint="done"></textarea>` +
          `</div>` +
        `</label>` +
        `<p class="sched-create-hint">Creates a Cal.com booking if the time does not conflict. Address is required unless BOOKING_DEFAULT_ADDRESS is configured.</p>` +
        `<p class="sched-create-error" id="sched-create-error" hidden></p>` +
        `<div class="em-book-alt-slots" id="sched-create-alts" hidden></div>` +
      `</form>`;
    actionsEl.innerHTML = '';

    const form = bodyEl.querySelector('#sched-create-form');
    const errEl = bodyEl.querySelector('#sched-create-error');
    const altsEl = bodyEl.querySelector('#sched-create-alts');
    const nameInput = form.querySelector('[name="name"]');
    const emailInput = form.querySelector('[name="email"]');
    const dateInput = form.querySelector('[name="date"]');
    const timeInput = form.querySelector('[name="time"]');
    const addressInput = form.querySelector('[name="address"]');
    dateInput.value = scheduleDateInputValue(dateKey);
    timeInput.value = scheduleTimeInputValue(startDate);
    if (addressInput) {
      addressInput.value = initial.address || readScheduleLastAddress();
    }
    if (initial.name) nameInput.value = String(initial.name);
    if (initial.email) emailInput.value = String(initial.email);
    if (initial.notes) {
      const notesInput = form.querySelector('[name="notes"]');
      if (notesInput) notesInput.value = String(initial.notes);
    }
    destroyGuestAutocomplete = mountScheduleGuestAutocomplete(nameInput, emailInput);
    if (addressInput) {
      destroyAddressAutocomplete = mountScheduleAddressAutocomplete(addressInput);
    }

    function readStartIso() {
      const [y, m, d] = dateInput.value.split('-').map(Number);
      const [hh, mm] = timeInput.value.split(':').map(Number);
      const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
      return dt.toISOString();
    }

    function showConflict(check) {
      if (!check) return;
      errEl.hidden = false;
      errEl.textContent = check.conflictReason || 'That time is not available.';
      if (check.alternatives?.length && altsEl) {
        altsEl.hidden = false;
        altsEl.innerHTML = '<p class="em-book-alt-label">Open slots nearby:</p>';
        for (const slot of check.alternatives) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'em-book-alt-slot';
          btn.textContent = slot.label || formatScheduleWhen(slot.iso);
          btn.addEventListener('click', () => {
            const slotDate = new Date(slot.iso);
            dateInput.value = scheduleDateInputValue(scheduleDateKey(slotDate));
            timeInput.value = scheduleTimeInputValue(slotDate);
            errEl.hidden = true;
            altsEl.hidden = true;
            altsEl.innerHTML = '';
          });
          altsEl.appendChild(btn);
        }
      }
    }

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

    const saveBtn = mkBtn('Add event', 'os-dialog-btn--primary', async () => {
      if (!form.reportValidity()) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      errEl.hidden = true;
      if (altsEl) {
        altsEl.hidden = true;
        altsEl.innerHTML = '';
      }
      try {
        const address = form.address.value.trim();
        const data = await submitScheduleCreate({
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          start: readStartIso(),
          ...(address ? { address } : {}),
          notes: form.notes.value.trim(),
        });
        if (address) rememberScheduleAddress(address);
        finish(true);
        scheduleState.selectedDate = scheduleBookingDateKey(data.booking?.startTime);
        scheduleState.focusDate = scheduleState.selectedDate;
        if (data.booking?.uid) scheduleState.activeUid = data.booking.uid;
        await loadScheduleTab();
        await osAlert({
          title: 'Event scheduled',
          bodyHtml: `<p>Booked for <strong>${escHtml(formatScheduleWhen(data.booking?.startTime))}</strong>.</p>`,
        });
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add event';
        if (err.check) {
          showConflict(err.check);
        } else {
          errEl.hidden = false;
          errEl.textContent = err.message || String(err);
        }
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    scheduleOsDialogFieldFocus(nameInput);
  });
}

function scheduleShareBookingUrl(booking) {
  const calBase = scheduleState.meta.calcomAdminUrl?.replace(/\/+$/, '');
  if (booking?.uid && calBase) {
    return `${calBase}/booking/${encodeURIComponent(booking.uid)}`;
  }
  const formUrl = scheduleState.meta.bookingFormUrl || '/form/schedule';
  const url = scheduleState.meta.publicBookingUrl || formUrl;
  if (url.startsWith('http')) return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function renderScheduleDetail(pane, booking) {
  pane.innerHTML = '';
  const who = scheduleBookingWho(booking);
  const statusNorm = String(booking.status || '').toLowerCase();
  const icons = [
    paneShareIcon({
      label: 'Share with guest',
      onClick: () =>
        openReaveShareSheet({
          kind: 'booking',
          recipient: { name: who, email: booking.email || undefined },
          booking: {
            uid: booking.uid,
            title: booking.title,
            startTime: booking.startTime,
            endTime: booking.endTime,
            location: booking.location,
            description: booking.description,
          },
          url: scheduleShareBookingUrl(booking),
          shareTitle: booking.title || 'Meeting',
        }),
    }),
  ];
  if (statusNorm === 'accepted' || statusNorm === 'pending') {
    icons.push(
      paneDeleteIcon({
        label: 'Cancel booking',
        onClick: () => cancelScheduleBooking(booking.uid),
      }),
    );
  }

  pane.appendChild(
    createPaneSubheader({
      back: {
        label: 'Back to schedule',
        onClick: () => closeScheduleDetail(),
      },
      title: booking.title || 'Meeting',
      icons,
    }).header,
  );

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll schedule-detail-scroll';

  const when = document.createElement('p');
  when.className = 'schedule-detail-when';
  when.textContent = formatScheduleRange(booking.startTime, booking.endTime);
  scroll.appendChild(when);

  if (booking.status) {
    const status = document.createElement('span');
    status.className = `schedule-status ${scheduleStatusClass(booking.status)}`;
    status.textContent = booking.status;
    scroll.appendChild(status);
  }

  const fields = document.createElement('dl');
  fields.className = 'schedule-detail-fields';
  const addField = (label, value, href) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = value;
      a.className = 'schedule-detail-link';
      if (href.startsWith('mailto:') || href.startsWith('http')) {
        a.target = href.startsWith('http') ? '_blank' : '';
        a.rel = 'noopener';
      }
      dd.appendChild(a);
    } else {
      dd.textContent = value;
    }
    fields.appendChild(dt);
    fields.appendChild(dd);
  };
  addField('Guest', who);
  addField('Email', booking.email, booking.email ? `mailto:${booking.email}` : null);
  addField('Location', booking.location);
  if (booking.description?.trim()) addField('Notes', booking.description.trim());
  scroll.appendChild(fields);

  const actions = document.createElement('div');
  actions.className = 'de-actions schedule-detail-actions';
  if (scheduleState.meta.calcomAdminUrl) {
    const calLink = document.createElement('a');
    calLink.className = 'de-btn de-btn-ghost schedule-cal-link';
    calLink.href = `${scheduleState.meta.calcomAdminUrl.replace(/\/+$/, '')}/bookings/${booking.uid}`;
    calLink.target = '_blank';
    calLink.rel = 'noopener';
    calLink.textContent = 'Cal.com admin';
    actions.appendChild(calLink);
  }
  scroll.appendChild(actions);
  pane.appendChild(scroll);
}

function renderScheduleViewPicker() {
  const picker = createSlidingPillSelect({
    value: scheduleState.view,
    options: SCHEDULE_VIEWS,
    ariaLabel: 'Calendar view',
    className: 'cal-view-pill',
    onChange: (next) => {
      if (scheduleState.view === next) return;
      scheduleState.view = next;
      scheduleEnsureFocusDate();
      loadScheduleTab();
    },
  });
  return picker.el;
}

function renderScheduleToolbar() {
  scheduleEnsureFocusDate();
  const bar = document.createElement('div');
  bar.className = 'cal-toolbar';

  const nav = document.createElement('div');
  nav.className = 'cal-toolbar-nav';

  const prevBtn = createIosIconBtn({
    iconKey: 'chevron-left',
    label: 'Previous',
    onClick: () => scheduleShiftFocus(-1),
  });
  nav.appendChild(prevBtn);

  const title = document.createElement('h2');
  title.className = 'cal-toolbar-title';
  title.textContent = scheduleToolbarTitle(scheduleState.view, scheduleState.focusDate);
  nav.appendChild(title);

  const nextBtn = createIosIconBtn({
    iconKey: 'chevron-right',
    label: 'Next',
    onClick: () => scheduleShiftFocus(1),
  });
  nav.appendChild(nextBtn);

  bar.appendChild(nav);

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'cal-toolbar-today';
  todayBtn.textContent = 'Today';
  todayBtn.addEventListener('click', () => {
    scheduleState.focusDate = scheduleTodayKey();
    scheduleState.selectedDate = scheduleState.focusDate;
    scheduleState.selectedSlot = null;
    loadScheduleTab();
  });
  bar.appendChild(todayBtn);

  return bar;
}

function formatScheduleAgendaTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function createCalAgendaItem(booking) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'cal-agenda-item' +
    (scheduleBookingIsPast(booking) ? ' cal-agenda-item--past' : '') +
    (booking.uid === scheduleState.activeUid ? ' active' : '');
  const who = scheduleBookingWho(booking);
  item.innerHTML =
    `<span class="cal-agenda-time">${escHtml(formatScheduleAgendaTime(booking.startTime))}</span>` +
    `<span class="cal-agenda-main">` +
      `<span class="cal-agenda-title">${escHtml(booking.title || 'Meeting')}</span>` +
      `<span class="cal-agenda-sub">${escHtml(who)}</span>` +
    `</span>`;
  item.addEventListener('click', () => selectScheduleBooking(booking.uid));
  return item;
}

function renderCalDayAgenda(parent, dayKey, opts = {}) {
  const { showDayViewAction = false } = opts;
  const bookings = scheduleBookingsForDay(dayKey);

  const wrap = document.createElement('div');
  wrap.className = 'cal-day-agenda';

  const header = document.createElement('div');
  header.className = 'cal-day-agenda-header';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'cal-day-agenda-date';
  dateLabel.textContent = scheduleParseDateKey(dayKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  header.appendChild(dateLabel);

  if (showDayViewAction) {
    const dayBtn = document.createElement('button');
    dayBtn.type = 'button';
    dayBtn.className = 'cal-day-agenda-action';
    dayBtn.textContent = 'Day view';
    dayBtn.addEventListener('click', () => {
      scheduleState.focusDate = dayKey;
      scheduleState.selectedDate = dayKey;
      scheduleState.view = 'day';
      loadScheduleTab();
    });
    header.appendChild(dayBtn);
  }
  wrap.appendChild(header);

  if (!bookings.length) {
    const empty = document.createElement('p');
    empty.className = 'cal-day-agenda-empty';
    empty.textContent = 'No events scheduled for this day.';
    wrap.appendChild(empty);
  } else {
    for (const booking of bookings) {
      wrap.appendChild(createCalAgendaItem(booking));
    }
  }
  parent.appendChild(wrap);
}

function renderCalMonthView(parent) {
  const focus = scheduleParseDateKey(scheduleState.focusDate);
  const month = focus.getMonth();
  const year = focus.getFullYear();
  const first = new Date(year, month, 1);
  const gridStart = scheduleStartOfWeek(first);

  const weekdays = document.createElement('div');
  weekdays.className = 'cal-weekdays';
  for (const label of CAL_WEEKDAYS) {
    const span = document.createElement('span');
    span.textContent = label;
    weekdays.appendChild(span);
  }
  parent.appendChild(weekdays);

  const grid = document.createElement('div');
  grid.className = 'cal-month-grid';
  const today = scheduleTodayKey();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = 0; i < 42; i++) {
    const dayDate = scheduleAddDays(gridStart, i);
    const key = scheduleDateKey(dayDate);
    const dayBookings = scheduleBookingsForDay(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    if (dayDate.getMonth() !== month) btn.classList.add('cal-day--other');
    const isToday = dayDate.getFullYear() === now.getFullYear() && 
                     dayDate.getMonth() === now.getMonth() && 
                     dayDate.getDate() === now.getDate();
    if (isToday) btn.classList.add('cal-day--today');
    if (
      key === scheduleState.selectedDate &&
      scheduleDateInSameMonth(key, scheduleState.focusDate)
    ) {
      btn.classList.add('cal-day--selected');
    }

    const num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = String(dayDate.getDate());
    btn.appendChild(num);

    if (dayBookings.length) {
      const dots = document.createElement('span');
      dots.className = 'cal-day-dots';
      const maxDots = Math.min(dayBookings.length, 3);
      for (let d = 0; d < maxDots; d++) {
        const dot = document.createElement('span');
        dot.className = 'cal-day-dot';
        dots.appendChild(dot);
      }
      btn.appendChild(dots);
    }

    btn.addEventListener('click', () => {
      scheduleState.selectedDate = key;
      scheduleState.selectedSlot = null;
      scheduleState.activeUid = null;
      getSchedulePanel()?.classList.remove('de-pane-active');
      renderSchedulePanel();
    });
    btn.addEventListener('dblclick', () => {
      scheduleState.selectedDate = key;
      scheduleState.focusDate = key;
      scheduleState.selectedSlot = null;
      scheduleState.view = 'day';
      loadScheduleTab();
    });
    grid.appendChild(btn);
  }
  parent.appendChild(grid);

  // Add swipe gesture support for navigating between months
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  
  const handleSwipeGesture = () => {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const minSwipeDistance = 50;
    
    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
      if (diffX > 0) {
        // Swipe right - go to previous month
        scheduleShiftFocus(-1);
      } else {
        // Swipe left - go to next month
        scheduleShiftFocus(1);
      }
    }
  };
  
  grid.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  
  grid.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
  }, { passive: true });

  const displayDate = scheduleMonthDisplayDate(scheduleState.focusDate);
  if (displayDate) {
    renderCalDayAgenda(parent, displayDate, { showDayViewAction: true });
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'cal-day-agenda';
    const empty = document.createElement('p');
    empty.className = 'cal-day-agenda-empty';
    empty.textContent = 'Select a day to view events.';
    wrap.appendChild(empty);
    parent.appendChild(wrap);
  }
}

function scheduleBookingEndTime(booking) {
  const start = new Date(booking.startTime);
  return booking.endTime ? new Date(booking.endTime) : new Date(start.getTime() + 30 * 60 * 1000);
}

function scheduleBookingIsPast(booking) {
  try {
    return scheduleBookingEndTime(booking).getTime() <= Date.now();
  } catch {
    return false;
  }
}

function scheduleEventLayout(booking) {
  const start = new Date(booking.startTime);
  const end = scheduleBookingEndTime(booking);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const top = (startMin / (CAL_HOURS * 60)) * (CAL_HOURS * CAL_HOUR_PX);
  const height = Math.max(((endMin - startMin) / (CAL_HOURS * 60)) * (CAL_HOURS * CAL_HOUR_PX), 22);
  return { top, height };
}

function renderCalTimeGrid(parent, dayKeys, opts = {}) {
  const { singleDay = false } = opts;
  const totalHeight = CAL_HOURS * CAL_HOUR_PX;

  if (!singleDay) {
    const header = document.createElement('div');
    header.className = 'cal-week-header';
    const today = scheduleTodayKey();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const key of dayKeys) {
      const d = scheduleParseDateKey(key);
      const col = document.createElement('button');
      col.type = 'button';
      col.className = 'cal-week-header-col';
      const isToday = d.getFullYear() === now.getFullYear() && 
                       d.getMonth() === now.getMonth() && 
                       d.getDate() === now.getDate();
      if (isToday) col.classList.add('cal-week-header-col--today');
      if (key === scheduleState.selectedDate) col.classList.add('cal-week-header-col--selected');
      col.innerHTML =
        `<span class="cal-week-header-dow">${escHtml(d.toLocaleDateString(undefined, { weekday: 'short' }))}</span>` +
        `<span class="cal-week-header-daynum">${d.getDate()}</span>`;
      col.addEventListener('click', () => {
        scheduleState.selectedDate = key;
        scheduleState.focusDate = key;
        scheduleState.view = 'day';
        loadScheduleTab();
      });
      header.appendChild(col);
    }
    parent.appendChild(header);
  } else {
    const sub = document.createElement('div');
    sub.className = 'cal-day-view-header';
    sub.textContent = scheduleParseDateKey(dayKeys[0]).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    parent.appendChild(sub);
  }

  const wrap = document.createElement('div');
  wrap.className = 'cal-time-grid-wrap';
  wrap.style.height = `${totalHeight}px`;

  const gutter = document.createElement('div');
  gutter.className = 'cal-time-gutter';
  for (let h = 0; h < CAL_HOURS; h++) {
    const label = document.createElement('span');
    label.className = 'cal-time-label';
    label.style.top = `${h * CAL_HOUR_PX}px`;
    if (h === 0) {
      label.textContent = '';
    } else {
      const dt = new Date();
      dt.setHours(h, 0, 0, 0);
      label.textContent = dt.toLocaleTimeString(undefined, { hour: 'numeric' });
    }
    gutter.appendChild(label);
  }
  wrap.appendChild(gutter);

  const cols = document.createElement('div');
  cols.className = 'cal-time-columns';

  for (const key of dayKeys) {
    const col = document.createElement('div');
    col.className = 'cal-time-col';
    for (let h = 0; h < CAL_HOURS; h++) {
      const line = document.createElement('div');
      line.className = 'cal-hour-line';
      line.style.top = `${h * CAL_HOUR_PX}px`;
      col.appendChild(line);
    }
    col.addEventListener('click', (e) => {
      if (e.target.closest('.cal-event-block')) return;
      const rect = col.getBoundingClientRect();
      const { hour, minute } = scheduleTimeFromClickY(e.clientY, rect.top);
      scheduleState.selectedDate = key;
      scheduleState.selectedSlot = { dateKey: key, hour, minute };
      scheduleState.activeUid = null;
      getSchedulePanel()?.classList.remove('de-pane-active');
      renderSchedulePanel();
    });
    if (
      scheduleState.selectedSlot?.dateKey === key &&
      !scheduleState.activeUid
    ) {
      const { hour, minute } = scheduleState.selectedSlot;
      const top = ((hour * 60 + minute) / (CAL_HOURS * 60)) * (CAL_HOURS * CAL_HOUR_PX);
      const marker = document.createElement('div');
      marker.className = 'cal-slot-marker';
      marker.style.top = `${top}px`;
      col.appendChild(marker);
    }
    for (const booking of scheduleBookingsForDay(key)) {
      const { top, height } = scheduleEventLayout(booking);
      const block = document.createElement('button');
      block.type = 'button';
      block.className =
        'cal-event-block' +
        (scheduleBookingIsPast(booking) ? ' cal-event-block--past' : '') +
        (booking.uid === scheduleState.activeUid ? ' active' : '');
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      block.innerHTML =
        `<span class="cal-event-block-title">${escHtml(booking.title || 'Meeting')}</span>` +
        `<span class="cal-event-block-time">${escHtml(formatScheduleAgendaTime(booking.startTime))}</span>`;
      block.addEventListener('click', (e) => {
        e.stopPropagation();
        selectScheduleBooking(booking.uid);
      });
      col.appendChild(block);
    }
    cols.appendChild(col);
  }

  wrap.appendChild(cols);
  parent.appendChild(wrap);

  if (singleDay) {
    renderCalDayAgenda(parent, dayKeys[0]);
  }
}

function renderCalWeekView(parent) {
  const focus = scheduleParseDateKey(scheduleState.focusDate);
  const start = scheduleStartOfWeek(focus);
  const dayKeys = [];
  for (let i = 0; i < 7; i++) {
    dayKeys.push(scheduleDateKey(scheduleAddDays(start, i)));
  }
  scheduleState.selectedDate = scheduleState.selectedDate || dayKeys[0];
  renderCalTimeGrid(parent, dayKeys);
}

function renderCalDayView(parent) {
  const key = scheduleState.focusDate || scheduleTodayKey();
  scheduleState.selectedDate = key;
  renderCalTimeGrid(parent, [key], { singleDay: true });
}

function renderScheduleCalendarBody(parent) {
  if (scheduleState.view === 'week') {
    renderCalWeekView(parent);
  } else if (scheduleState.view === 'day') {
    renderCalDayView(parent);
  } else {
    renderCalMonthView(parent);
  }
}

function renderSchedulePanel() {
  const root = getSchedulePanel();
  if (!root) return;
  scheduleEnsureFocusDate();
  root.classList.toggle('de-pane-active', Boolean(scheduleState.activeUid));
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar schedule-panel-scroll';

  sidebar.appendChild(renderScheduleToolbar());

  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'cal-view-picker';
  pickerWrap.appendChild(renderScheduleViewPicker());
  sidebar.appendChild(pickerWrap);

  const body = document.createElement('div');
  body.className = 'cal-body';

  if (scheduleState.loading) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'Loading calendar…';
    body.appendChild(empty);
  } else if (scheduleState.error) {
    const err = document.createElement('div');
    err.className = 'de-empty de-error';
    err.textContent = scheduleState.error;
    body.appendChild(err);
    const hint = document.createElement('div');
    hint.className = 'de-empty';
    hint.innerHTML = 'Enable <code>scheduling</code> in FEATURES and set BOOKING_API_URL on Railway.';
    body.appendChild(hint);
  } else {
    renderScheduleCalendarBody(body);
  }

  sidebar.appendChild(body);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane schedule-detail-pane';
  const active = scheduleState.activeUid ? findScheduleBooking(scheduleState.activeUid) : null;
  if (active) {
    renderScheduleDetail(pane, active);
  } else {
    appendEmptyDetailPane(pane, {
      mapKey: 'schedule',
      iconName: 'calendar',
      bodyHtml: '<p>Select an event to view guest details, or book a new time.</p>',
      btnLabel: 'New Meeting',
      onCreate: () => scheduleOpenCreateDialog(),
    });
  }
  root.appendChild(pane);
}

// ---- clients tab ----

let clientState = {
  clients: [],
  total: 0,
  search: '',
  activeUid: null,
  dirty: false,
  draft: null,
};
let clientSearchTimer = null;
let clientAutosaveTimer = null;
let clientFieldRegistry = [];
let clientMapController = null;
let clientPendingGeo = null;
let destroyClientAddressAutocomplete = null;

function destroyClientMap() {
  if (clientMapController) {
    clientMapController.destroy();
    clientMapController = null;
  }
}

function clearClientFieldRegistry() {
  clientFieldRegistry = [];
  destroyClientMap();
  if (destroyClientAddressAutocomplete) {
    destroyClientAddressAutocomplete();
    destroyClientAddressAutocomplete = null;
  }
  clientPendingGeo = null;
}

const CLIENT_FIELD_VALID = 'de-field-valid';
const CLIENT_FIELD_INVALID = 'de-field-invalid';

let clientActiveField = null;

function phoneDigits(value) {
  return (value || '').replace(/\D/g, '');
}

/** Display format for tel inputs — US/Canada (+1) by default. */
function formatPhoneInput(value) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  const us = (digits.startsWith('1') ? digits.slice(1) : digits).slice(0, 10);
  if (us.length < 4) return `+1 (${us}`;
  if (us.length < 7) return `+1 (${us.slice(0, 3)}) ${us.slice(3)}`;
  return `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}

/** Store phones as E.164 for SMS/API. */
function phoneToStorage(display) {
  const digits = phoneDigits(display);
  if (!digits) return '';
  const us = (digits.startsWith('1') && digits.length >= 11 ? digits.slice(1) : digits).slice(0, 10);
  if (us.length === 10) return `+1${us}`;
  return `+${digits}`;
}

function isValidClientEmail(value) {
  const v = (value || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidClientPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return true;
  return digits.length >= 10 && digits.length <= 15;
}

function setClientFieldValidationState(el, show, valid) {
  el.classList.remove(CLIENT_FIELD_VALID, CLIENT_FIELD_INVALID, FORM_FIELD_INVALID, FORM_FIELD_SAVED);
  if (!show) return;
  if (!valid) {
    el.classList.add(CLIENT_FIELD_INVALID, FORM_FIELD_INVALID);
  }
}

function registerClientField(el, validateFn) {
  let touched = false;

  const applyValidation = () => {
    if (!touched) {
      setClientFieldValidationState(el, false, true);
      return;
    }
    const valid = validateFn();
    const focused = document.activeElement === el;
    const show = !focused && !valid;
    setClientFieldValidationState(el, show, valid);
  };

  const ctrl = {
    el,
    touch() {
      touched = true;
      applyValidation();
    },
    refresh: applyValidation,
    reset() {
      touched = false;
      applyValidation();
    },
  };

  el.addEventListener('blur', () => {
    touched = true;
    applyValidation();
  });
  el.addEventListener('input', () => {
    if (document.activeElement !== el) return;
    touched = true;
    applyValidation();
  });
  el.addEventListener('focus', applyValidation);

  clientFieldRegistry.push(ctrl);
  return ctrl;
}

function refreshAllClientFields() {
  for (const f of clientFieldRegistry) f.refresh();
}

function attachPhoneFormatter(input) {
  input.type = 'tel';
  input.autocomplete = 'tel';
  input.placeholder = '+1 (555) 000-0000';
  input.addEventListener('input', () => {
    const formatted = formatPhoneInput(input.value);
    if (formatted !== input.value) {
      input.value = formatted;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

function getClientsEditor() { return document.getElementById('clients-editor'); }

function clientSubline(c) {
  return c.email || c.company || c.phone || c.uid.slice(0, 8) + '…';
}

async function fetchClientsList() {
  const params = new URLSearchParams();
  if (clientState.search.trim()) params.set('q', clientState.search.trim());
  const qs = params.toString();
  const res = await fetch(`/api/clients${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  clientState.clients = data.clients || [];
  clientState.total = data.total ?? clientState.clients.length;
}

async function loadClientsTab(opts = {}) {
  const root = getClientsEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading clients…</div>';
  try {
    await fetchClientsList();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }
  const deepUid = opts.clientUid || pendingClientDeepLinkUid;
  pendingClientDeepLinkUid = null;
  clientState.activeUid = deepUid || null;
  clientState.dirty = false;
  clientState.draft = null;
  clearEditorFooterSave();
  if (!clientState.activeUid) getClientsEditor()?.classList.remove('de-pane-active');
  renderClientsEditor();
  if (deepUid && isMobileTabs()) getClientsEditor()?.classList.add('de-pane-active');
}

function scheduleClientSearch() {
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(async () => {
    try {
      await fetchClientsList();
      renderClientsEditor();
    } catch (e) {
      alert(`Search failed: ${e.message}`);
    }
  }, 300);
}

function fillClientsSidebarList(list) {
  const { clients } = clientState;
  list.innerHTML = '';
  for (const c of clients) {
    list.appendChild(createClientSwipeRow(c));
  }
  if (clients.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = clientState.search.trim() ? 'No matches.' : 'No clients yet.';
    list.appendChild(empty);
  } else if (!clientState.search.trim()) {
    attachSidebarListReorder(list, clients.map((c) => c.uid), persistClientOrder);
  }
}

function refreshClientsSidebarList() {
  const root = getClientsEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderClientsEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    const total = clientState.total;
    const clientLabel = total === 1 ? 'Client' : 'Clients';
    searchInput.placeholder = `Search ${total} ${clientLabel}`;
  }
  fillClientsSidebarList(list);
}

function renderClientsEditor() {
  const root = getClientsEditor();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const { clients, activeUid, total } = clientState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const clientLabel = total === 1 ? 'Client' : 'Clients';
  const subheader = listSearchSubheader({
    itemCount: total,
    search: {
      value: clientState.search,
      placeholder: `Search ${total} ${clientLabel}`,
      onInput: (value) => {
        clientState.search = value;
        scheduleClientSearch();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillClientsSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeUid === '__new__') {
    renderNewClientForm(pane);
  } else if (activeUid) {
    renderEditClientForm(pane);
  } else {
    clearEditorFooterSave();
    appendEmptyDetailPane(pane, {
      mapKey: 'clients',
      iconName: 'users',
      bodyHtml: '<p>Select a client to edit, or add a new one.</p>',
      btnLabel: 'Add New',
      onCreate: () => startNewClient(),
    });
  }

  root.appendChild(pane);
  finishSidebarListScroll(root, savedSidebarScroll);
}

function syncClTitleInputWidth(input) {
  if (!input) return;
  const text = input.value || input.placeholder || 'M';
  input.style.width = `${Math.max(text.length, 4)}ch`;
}

function splitClientNameParts(contact) {
  const first = (contact.firstName || '').trim();
  const last = (contact.lastName || '').trim();
  if (first || last) return { firstName: first, lastName: last };
  const full = (contact.name || '').trim();
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function joinClientFullName(firstName, lastName, company = '') {
  const person = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' ');
  return person || company.trim();
}

function clientDisplayLabel(draft) {
  return draft?.company?.trim() || joinClientFullName(draft?.firstName, draft?.lastName) || draft?.name || 'Client';
}

function appendClientField(parent, label, input) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  wrap.appendChild(input);
  parent.appendChild(wrap);
}

async function geocodeClientAddressPreview(address) {
  const q = (address || '').trim();
  if (!q) return null;
  try {
    const res = await adminFetch(`/api/mapbox/geocode?${new URLSearchParams({ address: q })}`);
    const data = await res.json();
    if (!res.ok || !data.geo) return null;
    return data.geo;
  } catch {
    return null;
  }
}

function mountClientAddressField(parent, value) {
  const input = document.createElement('input');
  input.className = 'de-input cl-address-input';
  input.placeholder = 'Street address';
  input.value = value || '';
  input.autocomplete = 'street-address';
  appendClientField(parent, 'Address', input);
  return input;
}

function mountClientMapSection(parent, draft) {
  const section = document.createElement('section');
  section.className = 'cl-map-section';
  const mapHost = document.createElement('div');
  mapHost.className = 'cl-map-host';
  section.appendChild(mapHost);
  parent.appendChild(section);

  const geo = draft?.geo;
  clientMapController = createClientMap(mapHost, {
    token: window.__mapboxAccessToken,
    lat: geo?.lat,
    lng: geo?.lng,
    address: draft?.address || '',
  });
  return section;
}

function normalizeWebsiteUrl(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function isOpenableWebsiteUrl(raw) {
  try {
    const url = new URL(normalizeWebsiteUrl(raw));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mountClientWebsiteField(parent, value) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = 'Website';

  const field = document.createElement('div');
  field.className = 'control-field cl-website-field';

  const input = document.createElement('input');
  input.className = 'de-input';
  input.type = 'url';
  input.placeholder = 'https://example.com';
  input.value = value || '';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'ios-icon-btn cl-website-open-btn';
  openBtn.setAttribute('aria-label', 'Open website');
  openBtn.title = 'Open website';
  openBtn.innerHTML = navIcon('external-link', 18);
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isOpenableWebsiteUrl(input.value)) return;
    window.open(normalizeWebsiteUrl(input.value), '_blank', 'noopener,noreferrer');
  });

  function syncOpenBtn() {
    const ok = isOpenableWebsiteUrl(input.value);
    openBtn.disabled = !ok;
    openBtn.hidden = !ok;
    if (ok) {
      const url = normalizeWebsiteUrl(input.value);
      openBtn.title = `Open ${url}`;
      openBtn.setAttribute('aria-label', `Open ${url} in new tab`);
    } else {
      openBtn.title = 'Open website';
      openBtn.setAttribute('aria-label', 'Open website');
    }
  }

  input.addEventListener('input', syncOpenBtn);
  syncOpenBtn();

  field.appendChild(input);
  field.appendChild(openBtn);
  wrap.appendChild(field);
  parent.appendChild(wrap);
  return input;
}

function renderNewClientForm(pane) {
  clearClientFieldRegistry();
  pane.innerHTML = '';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'cl-title-wrap';
  const titleField = document.createElement('div');
  titleField.className = 'cl-title-field';
  const companyInput = document.createElement('input');
  companyInput.className = 'cl-title-input';
  companyInput.placeholder = 'Company name';
  companyInput.value = clientState.draft?.company || '';
  companyInput.setAttribute('aria-label', 'Company name');
  const editHint = document.createElement('span');
  editHint.className = 'cl-title-edit-hint';
  editHint.innerHTML = IOS_ICONS.edit;
  editHint.setAttribute('aria-hidden', 'true');
  titleField.appendChild(companyInput);
  titleField.appendChild(editHint);
  titleWrap.appendChild(titleField);
  syncClTitleInputWidth(companyInput);
  companyInput.addEventListener('input', () => syncClTitleInputWidth(companyInput));

  pane.appendChild(
    createPaneSubheader({
      back: {
        label: 'Back to clients',
        onClick: () => {
          clientState.activeUid = null;
          clientState.draft = null;
          getClientsEditor()?.classList.remove('de-pane-active');
          renderClientsEditor();
        },
      },
      titleNode: titleWrap,
    }).header,
  );

  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const firstNameInput = document.createElement('input');
  firstNameInput.className = 'de-input';
  firstNameInput.placeholder = 'First name';
  firstNameInput.autocomplete = 'given-name';
  firstNameInput.value = clientState.draft?.firstName || '';
  appendClientField(fields, 'First name', firstNameInput);
  registerClientField(firstNameInput, () => true);

  const lastNameInput = document.createElement('input');
  lastNameInput.className = 'de-input';
  lastNameInput.placeholder = 'Last name';
  lastNameInput.autocomplete = 'family-name';
  lastNameInput.value = clientState.draft?.lastName || '';
  appendClientField(fields, 'Last name', lastNameInput);
  registerClientField(lastNameInput, () => true);

  const phoneInput = document.createElement('input');
  phoneInput.className = 'de-input';
  phoneInput.value = formatPhoneInput(clientState.draft?.phone || '');
  appendClientField(fields, 'Phone', phoneInput);
  attachPhoneFormatter(phoneInput);
  registerClientField(phoneInput, () => isValidClientPhone(phoneInput.value));

  const emailInput = document.createElement('input');
  emailInput.className = 'de-input';
  emailInput.type = 'email';
  emailInput.placeholder = 'email@example.com';
  emailInput.value = clientState.draft?.email || '';
  appendClientField(fields, 'Email', emailInput);
  registerClientField(emailInput, () => isValidClientEmail(emailInput.value));

  const websiteInput = mountClientWebsiteField(fields, clientState.draft?.website || '');
  registerClientField(websiteInput, () => true);

  const notesLabel = document.createElement('label');
  notesLabel.className = 'de-label cl-notes-label';
  notesLabel.textContent = 'Notes (internal)';
  const notesTa = document.createElement('textarea');
  notesTa.className = 'de-textarea cl-notes-textarea';
  notesTa.spellcheck = false;
  notesTa.placeholder = 'Private notes — never shown on client portal';
  notesTa.value = clientState.draft?.notes || '';
  notesLabel.appendChild(notesTa);
  fields.appendChild(notesLabel);

  pane.appendChild(fields);
  registerClientField(companyInput, () => !!joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value));
  registerClientField(notesTa, () => true);

  setEditorFooterSave(() => {
    refreshAllClientFields();
    const name = joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value);
    if (!name) return;
    if (!isValidClientEmail(emailInput.value) || !isValidClientPhone(phoneInput.value)) return;
    return createClient({
      name,
      email: emailInput.value.trim(),
      phone: phoneToStorage(phoneInput.value),
      company: companyInput.value.trim(),
      website: websiteInput.value.trim(),
      notes: notesTa.value.trim(),
    });
  });
  getClientsEditor()?.classList.add('de-pane-active');
}

function renderEditClientForm(pane) {
  clearClientFieldRegistry();
  const uid = clientState.activeUid;
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      const contact = data.contact ?? data;
      const { firstName, lastName } = splitClientNameParts(contact);
      clientState.draft = {
        name: contact.name || '',
        firstName,
        lastName,
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        website: data.website || contact.website || '',
        address: data.address || '',
        geo: data.geo || null,
        notes: contact.notes || '',
        portal_url: contact.portal_url ?? data.portal_url,
        createdAt: contact.createdAt ?? data.createdAt,
        archived: contact.archived ?? data.archived,
      };
      clientState.dirty = false;
      clientState.autosaveGetPayload = null;
      pane.innerHTML = '';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'cl-title-wrap';
      const titleField = document.createElement('div');
      titleField.className = 'cl-title-field';
      const companyInput = document.createElement('input');
      companyInput.className = 'cl-title-input';
      companyInput.value = clientState.draft.company || '';
      companyInput.placeholder = 'Company name';
      companyInput.setAttribute('aria-label', 'Company name');
      const editHint = document.createElement('span');
      editHint.className = 'cl-title-edit-hint';
      editHint.innerHTML = IOS_ICONS.edit;
      editHint.setAttribute('aria-hidden', 'true');
      titleField.appendChild(companyInput);
      titleField.appendChild(editHint);
      titleWrap.appendChild(titleField);
      syncClTitleInputWidth(companyInput);
      companyInput.addEventListener('input', () => syncClTitleInputWidth(companyInput));

      const shareBtn = createPortalShareBtn(uid, {
        title: `${clientDisplayLabel(clientState.draft)} — portal`,
        recipient: {
          contactUid: uid,
          name: joinClientFullName(firstName, lastName, clientState.draft.company) || 'Client',
          email: clientState.draft.email,
          phone: clientState.draft.phone,
        },
      });

      const { header } = createPaneSubheader({
        back: {
          label: 'Back to clients',
          onClick: async () => {
            await flushClientAutosave();
            if (clientState.dirty && !(await confirmDiscardChanges())) return;
            clientState.activeUid = null;
            clientState.draft = null;
            clientState.autosaveGetPayload = null;
            getClientsEditor()?.classList.remove('de-pane-active');
            renderClientsEditor();
          },
        },
        titleNode: titleWrap,
        icons: [
          shareBtn,
          paneDeleteIcon({
            label: 'Delete client',
            onClick: () => deleteClient(uid, clientDisplayLabel(clientState.draft)),
          }),
        ].filter(Boolean),
      });
      pane.appendChild(header);

      const fields = document.createElement('div');
      fields.className = 'de-fields';

      const firstNameInput = document.createElement('input');
      firstNameInput.className = 'de-input';
      firstNameInput.placeholder = 'First name';
      firstNameInput.autocomplete = 'given-name';
      firstNameInput.value = clientState.draft.firstName || '';
      appendClientField(fields, 'First name', firstNameInput);
      registerClientField(firstNameInput, () => true);

      const lastNameInput = document.createElement('input');
      lastNameInput.className = 'de-input';
      lastNameInput.placeholder = 'Last name';
      lastNameInput.autocomplete = 'family-name';
      lastNameInput.value = clientState.draft.lastName || '';
      appendClientField(fields, 'Last name', lastNameInput);
      registerClientField(lastNameInput, () => true);

      const phoneInput = document.createElement('input');
      phoneInput.className = 'de-input';
      phoneInput.value = formatPhoneInput(clientState.draft.phone || '');
      appendClientField(fields, 'Phone', phoneInput);
      attachPhoneFormatter(phoneInput);
      registerClientField(phoneInput, () => isValidClientPhone(phoneInput.value));

      const emailInput = document.createElement('input');
      emailInput.className = 'de-input';
      emailInput.type = 'email';
      emailInput.value = clientState.draft.email || '';
      appendClientField(fields, 'Email', emailInput);
      registerClientField(emailInput, () => isValidClientEmail(emailInput.value));

      const websiteInput = mountClientWebsiteField(fields, clientState.draft.website || '');
      registerClientField(websiteInput, () => true);

      const addressInput = mountClientAddressField(fields, clientState.draft.address || '');
      registerClientField(addressInput, () => true);
      destroyClientAddressAutocomplete = mountAddressAutocomplete(
        addressInput,
        getClientsEditor() || document.body,
        async (pickedAddress) => {
          clientPendingGeo = await geocodeClientAddressPreview(pickedAddress);
          if (clientPendingGeo && clientMapController) {
            clientMapController.setLocation(
              clientPendingGeo.lat,
              clientPendingGeo.lng,
              pickedAddress,
            );
          }
        },
      );

      mountClientMapSection(fields, clientState.draft);

      const notesLabel = document.createElement('label');
      notesLabel.className = 'de-label cl-notes-label';
      notesLabel.textContent = 'Notes (internal)';
      const notesTa = document.createElement('textarea');
      notesTa.className = 'de-textarea cl-notes-textarea';
      notesTa.spellcheck = false;
      notesTa.value = clientState.draft.notes || '';
      notesLabel.appendChild(notesTa);
      fields.appendChild(notesLabel);
      registerClientField(notesTa, () => true);
      registerClientField(companyInput, () =>
        !!joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value),
      );

      pane.appendChild(fields);
      mountClientWorkSection(pane, uid);

      const getPayload = () => {
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const company = companyInput.value.trim();
        const payload = {
          name: joinClientFullName(firstName, lastName, company),
          email: emailInput.value.trim(),
          phone: phoneToStorage(phoneInput.value),
          company,
          website: websiteInput.value.trim(),
          address: addressInput.value.trim(),
          notes: notesTa.value.trim(),
        };
        if (clientPendingGeo) payload.geo = clientPendingGeo;
        return payload;
      };
      clientState.autosaveGetPayload = getPayload;

      const markDirty = () => {
        clientState.dirty =
          firstNameInput.value !== clientState.draft.firstName ||
          lastNameInput.value !== clientState.draft.lastName ||
          companyInput.value !== clientState.draft.company ||
          emailInput.value !== clientState.draft.email ||
          phoneToStorage(phoneInput.value) !== clientState.draft.phone ||
          websiteInput.value !== clientState.draft.website ||
          addressInput.value !== clientState.draft.address ||
          notesTa.value !== clientState.draft.notes;
      };
      const queueAutosave = () => {
        markDirty();
        scheduleClientAutosave(uid, getPayload);
      };
      const saveNow = async () => {
        markDirty();
        await autosaveClient(uid, getPayload());
      };
      for (const el of [
        companyInput,
        firstNameInput,
        lastNameInput,
        emailInput,
        phoneInput,
        websiteInput,
        addressInput,
        notesTa,
      ]) {
        el.addEventListener('input', () => {
          clientActiveField = el;
          if (el === addressInput) clientPendingGeo = null;
          queueAutosave();
        });
        el.addEventListener('blur', () => {
          clientActiveField = el;
          void (async () => {
            if (el === addressInput && addressInput.value.trim()) {
              const geo = await geocodeClientAddressPreview(addressInput.value);
              if (geo) {
                clientPendingGeo = geo;
                clientMapController?.setLocation(geo.lat, geo.lng, addressInput.value.trim());
              }
            }
            await saveNow();
          })();
        });
      }

      getClientsEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openClient(uid) {
  await flushClientAutosave();
  if (clientState.dirty && clientState.activeUid && !(await confirmDiscardChanges())) return;
  clientState.activeUid = uid;
  clientState.dirty = false;
  clientState.autosaveGetPayload = null;
  renderClientsEditor();
}

async function createClient(payload) {
  if (!payload.name) { alert('Enter a company or contact name.'); return; }
  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const uid = data.uid;
    if (payload.website?.trim() && uid) {
      await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: payload.website.trim() }),
      });
    }
    await loadClientsTab();
    clientState.activeUid = uid;
    renderClientsEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

function syncClientListRow(uid, name) {
  const row = getClientsEditor()?.querySelector(`.ch-list-item[data-id="${CSS.escape(uid)}"] .ch-item-title`);
  if (row) row.textContent = name;
}

function scheduleClientAutosave(uid, getPayload) {
  clearTimeout(clientAutosaveTimer);
  clientAutosaveTimer = setTimeout(async () => {
    clientAutosaveTimer = null;
    await autosaveClient(uid, getPayload());
  }, 650);
}

async function flushClientAutosave() {
  if (clientAutosaveTimer) {
    clearTimeout(clientAutosaveTimer);
    clientAutosaveTimer = null;
  }
  const uid = clientState.activeUid;
  if (!uid || uid === '__new__' || !clientState.autosaveGetPayload) return;
  await autosaveClient(uid, clientState.autosaveGetPayload());
}

async function autosaveClient(uid, payload) {
  if (!payload.name) {
    refreshAllClientFields();
    return false;
  }
  const draft = clientState.draft;
  if (!draft) return false;
  const unchanged =
    payload.name === draft.name &&
    payload.email === draft.email &&
    payload.phone === draft.phone &&
    payload.company === draft.company &&
    payload.website === draft.website &&
    payload.address === draft.address &&
    payload.notes === draft.notes;
  if (unchanged) {
    clientState.dirty = false;
    return true;
  }
  if (!isValidClientEmail(payload.email) || !isValidClientPhone(payload.phone)) {
    refreshAllClientFields();
    return false;
  }
  if (clientActiveField) setFormFieldState(clientActiveField, 'saving');
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const nameParts = splitClientNameParts({
      name: payload.name,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    Object.assign(clientState.draft, {
      name: payload.name,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: payload.email,
      phone: payload.phone,
      company: payload.company,
      website: payload.website,
      address: data.address ?? payload.address,
      geo: data.geo ?? clientPendingGeo ?? clientState.draft.geo,
      notes: payload.notes,
    });
    clientPendingGeo = null;
    if (clientMapController) {
      const geo = clientState.draft.geo;
      if (geo?.lat != null && geo?.lng != null) {
        clientMapController.setLocation(geo.lat, geo.lng, clientState.draft.address || '');
      } else if (!clientState.draft.address) {
        clientMapController.setLocation(null, null, '');
      }
    }
    clientState.dirty = false;
    const c = clientState.clients.find((x) => x.uid === uid);
    if (c) {
      c.name = payload.name;
      c.email = payload.email;
      c.phone = payload.phone;
      c.company = payload.company;
    }
    syncClientListRow(uid, payload.name);
    if (clientActiveField) flashFormFieldSaved(clientActiveField);
    return true;
  } catch (e) {
    console.warn('[clients] autosave failed', e);
    if (clientActiveField) setFormFieldState(clientActiveField, 'invalid');
    refreshAllClientFields();
    return false;
  }
}

async function saveClient(uid, payload) {
  if (!payload.name) { alert('Name is required.'); return; }
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    clientState.dirty = false;
    await loadClientsTab();
    clientState.activeUid = uid;
    renderClientsEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function fetchClientDeletePreview(uid) {
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}?preview=delete`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function openOsDialogBackdrop() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop) return null;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  backdrop.querySelector('.ios-sheet')?.classList.add('ios-sheet--visible');
  document.documentElement.classList.add('ios-sheet-locked');
  return backdrop;
}

function closeOsDialogBackdrop() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop) return;
  backdrop.querySelector('.ios-sheet')?.classList.remove('ios-sheet--visible');
  backdrop.classList.remove('open', 'os-dialog-keyboard');
  backdrop.setAttribute('aria-hidden', 'true');
  document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
  if (!document.querySelector('.ios-sheet-backdrop.open')) {
    document.documentElement.classList.remove('ios-sheet-locked');
  }
}

function bindOsDialogDismiss(backdrop, finish, showCancel) {
  const closeBtn = backdrop.querySelector('[data-os-dialog-close]');
  if (closeBtn) {
    closeBtn.hidden = !showCancel;
    if (showCancel) {
      closeBtn.addEventListener('click', () => finish(false), { once: true });
    }
  }
  if (showCancel) {
    backdrop.addEventListener(
      'click',
      function onBackdropClick(ev) {
        if (ev.target === backdrop) {
          backdrop.removeEventListener('click', onBackdropClick);
          finish(false);
        }
      },
      { once: true },
    );
  }
}

function osDialog(opts) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve(opts.showCancel ? false : undefined);
  }

  return new Promise((resolve) => {
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
      if (ev.key === 'Escape' && opts.showCancel) finish(false);
    };

    titleEl.textContent = opts.title || '';
    bodyEl.innerHTML = opts.bodyHtml || '';
    actionsEl.innerHTML = '';

    const mkBtn = (label, cls, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', () => finish(value));
      actionsEl.appendChild(btn);
      return btn;
    };

    if (opts.showCancel) {
      mkBtn(opts.cancelLabel || 'Cancel', 'os-dialog-btn--ghost', false);
    }
    const primary = mkBtn(
      opts.confirmLabel || 'OK',
      opts.danger ? 'os-dialog-btn--danger' : 'os-dialog-btn--primary',
      true,
    );

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, !!opts.showCancel);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    primary.focus();
  });
}

let osDialogKeyboardBound = false;
let osDialogKeyboardSync = null;

function scrollOsDialogFieldIntoView(field) {
  if (!(field instanceof HTMLElement)) return;
  const body = document.getElementById('os-dialog-body');
  if (body?.contains(field)) {
    const bodyRect = body.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const margin = 16;
    if (fieldRect.bottom > bodyRect.bottom - margin || fieldRect.top < bodyRect.top + margin) {
      body.scrollTop += fieldRect.top - bodyRect.top - margin;
    }
  }
  field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function syncOsDialogKeyboardLayout() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop?.classList.contains('open')) return;
  const vv = window.visualViewport;
  const active = document.activeElement;
  const inDialog =
    active instanceof HTMLElement &&
    (active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement) &&
    backdrop.contains(active);
  if (!inDialog || !vv) {
    backdrop.classList.remove('os-dialog-keyboard');
    document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  backdrop.classList.add('os-dialog-keyboard');
  document.documentElement.style.setProperty('--os-dialog-keyboard-inset', `${inset}px`);
  const runScroll = () => scrollOsDialogFieldIntoView(active);
  requestAnimationFrame(runScroll);
  window.setTimeout(runScroll, 120);
  window.setTimeout(runScroll, 360);
}

function scheduleOsDialogFieldFocus(field) {
  if (!(field instanceof HTMLElement)) return;
  const focus = () => {
    try {
      field.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    syncOsDialogKeyboardLayout();
  };
  requestAnimationFrame(() => requestAnimationFrame(focus));
}

function bindOsDialogKeyboardLayout() {
  if (osDialogKeyboardBound) {
    syncOsDialogKeyboardLayout();
    return;
  }
  osDialogKeyboardBound = true;
  osDialogKeyboardSync = syncOsDialogKeyboardLayout;
  document.addEventListener('focusin', osDialogKeyboardSync, true);
  window.visualViewport?.addEventListener('resize', osDialogKeyboardSync);
  window.visualViewport?.addEventListener('scroll', osDialogKeyboardSync);
}

function releaseOsDialogKeyboardLayout() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  backdrop?.classList.remove('os-dialog-keyboard');
  document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
  if (!osDialogKeyboardBound || !osDialogKeyboardSync) return;
  document.removeEventListener('focusin', osDialogKeyboardSync, true);
  window.visualViewport?.removeEventListener('resize', osDialogKeyboardSync);
  window.visualViewport?.removeEventListener('scroll', osDialogKeyboardSync);
  osDialogKeyboardBound = false;
  osDialogKeyboardSync = null;
}

function osConfirm(opts) {
  return osDialog({ ...opts, showCancel: true });
}

function osAlert(opts) {
  return osDialog({ ...opts, showCancel: false, confirmLabel: opts.confirmLabel || 'OK' });
}

async function confirmDiscardChanges() {
  return osConfirm({
    title: 'Discard changes?',
    bodyHtml: '<p>Discard unsaved changes?</p>',
    confirmLabel: 'Discard',
    danger: true,
  });
}

function buildClientDeleteConfirmHtml(name, preview) {
  const parts = [];
  const projectCount = preview.project_count ?? preview.job_count ?? 0;
  if (projectCount > 0) {
    const titles = (preview.projects || []).map((p) => escHtml(p.title)).slice(0, 8);
    const extra = projectCount > titles.length ? ` (+${projectCount - titles.length} more)` : '';
    parts.push(
      `<p><strong>${escHtml(name)}</strong> has ${projectCount} attached project${projectCount === 1 ? '' : 's'}${titles.length ? `: ${titles.join(', ')}${extra}` : '.'}</p>`,
    );
    parts.push('<p class="os-dialog-warn">Deleting this client will permanently delete all attached projects.</p>');
  } else {
    parts.push(`<p>Delete <strong>${escHtml(name)}</strong>? This cannot be undone.</p>`);
  }
  const inv = preview.invoice_count ?? 0;
  const est = preview.estimate_count ?? 0;
  if (inv > 0) {
    parts.push(
      `<p class="os-dialog-note">${inv} linked Crater invoice${inv === 1 ? '' : 's'} — the client will be removed; invoice records stay in billing.</p>`,
    );
  }
  if (est > 0) {
    parts.push(
      `<p class="os-dialog-note">${est} linked Crater estimate${est === 1 ? '' : 's'} — the client will be removed; estimate records stay in billing.</p>`,
    );
  }
  return parts.join('');
}

async function performClientDelete(uid, force) {
  const qs = force ? '?force=true' : '';
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}${qs}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  return { res, data };
}

async function deleteClient(uid, name) {
  closeOpenSwipeRow();
  let preview;
  try {
    preview = await fetchClientDeletePreview(uid);
  } catch (e) {
    await osAlert({ title: 'Could not verify', bodyHtml: `<p>${escHtml(e.message)}</p>` });
    return;
  }

  const projectCount = preview.project_count ?? preview.job_count ?? 0;

  const confirmed = await osConfirm({
    title: projectCount > 0 ? 'Delete client and projects?' : 'Delete client?',
    bodyHtml: buildClientDeleteConfirmHtml(name, preview),
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (!confirmed) return;

  try {
    let { res, data } = await performClientDelete(uid, true);

    if (res.status === 409) {
      const retry = await osConfirm({
        title: 'Confirm delete',
        bodyHtml: `<p>${escHtml(data.error || data.warning || 'This client has linked records.')}</p>`,
        confirmLabel: 'Delete anyway',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!retry) return;
      ({ res, data } = await performClientDelete(uid, true));
    }

    if (!res.ok) throw new Error(data.error || data.warning || `HTTP ${res.status}`);

    clientState.activeUid = null;
    clientState.dirty = false;
    clientState.draft = null;
    await loadClientsTab();
  } catch (e) {
    await osAlert({ title: 'Delete failed', bodyHtml: `<p>${escHtml(e.message)}</p>` });
  }
}

// ---- chats tab ----

const CHAT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const CHAT_MAX_IMAGES = 5;
const CHAT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function parseChatMsgContent(content) {
  if (typeof content !== 'string' || !content.startsWith('{"v":')) {
    return { text: content || '', images: [] };
  }
  try {
    const parsed = JSON.parse(content);
    if (parsed?.v === 1) {
      const images = Array.isArray(parsed.images)
        ? parsed.images.filter((img) => img?.mediaType && img?.data)
        : [];
      return { text: String(parsed.text ?? ''), images };
    }
  } catch (_) {}
  return { text: content, images: [] };
}

function chatMsgPlainText(content) {
  const { text, images } = parseChatMsgContent(content);
  if (images.length && !text.trim()) {
    return images.length === 1 ? '[Image]' : `[${images.length} images]`;
  }
  if (images.length && text.trim()) {
    return `${text}\n[${images.length} image${images.length === 1 ? '' : 's'} attached]`;
  }
  return text;
}

function serializeChatMsgContent(text, images) {
  if (!images?.length) return text;
  return JSON.stringify({
    v: 1,
    text,
    images: images.map(({ mediaType, data }) => ({ mediaType, data })),
  });
}

function fileToChatImage(file) {
  return new Promise((resolve, reject) => {
    if (!CHAT_IMAGE_TYPES.has(file.type)) {
      reject(new Error(`Unsupported image type: ${file.type || 'unknown'}`));
      return;
    }
    if (file.size > CHAT_MAX_IMAGE_BYTES) {
      reject(new Error('Image too large (max 5 MB)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve({
        mediaType: file.type,
        data: comma >= 0 ? result.slice(comma + 1) : result,
        previewUrl: result,
        name: file.name || 'image',
      });
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

async function collectChatImageFiles(files) {
  const out = [];
  for (const file of files) {
    if (!file?.type?.startsWith('image/')) continue;
    try {
      out.push(await fileToChatImage(file));
    } catch (e) {
      showChatToast(e.message);
    }
  }
  return out;
}

function appendChatMessageImages(bubble, images, beforeEl) {
  if (!images.length) return;
  const gallery = document.createElement('div');
  gallery.className = 'ch-msg-images';
  for (const img of images) {
    const el = document.createElement('img');
    el.className = 'ch-msg-img';
    el.src = `data:${img.mediaType};base64,${img.data}`;
    el.alt = 'Attached image';
    el.loading = 'lazy';
    gallery.appendChild(el);
  }
  bubble.insertBefore(gallery, beforeEl);
}

let _chToastTimer = null;

function showChatToast(message, nearEl) {
  let toast = document.getElementById('ch-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ch-toast';
    toast.className = 'ch-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('ch-toast-visible');
  if (nearEl) {
    const r = nearEl.getBoundingClientRect();
    toast.style.left = `${Math.min(window.innerWidth - 120, Math.max(12, r.left))}px`;
    toast.style.top = `${Math.max(12, r.top - 36)}px`;
  } else {
    toast.style.left = '';
    toast.style.top = '';
  }
  clearTimeout(_chToastTimer);
  _chToastTimer = setTimeout(() => toast.classList.remove('ch-toast-visible'), 1800);
}

async function copyChatText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showChatToast('Copied', btn);
    if (btn) {
      const prev = btn.getAttribute('aria-label');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => btn.setAttribute('aria-label', prev || 'Copy'), 1500);
    }
    return true;
  } catch {
    showChatToast('Copy failed — check browser permissions');
    return false;
  }
}

async function shareChatText(text, role, btn) {
  const brandName = window.__companyBrand?.name || 'Assistant';
  const label = role === 'user' ? 'You' : 'Assistant';
  const payload = { text, title: `${label} — ${brandName} chat` };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const ok = await copyChatText(text, btn);
  if (ok) showChatToast('Copied — paste to share');
  return ok;
}

function clientPortalShareUrl(uid, tab) {
  if (!uid) return '';
  const base = `${window.location.origin}/c/${encodeURIComponent(uid)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

async function sharePortalLink(url, title, btn) {
  if (!url) return false;
  if (navigator.share) {
    try {
      await navigator.share({ url, title: title || undefined });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const ok = await copyChatText(url, btn);
  if (ok) showChatToast('Link copied — paste to share');
  return ok;
}

async function createTrackedProjectShareUrl(jobSlug, contactUid, tab) {
  if (!jobSlug || !contactUid) return '';
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(jobSlug)}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_uid: contactUid, tab: tab || 'work', channel: 'share' }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.url || '';
  } catch (e) {
    showChatToast(e?.message || 'Could not create tracked link');
    return clientPortalShareUrl(contactUid, tab);
  }
}

function formatLinkTrackWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderWorkLinkTrackStatus(container, links) {
  if (!container) return;
  container.innerHTML = '';
  const latest = Array.isArray(links) && links.length ? links[0] : null;
  if (!latest) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const sent = formatLinkTrackWhen(latest.sent_at);
  const opened = latest.first_clicked_at ? formatLinkTrackWhen(latest.first_clicked_at) : '';
  const status = document.createElement('span');
  status.className = 'wk-link-track-status' + (opened ? ' wk-link-track-status--opened' : '');
  if (opened) {
    status.textContent = `Link opened ${opened}${latest.click_count > 1 ? ` (${latest.click_count}×)` : ''}`;
  } else {
    status.textContent = sent ? `Link sent ${sent} · Not opened yet` : 'Link sent · Not opened yet';
  }
  container.appendChild(status);
}

async function refreshWorkLinkTrackStatus(container, jobSlug) {
  if (!container || !jobSlug) return;
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(jobSlug)}/link`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && data.ok) renderWorkLinkTrackStatus(container, data.links);
  } catch {
    /* ignore */
  }
}

let _reaveShareState = null;

function closeReaveShareSheet() {
  window.IosSheet?.close('reave-share-backdrop');
  _reaveShareState = null;
}

function setReaveShareStatus(msg, kind) {
  const el = document.getElementById('reave-share-status');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'reave-share-status';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.className = `reave-share-status is-${kind || 'pending'}`;
}

function reaveShareKindLabel(kind) {
  if (kind === 'work') return 'Project link';
  if (kind === 'booking') return 'Meeting details';
  if (kind === 'document') return 'Document to sign';
  return 'Client portal link';
}

async function resolveReaveShareUrl(state) {
  if (state.url) return state.url;
  if (state.kind === 'work' && state.jobSlug && state.recipient?.contactUid) {
    return createTrackedProjectShareUrl(state.jobSlug, state.recipient.contactUid, state.tab || 'work');
  }
  if (state.recipient?.contactUid) {
    return clientPortalShareUrl(state.recipient.contactUid, state.tab);
  }
  if (state.kind === 'booking') return scheduleShareBookingUrl(state.booking);
  return '';
}

async function sendViaReaveShare(channel, state) {
  setReaveShareStatus('Sending…', 'pending');
  const noteEl = document.getElementById('reave-share-note');
  const message = noteEl?.value?.trim() || undefined;
  let url;
  if (state.kind === 'document') {
    url = state.url;
  } else if (state.kind === 'booking') {
    url = state.url || scheduleShareBookingUrl(state.booking);
  } else if (!state.jobSlug && state.recipient?.contactUid) {
    url = clientPortalShareUrl(state.recipient.contactUid, state.tab);
  } else if (state.url && !state.jobSlug) {
    url = state.url;
  }
  const payload = {
    kind: state.kind === 'work' ? 'work' : state.kind,
    channel,
    recipient: state.recipient,
    message,
    url: url || undefined,
    jobSlug: state.jobSlug || undefined,
    tab: state.tab || undefined,
    booking: state.booking || undefined,
    template: state.template || undefined,
    docTitle: state.docTitle || undefined,
  };

  const buttons = document.querySelectorAll('#reave-share-actions .reave-share-btn--primary');
  buttons.forEach((b) => { b.disabled = true; });

  try {
    const res = await fetch('/api/share/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setReaveShareStatus(`Sent via ${data.channel} to ${data.dest}`, 'ok');
    if (state.jobSlug && state.trackEl) void refreshWorkLinkTrackStatus(state.trackEl, state.jobSlug);
    state.onSent?.(data);
  } catch (e) {
    setReaveShareStatus(e?.message || 'Send failed', 'err');
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function buildReaveShareActions(state, opts = {}) {
  const actionsEl = document.getElementById('reave-share-actions');
  if (!actionsEl) return;

  const recipient = state.recipient || {};
  const name = recipient.name?.trim() || 'recipient';
  const firstName = name.split(/\s+/)[0] || name;
  const brandName = window.__companyBrand?.name || 'Reave';
  const email = recipient.email?.trim();
  const phone = recipient.phone?.trim();
  const canEmail = !!email || !!recipient.contactUid || state.kind === 'booking';
  const canSms = !!phone || !!email || !!recipient.contactUid;

  actionsEl.innerHTML = '';

  const mkBtn = (label, className, onClick, disabled, hint) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `reave-share-btn ${className}`.trim();
    btn.disabled = !!disabled;
    if (hint) {
      btn.innerHTML = `${escHtml(label)}<small>${escHtml(hint)}</small>`;
    } else {
      btn.textContent = label;
    }
    btn.addEventListener('click', onClick);
    return btn;
  };

  actionsEl.appendChild(
    mkBtn(
      `Email ${brandName}`,
      'reave-share-btn--primary',
      () => sendViaReaveShare('email', state),
      !canEmail,
      email || (canEmail ? `Via ${brandName}` : 'No email on file'),
    ),
  );
  actionsEl.appendChild(
    mkBtn(
      `Text ${brandName}`,
      'reave-share-btn--primary',
      () => sendViaReaveShare('sms', state),
      !canSms,
      phone || (canSms ? `Via ${brandName}` : 'No phone on file'),
    ),
  );
  actionsEl.appendChild(
    mkBtn('Copy link', 'reave-share-btn--ghost', async () => {
      const url = await resolveReaveShareUrl(state);
      let text = url;
      if (state.kind === 'booking' && state.booking) {
        text = [formatScheduleRange(state.booking.startTime, state.booking.endTime), url]
          .filter(Boolean)
          .join('\n');
      }
      if (text && (await copyChatText(text))) setReaveShareStatus('Copied to clipboard', 'ok');
    }),
  );
  if (navigator.share) {
    actionsEl.appendChild(
      mkBtn('More options…', 'reave-share-btn--ghost', async () => {
        const url = await resolveReaveShareUrl(state);
        const sharePayload = { title: opts.shareTitle || `Share with ${name}` };
        if (url) sharePayload.url = url;
        if (opts.shareText) sharePayload.text = opts.shareText;
        try {
          await navigator.share(sharePayload);
        } catch (e) {
          if (e?.name !== 'AbortError') setReaveShareStatus(e?.message || 'Share cancelled', 'err');
        }
      }),
    );
  }
}

function removeDocSharePicker() {
  document.getElementById('reave-share-doc-picker')?.remove();
}

async function openReaveShareSheet(opts = {}) {
  const backdrop = document.getElementById('reave-share-backdrop');
  if (!backdrop) return;

  removeDocSharePicker();
  const recipient = { ...(opts.recipient || {}) };
  if (opts.contactUid && !recipient.contactUid) recipient.contactUid = opts.contactUid;
  const name = recipient.name?.trim() || 'Guest';
  recipient.name = name;
  const kind = opts.kind || 'portal';
  const brandName = window.__companyBrand?.name || 'Reave';

  const state = {
    kind,
    recipient,
    url: opts.url,
    jobSlug: opts.jobSlug,
    tab: opts.tab,
    booking: opts.booking,
    trackEl: opts.trackEl,
    onSent: opts.onSent,
  };
  _reaveShareState = state;

  const titleEl = document.getElementById('reave-share-title');
  const subEl = document.getElementById('reave-share-sub');
  const noteEl = document.getElementById('reave-share-note');
  if (titleEl) titleEl.textContent = `Share with ${name}`;
  if (subEl) {
    subEl.textContent =
      kind === 'booking'
        ? `Send meeting details via ${brandName} — branded email or SMS, not your personal account.`
        : `Send ${reaveShareKindLabel(kind).toLowerCase()} via ${brandName}.`;
  }
  if (noteEl) noteEl.value = '';
  setReaveShareStatus('', null);
  buildReaveShareActions(state, opts);

  window.IosSheet?.open('reave-share-backdrop', {
    onClose: () => { _reaveShareState = null; },
  });
}

/**
 * Document share sheet: a client-only recipient picker on top of the branded
 * share sheet. Sends the client their personalised signing link for `slug`.
 */
async function openDocumentShareSheet(opts = {}) {
  const backdrop = document.getElementById('reave-share-backdrop');
  if (!backdrop) return;
  const slug = opts.slug;
  if (!slug) return;

  const brandName = window.__companyBrand?.name || 'Reave';
  const docTitle = opts.title || slug;

  const state = {
    kind: 'document',
    recipient: {},
    template: slug,
    docTitle,
    url: undefined,
  };
  _reaveShareState = state;

  const titleEl = document.getElementById('reave-share-title');
  const subEl = document.getElementById('reave-share-sub');
  const noteEl = document.getElementById('reave-share-note');
  const actionsEl = document.getElementById('reave-share-actions');
  if (titleEl) titleEl.textContent = `Send ${docTitle}`;
  if (subEl) {
    subEl.textContent = `Choose a client to send "${docTitle}" to. They'll get a branded ${brandName} link to review and sign — no one else.`;
  }
  if (noteEl) noteEl.value = '';
  setReaveShareStatus('', null);
  if (actionsEl) actionsEl.innerHTML = '';

  // ── Inject a clients-only recipient picker above the note field ──
  removeDocSharePicker();
  const picker = document.createElement('div');
  picker.id = 'reave-share-doc-picker';
  picker.className = 'reave-share-picker';

  const selectedRow = document.createElement('div');
  selectedRow.className = 'reave-share-picked';
  selectedRow.style.display = 'none';
  const selectedName = document.createElement('span');
  selectedName.className = 'reave-share-picked-name';
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';
  selectedRow.appendChild(selectedName);
  selectedRow.appendChild(changeBtn);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search clients…';
  searchInput.autocomplete = 'off';
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);

  picker.appendChild(selectedRow);
  picker.appendChild(searchWrap);

  const noteLabel = backdrop.querySelector('.reave-share-note-label');
  const body = backdrop.querySelector('.reave-share-body');
  if (noteLabel && noteLabel.parentNode) noteLabel.parentNode.insertBefore(picker, noteLabel);
  else if (body) body.appendChild(picker);

  const setNoteVisible = (visible) => {
    const disp = visible ? '' : 'none';
    if (noteLabel) noteLabel.style.display = disp;
    if (noteEl) noteEl.style.display = disp;
  };

  function showSearch() {
    state.recipient = {};
    state.url = undefined;
    selectedRow.style.display = 'none';
    searchWrap.style.display = 'block';
    if (actionsEl) actionsEl.innerHTML = '';
    setNoteVisible(false);
    setReaveShareStatus('', null);
    searchInput.value = '';
    dropdown.style.display = 'none';
    searchInput.focus();
    scheduleDocClientSearch();
  }

  function pick(client) {
    state.recipient = {
      contactUid: client.uid,
      name: client.name || 'Client',
      email: client.email || undefined,
      phone: client.phone || undefined,
    };
    state.url = `${window.location.origin}/doc/${encodeURIComponent(client.uid)}/${encodeURIComponent(slug)}`;
    selectedName.textContent = client.name || 'Client';
    selectedRow.style.display = 'flex';
    searchWrap.style.display = 'none';
    dropdown.style.display = 'none';
    setNoteVisible(true);
    buildReaveShareActions(state, {
      shareTitle: docTitle,
      shareText: `Please review and sign: ${docTitle}`,
    });
  }

  function renderDropdown(clients) {
    dropdown.innerHTML = '';
    if (!clients.length) {
      dropdown.innerHTML = '<div class="de-empty">No clients found</div>';
      dropdown.style.display = 'block';
      return;
    }
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      btn.innerHTML = `${escHtml(c.name)}<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
    dropdown.style.display = 'block';
  }

  let docClientSearchTimer = null;
  function scheduleDocClientSearch() {
    clearTimeout(docClientSearchTimer);
    docClientSearchTimer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
        params.set('limit', '20');
        const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        renderDropdown(data.clients || []);
      } catch (e) {
        dropdown.innerHTML = `<div class="de-empty">${escHtml(e.message)}</div>`;
        dropdown.style.display = 'block';
      }
    }, 250);
  }

  changeBtn.addEventListener('click', showSearch);
  searchInput.addEventListener('focus', () => scheduleDocClientSearch());
  searchInput.addEventListener('input', () => scheduleDocClientSearch());

  setNoteVisible(false);

  window.IosSheet?.open('reave-share-backdrop', {
    onClose: () => {
      _reaveShareState = null;
      clearTimeout(docClientSearchTimer);
      removeDocSharePicker();
      setNoteVisible(true);
    },
  });

  scheduleDocClientSearch();
}

function createPortalShareBtn(uid, opts = {}) {
  const { tab, title, className = 'ios-icon-btn de-share-btn', jobSlug, trackEl, recipient } = opts;
  if (!uid) return null;
  return createIosIconBtn({
    iconKey: 'share',
    label: 'Share with client',
    className,
    onClick: () =>
      openReaveShareSheet({
        kind: jobSlug ? 'work' : 'portal',
        contactUid: uid,
        recipient: recipient || { contactUid: uid, name: opts.recipientName },
        tab,
        jobSlug,
        trackEl,
        shareTitle: title || 'Your client page',
      }),
  });
}

function appendPortalShareBtn(parent, uid, opts = {}) {
  const btn = createPortalShareBtn(uid, opts);
  if (btn && parent) parent.appendChild(btn);
  return btn;
}

function pasteIntoChatInput(input) {
  if (!input || input.disabled) return;
  const insert = (text) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.selectionStart = input.selectionEnd = pos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText().then(insert).catch(() => {
      showChatToast('Paste blocked — use ⌘V / Ctrl+V');
    });
  } else {
    showChatToast('Paste with ⌘V / Ctrl+V');
    input.focus();
  }
}

function insertChatDraft(input, text) {
  if (!input || input.disabled) return;
  input.value = text;
  input.selectionStart = input.selectionEnd = text.length;
  input.focus();
  showChatToast('Message loaded — edit and send');
}

function createChatMsgAction(label, iconKey, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ch-msg-action';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS[iconKey] || '';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function bindChatMessageContextMenu(row, message, composeInput, onEdit) {
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const items = [
      { label: 'Copy', action: () => copyChatText(message.content) },
      { label: 'Share', action: () => shareChatText(message.content, message.role) },
    ];
    if (message.role === 'user' && onEdit) {
      items.push({ label: 'Edit message', action: onEdit });
    }
    if (composeInput) {
      items.push({ label: 'Paste into message', action: () => pasteIntoChatInput(composeInput) });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
}

let chatState = {
  threads: [],
  search: '',
  activeId: null,
  messages: [],
  title: '',
  linkedJobs: [],
  sending: false,
  sendAbort: null,
  pendingDraft: null,
  pendingAutoSend: false,
  disposableChatId: null,
  composeDirty: false,
};

const CHAT_LAST_ACTIVE_KEY = 'chat:lastActiveId-v1';

function readChatLastActiveId() {
  try {
    return localStorage.getItem(CHAT_LAST_ACTIVE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function rememberChatActiveId(id) {
  if (!id) return;
  try {
    localStorage.setItem(CHAT_LAST_ACTIVE_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearChatLastActiveId() {
  try {
    localStorage.removeItem(CHAT_LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function isDisposableChat(id) {
  if (!id || chatState.disposableChatId !== id) return false;
  if (chatState.messages.length > 0 || chatState.sending || chatState.composeDirty) return false;
  if (chatState.pendingDraft || chatState.pendingAutoSend) return false;
  const title =
    chatState.activeId === id
      ? chatState.title
      : chatState.threads.find((t) => t.id === id)?.title;
  return !title || title.trim() === 'New chat';
}

async function abandonDisposableChat(id) {
  if (!isDisposableChat(id)) return;
  chatState.disposableChatId = null;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status !== 404) await readApiJson(res);
    chatState.threads = chatState.threads.filter((t) => t.id !== id);
    if (chatState.activeId === id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      chatState.linkedJobs = [];
      chatState.composeDirty = false;
    }
  } catch {
    /* best effort */
  }
}

function sortChatThreads(threads) {
  const byUpdated = (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
  const active = threads.filter((t) => !t.archived).sort(byUpdated);
  const archived = threads.filter((t) => t.archived).sort(byUpdated);
  return [...active, ...archived];
}

async function fetchChatThreads() {
  const [activeRes, archivedRes] = await Promise.all([
    fetch('/api/chats', { cache: 'no-store' }),
    fetch('/api/chats?archived=1', { cache: 'no-store' }),
  ]);
  const activeData = await activeRes.json();
  const archivedData = await archivedRes.json();
  if (!activeRes.ok) throw new Error(activeData.error || `HTTP ${activeRes.status}`);
  if (!archivedRes.ok) throw new Error(archivedData.error || `HTTP ${archivedRes.status}`);
  const active = (activeData.threads || []).map((t) => ({ ...t, archived: false }));
  const archived = (archivedData.threads || []).map((t) => ({ ...t, archived: true }));
  return sortChatThreads([...active, ...archived]);
}

function getChatPanel() { return document.getElementById('chat-panel'); }

function formatChatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

async function loadChatsTab(opts = {}) {
  const root = getChatPanel();
  if (!root) return;
  const keepSession = opts.keepSession === true && chatState.activeId;
  const savedActiveId = keepSession ? chatState.activeId : null;
  const savedTitle = keepSession ? chatState.title : '';
  const savedMessages = keepSession ? chatState.messages : [];
  const savedDraft = keepSession ? chatState.pendingDraft : null;
  const savedAutoSend = keepSession ? chatState.pendingAutoSend : false;

  root.innerHTML = '<div class="de-loading">Loading chats…</div>';
  try {
    chatState.threads = await fetchChatThreads();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }

  if (savedActiveId) {
    if (!chatState.threads.some((t) => t.id === savedActiveId)) {
      chatState.threads.unshift({ id: savedActiveId, title: savedTitle || 'Chat' });
    }
    chatState.activeId = savedActiveId;
    chatState.title = savedTitle;
    chatState.messages = savedMessages;
    chatState.pendingDraft = savedDraft;
    chatState.pendingAutoSend = savedAutoSend;
    renderChatPanel();
    const deepChatId = pendingChatDeepLinkId || parseChatDeepLinkFromUrl();
    pendingChatDeepLinkId = null;
    if (deepChatId) openChat(deepChatId).catch(() => {});
    return;
  }

  const deepChatId = pendingChatDeepLinkId || parseChatDeepLinkFromUrl();
  pendingChatDeepLinkId = null;
  const restoreId = deepChatId || chatState.activeId || readChatLastActiveId();

  if (restoreId) {
    if (chatState.activeId && chatState.activeId !== restoreId) {
      await abandonDisposableChat(chatState.activeId);
    }
    if (!chatState.threads.some((t) => t.id === restoreId)) {
      clearChatLastActiveId();
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      chatState.pendingAutoSend = false;
      chatState.composeDirty = false;
      chatState.disposableChatId = null;
      getChatPanel()?.classList.remove('ch-pane-active');
      renderChatPanel();
      return;
    }
    renderChatPanel();
    openChat(restoreId).catch(() => {});
    return;
  }

  if (chatState.activeId) await abandonDisposableChat(chatState.activeId);
  chatState.activeId = null;
  chatState.messages = [];
  chatState.title = '';
  chatState.pendingAutoSend = false;
  chatState.composeDirty = false;
  chatState.disposableChatId = null;
  getChatPanel()?.classList.remove('ch-pane-active');
  renderChatPanel();
}

function formatLinkedJobsSub(jobs) {
  if (!jobs?.length) return '';
  return jobs.length === 1 ? jobs[0].title || jobs[0].slug : `${jobs.length} projects`;
}

function createSidebarChatTitle(title) {
  const titleEl = document.createElement('span');
  titleEl.className = 'ch-item-title';
  titleEl.textContent = title;
  return titleEl;
}

function syncSidebarChatTitle(threadId, title) {
  const el = getChatPanel()?.querySelector(
    `.ch-list-item[data-id="${CSS.escape(threadId)}"] .ch-item-title`,
  );
  if (el) el.textContent = title;
}

async function saveChatTitle(threadId, title) {
  const trimmed = (title || '').trim();
  if (!trimmed || !threadId) return false;
  const res = await fetch(`/api/chats/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: trimmed }),
  });
  await readApiJson(res);
  chatState.title = trimmed;
  const thread = chatState.threads.find((t) => t.id === threadId);
  if (thread) thread.title = trimmed;
  syncSidebarChatTitle(threadId, trimmed);
  return true;
}

function startChatTitleEdit(titleEl, threadId, originalTitle) {
  if (!titleEl || titleEl.dataset.editing === '1') return;
  const wrap = titleEl.closest('.de-header-title-field');
  const prior = (originalTitle || titleEl.textContent || 'New chat').trim() || 'New chat';
  titleEl.dataset.editing = '1';
  if (wrap) wrap.classList.add('de-header-title-field--editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'de-doc-name de-header-title-input ch-header-title-input';
  input.value = prior;
  input.setAttribute('aria-label', 'Chat title');

  const finish = async (save) => {
    titleEl.dataset.editing = '0';
    if (wrap) wrap.classList.remove('de-header-title-field--editing');
    const next = (input.value || '').trim() || prior;
    if (save && next !== prior) {
      try {
        await saveChatTitle(threadId, next);
        titleEl.textContent = next;
      } catch (e) {
        titleEl.textContent = prior;
        osAlert({ title: 'Rename failed', bodyHtml: escHtml(e.message) });
      }
    } else {
      titleEl.textContent = prior;
    }
    input.remove();
    titleEl.hidden = false;
  };

  titleEl.hidden = true;
  (wrap || titleEl.parentElement).appendChild(input);
  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void finish(true);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      void finish(false);
    }
  });
  input.addEventListener('blur', () => void finish(true));
}

function createHeaderChatTitle(threadId, title) {
  const titleEl = document.createElement('span');
  titleEl.className = 'de-doc-name ch-header-title';
  titleEl.textContent = (title || '').trim() || 'New chat';
  const start = () => startChatTitleEdit(titleEl, threadId, titleEl.textContent);
  return wrapEditableHeaderTitle(titleEl, {
    clickable: true,
    onActivate: start,
    hint: 'Click to rename',
    ariaLabel: 'Rename chat',
  });
}

function syncChatPaneHeaderTitle(title) {
  const titleEl = getChatPanel()?.querySelector('.ch-pane-header .ch-header-title');
  if (!(titleEl instanceof HTMLElement) || titleEl.dataset.editing === '1') return;
  titleEl.textContent = (title || '').trim() || 'New chat';
}

async function readApiJson(res) {
  const text = await res.text();
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

function syncChatSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getChatPanel();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.id === chatState.activeId;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
      activeEl = el;
    } else {
      el.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function createChatListItem(t) {
  const isActive = t.id === chatState.activeId;
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'ch-list-item' +
    (isActive ? ' active' : '') +
    (t.archived ? ' ch-list-item--archived' : '');
  item.dataset.id = t.id;
  if (isActive) item.setAttribute('aria-current', 'page');
  const archivedIcon = t.archived
    ? `<span class="ch-item-archived-icon" title="Archived" aria-label="Archived">${navIcon('archive', 13)}</span>`
    : '';
  const linkedSub = formatLinkedJobsSub(t.linked_jobs);
  const subLine = linkedSub
    ? `<span class="ch-item-sub project-link-sub">${escHtml(linkedSub)}</span>`
    : '';
  item.innerHTML =
    `<span class="ch-item-row">` +
      SIDEBAR_LIST_GRIP +
      archivedIcon +
      `<span class="ch-item-title">${escHtml(t.title || 'New chat')}</span>` +
      `<span class="ch-item-date">${escHtml(formatChatDate(t.updated_at))}</span>` +
    `</span>` +
    subLine;
  item.addEventListener('click', () => {
    if (t.id === chatState.activeId) return;
    void openChat(t.id);
  });
  return item;
}

function createChatSwipeRow(t) {
  return createSwipeRow(createChatListItem(t), [
    swipeArchiveAction({
      label: t.archived ? 'Unarchive' : 'Archive',
      onClick: () => archiveChat(t),
    }),
    swipeDeleteAction({
      onClick: () => deleteChat(t.id),
    }),
  ]);
}

function visibleChatThreads() {
  return chatState.threads.filter((t) =>
    matchesListSearch(chatState.search, t.title, t.id),
  );
}

function fillChatSidebarList(list) {
  const target = pullRefreshContentRoot(list);
  const visibleThreads = visibleChatThreads();
  target.innerHTML = '';
  for (const t of visibleThreads) {
    target.appendChild(createChatSwipeRow(t));
  }
  if (visibleThreads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = chatState.search.trim() ? 'No matches.' : 'No chats yet.';
    target.appendChild(empty);
  } else if (!chatState.search.trim()) {
    attachSidebarListReorder(list, visibleThreads.map((t) => t.id), persistChatOrder);
  }
}

async function refreshChatsListQuiet() {
  try {
    chatState.threads = await fetchChatThreads();
    refreshChatSidebarList();
  } catch {
    /* keep current list on refresh failure */
  }
}

function refreshChatSidebarList() {
  const root = getChatPanel();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderChatPanel();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    const count = chatState.threads.length;
    searchInput.placeholder = `Search ${count} ${count === 1 ? 'chat' : 'chats'}`;
  }
  fillChatSidebarList(list);
}

function renderChatSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const subheader = listSearchSubheader({
    itemCount: chatState.threads.length,
    search: {
      value: chatState.search,
      placeholder: `Search ${chatState.threads.length} ${chatState.threads.length === 1 ? 'chat' : 'chats'}`,
      onInput: (value) => {
        chatState.search = value;
        refreshChatSidebarList();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillChatSidebarList(list);
  attachIosPullToRefresh(list, () => {
    if (MAP.type !== 'chats') return;
    return refreshChatsListQuiet();
  });
  sidebar.appendChild(list);
  return sidebar;
}

function renderChatMessages(container, composeInput) {
  container.innerHTML = '';
  if (chatState.messages.length === 0 && !chatState.sending) {
    const ph = document.createElement('div');
    ph.className = 'de-placeholder';
    ph.innerHTML = placeholderHtml('agent', 'Send a message to start.');
    container.appendChild(ph);
    return;
  }
  for (const m of chatState.messages) {
    const row = document.createElement('div');
    row.className = 'ch-msg-row ' + (m.role === 'user' ? 'ch-msg-row-user' : 'ch-msg-row-assistant');

    const bubble = document.createElement('div');
    bubble.className = 'ch-msg ' + (m.role === 'user' ? 'ch-msg-user' : 'ch-msg-assistant');

    const parsed = parseChatMsgContent(m.content);
    const plainText = chatMsgPlainText(m.content);

    const body = document.createElement('div');
    body.className = 'ch-msg-body';
    if (parsed.text) body.textContent = parsed.text;
    appendChatMessageImages(bubble, parsed.images, body);
    if (!parsed.text && parsed.images.length) body.hidden = true;
    bubble.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'ch-msg-actions';
    if (m.role !== 'user') {
      actions.appendChild(
        createChatMsgAction('Copy', 'copy', (btn) => copyChatText(plainText, btn)),
      );
      actions.appendChild(
        createChatMsgAction('Share', 'share', (btn) => shareChatText(plainText, m.role, btn)),
      );
      bubble.appendChild(actions);
    }
    row.appendChild(bubble);

    if (m.role !== 'user') {
      bindChatMessageContextMenu(row, { ...m, content: plainText }, composeInput, null);
    }

    container.appendChild(row);
  }
  if (chatState.sending) {
    const thinking = document.createElement('div');
    thinking.className = 'ch-thinking';
    thinking.textContent = 'Thinking…';
    container.appendChild(thinking);
  }
  const bottom = document.createElement('div');
  bottom.className = 'ch-scroll-anchor';
  bottom.setAttribute('aria-hidden', 'true');
  container.appendChild(bottom);
  scrollChatToBottom(container);
}

function scrollChatToBottom(container, smooth = true) {
  if (!container) return;
  const run = () => {
    const anchor = container.querySelector('.ch-scroll-anchor');
    if (anchor) {
      anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function getAgentModelForChat() {
  return agentModelState.model || undefined;
}

async function refreshChatLinkedJobs() {
  if (!chatState.activeId) return;
  try {
    const linkRes = await fetch(`/api/chats/${encodeURIComponent(chatState.activeId)}`, {
      cache: 'no-store',
    });
    const linkData = await readApiJson(linkRes);
    chatState.linkedJobs = linkData.thread?.linked_jobs || [];
    const thread = chatState.threads.find((t) => t.id === chatState.activeId);
    if (thread) thread.linked_jobs = chatState.linkedJobs;
  } catch {
    /* ignore */
  }
}

function unmountChatThreadRoot(root) {
  const host = root?.querySelector('#ch-thread-root');
  if (host) window.__reaveAgentChat?.unmount(host);
}

function mountChatThreadRoot(threadHost) {
  const chatApi = window.__reaveAgentChat;
  if (!chatApi) {
    threadHost.innerHTML =
      '<div class="de-loading de-error">Chat UI failed to load. Hard-refresh the page.</div>';
    return;
  }
  const pendingDraft = chatState.pendingDraft;
  const pendingAutoSend = chatState.pendingAutoSend;
  chatState.pendingDraft = null;
  chatState.pendingAutoSend = false;
  chatApi.mount(threadHost, {
    threadId: chatState.activeId,
    companyName: window.__companyBrand?.name || 'Assistant',
    initialMessages: chatState.messages,
    pendingDraft,
    pendingAutoSend,
    getModel: getAgentModelForChat,
    onComposeFocus: (focused) => setChatComposeFocused(focused),
    onComposeDirty: (dirty) => {
      chatState.composeDirty = dirty;
      if (dirty && chatState.activeId === chatState.disposableChatId) {
        chatState.disposableChatId = null;
      }
    },
    onTitleUpdate: (title) => {
      chatState.title = title;
      const thread = chatState.threads.find((t) => t.id === chatState.activeId);
      if (thread) thread.title = title;
      syncSidebarChatTitle(chatState.activeId, title);
      syncChatPaneHeaderTitle(title);
      if (title.trim() && title.trim() !== 'New chat') {
        chatState.disposableChatId = null;
      }
    },
    onMessagesPersist: (userContent, assistantContent) => {
      chatState.messages.push({ role: 'user', content: userContent });
      chatState.messages.push({ role: 'assistant', content: assistantContent });
      chatState.composeDirty = false;
      if (chatState.activeId === chatState.disposableChatId) {
        chatState.disposableChatId = null;
      }
    },
    onLinkedJobsRefresh: () => {
      void refreshChatLinkedJobs().then(() => {
        const header = getChatPanel()?.querySelector('.ch-pane-header');
        if (header && chatHasConversation()) {
          const next = buildChatPaneHeader();
          header.replaceWith(next);
        }
      });
    },
  });
}

function renderChatPanel() {
  const root = getChatPanel();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  unmountChatThreadRoot(root);
  root.innerHTML = '';

  root.appendChild(renderChatSidebar());

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  if (!chatState.activeId) {
    appendEmptyDetailPane(pane, {
      mapKey: 'chats',
      iconName: 'agent',
      bodyHtml: '<p>Select a chat or start a new one.</p>',
      btnLabel: 'Start New Chat',
      onCreate: () => void startNewChat(),
    });
    root.appendChild(pane);
    clearTopbarPanelContext();
    setChatComposeFocused(false);
    syncFooterNav();
    finishSidebarListScroll(root, savedSidebarScroll);
    return;
  }

  if (chatState.activeId) pane.appendChild(buildChatPaneHeader());

  const threadHost = document.createElement('div');
  threadHost.className = 'ch-thread-root';
  threadHost.id = 'ch-thread-root';
  pane.appendChild(threadHost);

  root.appendChild(pane);
  getChatPanel()?.classList.add('ch-pane-active');
  syncTopbarPanelContext();
  syncFooterNav();
  mountChatThreadRoot(threadHost);
  finishSidebarListScroll(root, savedSidebarScroll);
}

async function startNewChat(opts = {}) {
  const prevId = chatState.activeId;
  if (prevId) await abandonDisposableChat(prevId);
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    chatState.threads.unshift(thread);
    chatState.activeId = thread.id;
    chatState.title = thread.title;
    chatState.messages = [];
    chatState.linkedJobs = thread.linked_jobs || [];
    chatState.composeDirty = false;
    chatState.disposableChatId = opts.disposable === false ? null : thread.id;
    rememberChatActiveId(thread.id);
    renderChatPanel();
  } catch (e) {
    alert(`Could not create chat: ${e.message}`);
  }
}

async function openChat(id) {
  if (id === chatState.activeId) {
    syncChatSidebarActiveState({ scroll: true });
    return;
  }
  try {
    const prevId = chatState.activeId;
    if (prevId && prevId !== id) await abandonDisposableChat(prevId);
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    chatState.activeId = id;
    chatState.title = data.thread.title;
    chatState.messages = data.thread.messages || [];
    chatState.linkedJobs = data.thread.linked_jobs || [];
    chatState.composeDirty = false;
    chatState.disposableChatId = null;
    rememberChatActiveId(id);
    const idx = chatState.threads.findIndex((t) => t.id === id);
    if (idx !== -1) {
      chatState.threads[idx] = { ...chatState.threads[idx], linked_jobs: chatState.linkedJobs };
    }
    renderChatPanel();
  } catch (e) {
    alert(`Could not load chat: ${e.message}`);
  }
}

async function deleteChat(id) {
  if (!id) return;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status !== 404) await readApiJson(res);
    chatState.threads = chatState.threads.filter((t) => t.id !== id);
    if (chatState.activeId === id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      if (chatState.disposableChatId === id) chatState.disposableChatId = null;
      clearChatLastActiveId();
      getChatPanel()?.classList.remove('ch-pane-active');
    }
    renderChatPanel();
  } catch (e) {
    osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

async function archiveChat(t) {
  closeOpenSwipeRow();
  const unarchive = !!t.archived;
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(t.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !unarchive }),
    });
    await readApiJson(res);
    const idx = chatState.threads.findIndex((e) => e.id === t.id);
    if (idx !== -1) {
      chatState.threads[idx] = { ...chatState.threads[idx], archived: !unarchive };
    }
    chatState.threads = sortChatThreads(chatState.threads);
    if (!unarchive && chatState.activeId === t.id) {
      chatState.activeId = null;
      chatState.messages = [];
      chatState.title = '';
      clearChatLastActiveId();
      getChatPanel()?.classList.remove('ch-pane-active');
    }
    renderChatPanel();
  } catch (e) {
    osAlert({
      title: unarchive ? 'Could not restore chat' : 'Could not archive chat',
      bodyHtml: escHtml(e.message),
    });
  }
}

// ---- email tab (inbox summaries) ----
let emailState = {
  allEvents: [],
  inboxFilter: 'all',
  search: '',
  activeId: null,
  composing: false,
  replyToId: null,
  compose: { to: [], subject: '', body: '' },
  sending: false,
  storage: 'files',
  digest: null,
  pushConfigured: false,
};
let pendingEmailDeepLinkId = null;
let pendingWorkDeepLinkSlug = null;
let pendingTodoDeepLinkId = null;
let pendingChatDeepLinkId = null;
let pendingClientDeepLinkUid = null;
let emailPollTimer = null;
let inboxBadgeTimer = null;

const BADGE_CACHE = 'reave-badge-v1';
const BADGE_URL = '/badge-count';

function parseWorkDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('slug')?.trim() || null;
  } catch {
    return null;
  }
}

function parseChatDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('chat')?.trim() || null;
  } catch {
    return null;
  }
}

function navigateToWork(slug, opts = {}) {
  if (!slug) return;
  if (opts.fromEmailId) {
    workState.returnToEmailId = opts.fromEmailId;
    workState.returnToTodoId = null;
  } else if (opts.fromTodoId) {
    workState.returnToEmailId = null;
    workState.returnToTodoId = opts.fromTodoId;
    todoState.returnToWorkSlug = slug;
  } else {
    workState.returnToEmailId = null;
    workState.returnToTodoId = null;
  }
  pendingWorkDeepLinkSlug = slug;
  setActiveMap('work', { force: true, workSlug: slug });
}

function navigateToTodo(id, opts = {}) {
  if (id == null || id === '') return;
  if (opts.fromWorkSlug) todoState.returnToWorkSlug = opts.fromWorkSlug;
  pendingTodoDeepLinkId = id;
  setActiveMap('todo', { force: true, todoId: id });
}

function navigateToNewTodoForProject(jobSlug) {
  if (!jobSlug) return;
  todoState.returnToWorkSlug = jobSlug;
  todoState.activeId = '__new__';
  todoState.dirty = false;
  todoState.linkedJob = null;
  todoState.draft = {
    title: '',
    priority: 'normal',
    status: 'open',
    due_date: '',
    job_slug: jobSlug,
    assignee: '',
    section: '',
  };
  pendingTodoDeepLinkId = '__new__';
  setActiveMap('todo', { force: true, todoId: '__new__' });
}

async function navigateToNewWorkFromTodo(opts = {}) {
  await flushTodoAutosave();
  let todoId = typeof todoState.activeId === 'number' ? todoState.activeId : null;
  if (!todoId) {
    if (!todoState.draft?.title?.trim()) {
      await osAlert({
        title: 'Enter a to‑do title',
        bodyHtml: 'Save the to‑do title before creating a project.',
      });
      return;
    }
    const saved = await saveActiveTodoDraft(true);
    if (!saved || typeof todoState.activeId !== 'number') {
      await osAlert({
        title: 'Could not save to‑do',
        bodyHtml: 'Save the to‑do before creating a project.',
      });
      return;
    }
    todoId = todoState.activeId;
  }
  workState.returnToEmailId = null;
  workState.returnToTodoId = todoId;
  workState.activeSlug = '__new__';
  workState.dirty = false;
  workState.draft = {
    title: opts.suggestedTitle?.trim() || '',
    contact_uid: '',
    contact_name: '',
    status: 'inquiry',
    priority: 'normal',
    due_date: '',
    value: '',
    tags: '',
    source: '',
    body: '',
  };
  pendingWorkDeepLinkSlug = '__new__';
  setActiveMap('work', { force: true, workSlug: '__new__' });
}

function navigateToClient(uid) {
  if (!uid) return;
  pendingClientDeepLinkUid = uid;
  setActiveMap('clients', { force: true, clientUid: uid });
}

function navigateToEmail(id) {
  if (!id) return;
  pendingEmailDeepLinkId = id;
  setActiveMap('email', { force: true, emailId: id });
}

function navigateToChat(id) {
  if (!id) return;
  pendingChatDeepLinkId = id;
  setActiveMap('chats', { force: true, chatId: id, keepChatSession: true });
}

function createProjectLinkChip(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'project-link-chip';
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function workRelatedChats(related, sourceChatId) {
  const chats = [...(related?.chats || [])];
  const sourceId = sourceChatId?.trim?.() || '';
  if (sourceId && !chats.some((c) => c.id === sourceId)) {
    chats.unshift({ id: sourceId, title: 'Chat deleted', updatedAt: '', deleted: true });
  }
  return chats;
}

function mountWorkFilesSection(container, slug, initialFiles) {
  const section = document.createElement('div');
  section.className = 'wk-files-section';

  const title = document.createElement('div');
  title.className = 'wk-files-title';
  title.textContent = 'File repository';
  section.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'wk-files-hint';
  hint.textContent = 'Images from matching emails and linked chats are saved here automatically.';
  section.appendChild(hint);

  const grid = document.createElement('div');
  grid.className = 'wk-files-grid';
  section.appendChild(grid);

  const uploadRow = document.createElement('div');
  uploadRow.className = 'wk-files-upload';
  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
  uploadInput.multiple = true;
  uploadInput.className = 'wk-files-input';
  const downloadAllBtn = document.createElement('button');
  downloadAllBtn.type = 'button';
  downloadAllBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
  setDeBtnLabel(downloadAllBtn, 'Download all', 'download');
  downloadAllBtn.disabled = !(initialFiles?.length);
  downloadAllBtn.addEventListener('click', async () => {
    if (!currentFiles.length) return;
    downloadAllBtn.disabled = true;
    const label = getDeBtnLabel(downloadAllBtn);
    updateDeBtnLabel(downloadAllBtn, 'Preparing…');
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}/files/download-all`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          /* binary or empty */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${slug}-files.zip`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      alert(`Download failed: ${e.message}`);
    } finally {
      updateDeBtnLabel(downloadAllBtn, label);
      downloadAllBtn.disabled = !currentFiles.length;
    }
  });
  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
  setDeBtnLabel(uploadBtn, 'Upload files', 'share');
  uploadBtn.addEventListener('click', () => uploadInput.click());
  uploadRow.appendChild(downloadAllBtn);
  uploadRow.appendChild(uploadInput);
  uploadRow.appendChild(uploadBtn);
  section.appendChild(uploadRow);

  let currentFiles = initialFiles || [];

  function formatFileSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function projectFileAbsoluteUrl(file) {
    return new URL(file.url, window.location.origin).href;
  }

  async function shareProjectFile(file) {
    const url = projectFileAbsoluteUrl(file);
    await sharePortalLink(url, file.filename || 'Project file');
  }

  function renderFiles(files) {
    currentFiles = files || [];
    downloadAllBtn.disabled = !currentFiles.length;
    grid.innerHTML = '';
    if (!files?.length) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.style.padding = '0.5rem 0';
      empty.textContent = 'No files yet.';
      grid.appendChild(empty);
      return;
    }
    for (const file of files) {
      const card = document.createElement('div');
      card.className = 'wk-file-card';

      const isImage = String(file.mediaType || '').startsWith('image/');
      if (isImage) {
        const img = document.createElement('img');
        img.className = 'wk-file-thumb';
        img.src = file.url;
        img.alt = file.filename || 'Project file';
        img.loading = 'lazy';
        card.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.className = 'wk-file-doc';
        icon.textContent = '📄';
        card.appendChild(icon);
      }

      const meta = document.createElement('div');
      meta.className = 'wk-file-meta';
      meta.innerHTML =
        `<span class="wk-file-name">${escHtml(file.filename || 'file')}</span>` +
        `<span class="wk-file-size">${escHtml(formatFileSize(file.sizeBytes))}</span>`;
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'wk-file-actions';

      actions.appendChild(
        paneShareIcon({
          label: `Share ${file.filename || 'file'}`,
          onClick: () => shareProjectFile(file),
        }),
      );
      actions.appendChild(
        paneDeleteIcon({
          label: `Delete ${file.filename || 'file'}`,
          onClick: async () => {
            try {
              const res = await fetch(file.url, { method: 'DELETE' });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              const listRes = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, {
                cache: 'no-store',
              });
              const listData = await listRes.json();
              renderFiles(listData.files || []);
            } catch (e) {
              alert(`Failed to delete: ${e.message}`);
            }
          },
        }),
      );
      card.appendChild(actions);
      grid.appendChild(card);
    }
  }

  uploadInput.addEventListener('change', async () => {
    const files = [...uploadInput.files];
    uploadInput.value = '';
    if (!files.length) return;
    uploadBtn.disabled = true;
    updateDeBtnLabel(uploadBtn, 'Uploading…');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, {
          method: 'POST',
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      }
      const listRes = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, { cache: 'no-store' });
      const listData = await listRes.json();
      renderFiles(listData.files || []);
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      uploadBtn.disabled = false;
      updateDeBtnLabel(uploadBtn, 'Upload files');
    }
  });

  renderFiles(initialFiles || []);
  container.appendChild(section);
}

function mountWorkTodosSection(container, jobSlug) {
  const section = document.createElement('div');
  section.className = 'wk-todos-section';

  const head = document.createElement('div');
  head.className = 'wk-todos-head';
  const title = document.createElement('div');
  title.className = 'wk-todos-title';
  title.textContent = 'To‑dos';
  head.appendChild(title);
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'de-btn de-btn-ghost';
  newBtn.textContent = 'New';
  newBtn.addEventListener('click', () => navigateToNewTodoForProject(jobSlug));
  head.appendChild(newBtn);
  section.appendChild(head);

  const list = document.createElement('div');
  list.className = 'wk-todos-list';
  list.innerHTML = '<div class="de-loading">Loading…</div>';
  section.appendChild(list);

  const linkWrap = document.createElement('div');
  linkWrap.className = 'wk-todos-link-wrap';
  section.appendChild(linkWrap);

  container.appendChild(section);
  void refreshWorkTodosSection(section, list, linkWrap, jobSlug);
}

async function refreshWorkTodosSection(section, listEl, linkWrap, jobSlug) {
  listEl.innerHTML = '<div class="de-loading">Loading…</div>';
  try {
    const res = await fetch(`/api/todos?job_slug=${encodeURIComponent(jobSlug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const todos = data.todos || [];
    listEl.innerHTML = '';
    if (todos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.textContent = 'No linked to‑dos yet.';
      listEl.appendChild(empty);
    } else {
      for (const todo of todos) {
        listEl.appendChild(createWorkTodoRow(todo, jobSlug));
      }
    }
    mountWorkTodoLinkPicker(linkWrap, jobSlug, () => refreshWorkTodosSection(section, listEl, linkWrap, jobSlug));
  } catch (e) {
    listEl.innerHTML = `<div class="de-empty de-error">${escHtml(e.message)}</div>`;
  }
}

function createWorkTodoRow(todo, jobSlug) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'wk-related-item wk-todo-item' + (todo.status === 'done' ? ' wk-todo-item--done' : '');
  const metaBits = [];
  if (todo.priority && todo.priority !== 'normal') {
    metaBits.push(TODO_PRIORITY_LABELS[todo.priority] || todo.priority);
  }
  if (todo.due_date) metaBits.push(formatTodoDueDate(todo.due_date));
  else if (todo.status === 'done') metaBits.push('Done');
  row.innerHTML =
    `<span class="wk-related-kind">${todo.status === 'done' ? 'Done' : 'To‑do'}</span>` +
    `<span class="wk-related-label">${escHtml(todo.title)}</span>` +
    `<span class="wk-related-meta">${escHtml(metaBits.join(' · ') || 'Open')}</span>`;
  row.addEventListener('click', () => navigateToTodo(todo.id, { fromWorkSlug: jobSlug }));
  return row;
}

function mountWorkTodoLinkPicker(parent, jobSlug, onLinked) {
  parent.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'de-label';
  label.textContent = 'Link existing to‑do';
  parent.appendChild(label);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search unlinked to‑dos…';
  searchInput.autocomplete = 'off';
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);
  parent.appendChild(searchWrap);

  let unlinkedTodos = [];

  async function loadUnlinked() {
    const res = await fetch('/api/todos?status=open&unlinked=1', { cache: 'no-store' });
    const data = await readApiJson(res);
    unlinkedTodos = data.todos || [];
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    dropdown.innerHTML = '';
    if (q.length < 1) {
      dropdown.style.display = 'none';
      return;
    }
    const matches = unlinkedTodos
      .filter((todo) => matchesListSearch(q, todo.title, todo.section, todo.assignee))
      .slice(0, 8);
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.style.padding = '0.45rem 0.6rem';
      empty.textContent = 'No matches.';
      dropdown.appendChild(empty);
      dropdown.style.display = 'block';
      return;
    }
    for (const todo of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      btn.innerHTML =
        `${escHtml(todo.title)}` +
        `<span class="sub">${escHtml(todoSubline(todo) || 'Unlinked')}</span>`;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => void linkTodoToProject(todo.id, jobSlug));
      dropdown.appendChild(btn);
    }
    dropdown.style.display = 'block';
  }

  async function linkTodoToProject(todoId, slug) {
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(todoId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_slug: slug }),
      });
      const data = await readApiJson(res);
      const idx = todoState.todos.findIndex((t) => t.id === todoId);
      if (idx !== -1) todoState.todos[idx] = normalizeTodoItemDates(data);
      else todoState.todos.unshift(data);
      searchInput.value = '';
      dropdown.style.display = 'none';
      unlinkedTodos = unlinkedTodos.filter((t) => t.id !== todoId);
      onLinked?.();
    } catch (e) {
      osAlert({ title: 'Link failed', bodyHtml: escHtml(e.message) });
    }
  }

  async function scheduleSearch() {
    const q = searchInput.value.trim();
    if (q.length < 1) {
      dropdown.style.display = 'none';
      return;
    }
    if (!unlinkedTodos.length) await loadUnlinked();
    renderDropdown(q);
  }

  searchInput.addEventListener('input', () => void scheduleSearch());
  searchInput.addEventListener('focus', () => void scheduleSearch());
  attachAutosuggestKeyboardNav(searchInput, dropdown, {
    optionSelector: '.wk-client-option',
    onClose: () => {
      dropdown.style.display = 'none';
    },
  });
}

function mountWorkRelatedSection(container, related, sourceChatId) {
  const emails = related?.emails || [];
  const chats = workRelatedChats(related, sourceChatId);
  if (!emails.length && !chats.length) return;

  const section = document.createElement('div');
  section.className = 'wk-related-section';

  const title = document.createElement('div');
  title.className = 'wk-related-title';
  title.textContent = 'Related';
  section.appendChild(title);

  const list = document.createElement('div');
  list.className = 'wk-related-list';

  for (const email of emails) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'wk-related-item';
    row.innerHTML =
      `<span class="wk-related-kind">Email</span>` +
      `<span class="wk-related-label">${escHtml(email.subject || '(no subject)')}</span>` +
      `<span class="wk-related-meta">${escHtml(new Date(email.receivedAt).toLocaleDateString())}</span>`;
    row.addEventListener('click', () => navigateToEmail(email.id));
    list.appendChild(row);
  }

  for (const chat of chats) {
    const deleted = !!chat.deleted;
    const row = document.createElement(deleted ? 'div' : 'button');
    if (!deleted) row.type = 'button';
    row.className = deleted ? 'wk-related-item wk-related-item--deleted' : 'wk-related-item';
    row.innerHTML =
      `<span class="wk-related-kind">Chat</span>` +
      `<span class="wk-related-label">${escHtml(deleted ? 'Chat deleted' : (chat.title || 'Chat'))}</span>` +
      `<span class="wk-related-meta">${deleted ? '' : escHtml(formatChatDate(chat.updatedAt))}</span>`;
    if (!deleted) row.addEventListener('click', () => navigateToChat(chat.id));
    list.appendChild(row);
  }

  section.appendChild(list);
  container.appendChild(section);
}

function getEmailPanel() { return document.getElementById('email-panel'); }

function parseEmailDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('email')?.trim() || null;
  } catch {
    return null;
  }
}

function applyEmailInboxFilterForEvent(ev) {
  if (!ev) return;
  if (ev.category === 'junk') emailState.inboxFilter = 'junk';
  else if (ev.category === 'receipt') emailState.inboxFilter = 'receipt';
  else if (ev.category === 'alert') emailState.inboxFilter = 'alert';
  else if (isEmailBookable(ev)) emailState.inboxFilter = 'book';
  else if (isEmailProject(ev)) emailState.inboxFilter = 'project';
  else if (isEmailRouted(ev)) emailState.inboxFilter = 'routed';
  else if (ev.category === 'review') emailState.inboxFilter = 'review';
  else emailState.inboxFilter = 'all';
}

async function openEmailFromDeepLink(id) {
  if (!id) return false;
  let ev = emailState.allEvents.find((e) => e.id === id);
  if (!ev) {
    try {
      const res = await fetch(`/api/email/inbox/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      if (data.event) {
        ev = { ...data.event, _fullLoaded: true };
        const idx = emailState.allEvents.findIndex((e) => e.id === id);
        if (idx !== -1) emailState.allEvents[idx] = ev;
        else emailState.allEvents.unshift(ev);
      }
    } catch (e) {
      console.warn('[email] deep link fetch failed', e);
    }
  }
  if (!ev) {
    pendingEmailDeepLinkId = id;
    return false;
  }
  applyEmailInboxFilterForEvent(ev);
  openEmailEvent(id);
  return true;
}

function handleNotificationOpen(url) {
  if (!url) return;
  try {
    const u = new URL(url, window.location.origin);
    const tab = u.searchParams.get('tab');
    const emailId = u.searchParams.get('email')?.trim();
    if (tab === 'email' && emailId) {
      pendingEmailDeepLinkId = emailId;
      setActiveMap('email', { force: true, emailId });
      return;
    }
    const workSlug = u.searchParams.get('slug')?.trim();
    if (tab === 'work' && workSlug) {
      pendingWorkDeepLinkSlug = workSlug;
      setActiveMap('work', { force: true, workSlug });
      return;
    }
    const chatId = u.searchParams.get('chat')?.trim();
    if (tab === 'chats' && chatId) {
      pendingChatDeepLinkId = chatId;
      setActiveMap('chats', { force: true, chatId, keepChatSession: true });
      return;
    }
    if (tab && MAPS[tab]) setActiveMap(tab, { force: true });
  } catch {}
}

function isEmailProject(ev) {
  const category = String(ev.category || '').toLowerCase();
  if (category === 'project') return true;
  // Legacy rows linked before the Projects category existed.
  return Boolean(ev.jobSlug) && String(ev.action || '').toLowerCase() === 'matched';
}

function isEmailRouted(ev) {
  if (isEmailProject(ev)) return false;
  const action = String(ev.action || '').toLowerCase();
  return action === 'filed' || action === 'matched';
}

function isEmailBookable(ev) {
  return isEmailSchedulingRequest(ev);
}

function isEmailSchedulingRequest(ev) {
  if (String(ev.category || '').toLowerCase() === 'junk') return false;
  if (ev.proposedMeetingStart || ev.schedulingNote) return true;
  const blob = [ev.summary, ev.subject, ev.bodySnippet, ev.routeNote].join(' ').toLowerCase();
  const mentionsMeeting = /\b(meeting|meet\b|schedule|get together|calendar|appointment)\b/.test(blob);
  const mentionsTime =
    /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      blob,
    );
  return mentionsMeeting && mentionsTime;
}

function isEmailBooked(ev) {
  return Boolean(ev.bookingUid);
}

function inboxTabCounts() {
  const all = emailState.allEvents;
  const active = (e) =>
    e.category !== 'junk' && e.category !== 'receipt' && !isEmailProject(e) && !isEmailRouted(e);
  return {
    all: all.filter(active).length,
    alert: all.filter((e) => e.category === 'alert' && !isEmailRouted(e)).length,
    review: all.filter((e) => e.category === 'review' && !isEmailRouted(e)).length,
    book: all.filter((e) => isEmailBookable(e) && !isEmailRouted(e)).length,
    project: all.filter(isEmailProject).length,
    routed: all.filter(isEmailRouted).length,
    receipt: all.filter((e) => e.category === 'receipt' && !isEmailRouted(e)).length,
    junk: all.filter((e) => e.category === 'junk').length,
  };
}

function inboxEventsForFilter() {
  const all = emailState.allEvents;
  const f = emailState.inboxFilter;
  if (f === 'junk') return all.filter((e) => e.category === 'junk');
  if (f === 'receipt') return all.filter((e) => e.category === 'receipt' && !isEmailRouted(e));
  if (f === 'alert') return all.filter((e) => e.category === 'alert' && !isEmailRouted(e));
  if (f === 'review') return all.filter((e) => e.category === 'review' && !isEmailRouted(e));
  if (f === 'book') return all.filter((e) => isEmailBookable(e) && !isEmailRouted(e));
  if (f === 'project') return all.filter(isEmailProject);
  if (f === 'routed') return all.filter(isEmailRouted);
  return all.filter(
    (e) => e.category !== 'junk' && e.category !== 'receipt' && !isEmailProject(e) && !isEmailRouted(e),
  );
}

function filteredInboxEvents() {
  const q = emailState.search.trim();
  let events = inboxEventsForFilter();
  if (!q) return events;
  return events.filter((ev) =>
    matchesListSearch(
      q,
      ev.subject,
      ev.from,
      ev.summary,
      ev.bodySnippet,
      ev.contactName,
      ev.jobTitle,
      ev.category,
      ev.routeNote,
    ),
  );
}

function clearTopbarPanelContext() {
  const slot = document.getElementById('topbar-panel-context');
  const topbar = document.getElementById('topbar');
  document.querySelector('.topbar-end .topbar-panel-actions')?.remove();
  if (slot) {
    slot.innerHTML = '';
    slot.hidden = true;
  }
  topbar?.classList.remove('topbar-has-panel-context');
}

function shouldShowChatTopbarTitle(title) {
  const t = (title || '').trim();
  return t.length > 0 && t !== 'New chat';
}

function closeActiveChat() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const id = chatState.activeId;
  void abandonDisposableChat(id).then(async () => {
    chatState.activeId = null;
    clearChatLastActiveId();
    setChatComposeFocused(false);
    getChatPanel()?.classList.remove('ch-pane-active');
    renderChatPanel();
  });
}

function chatTranscriptText() {
  return chatState.messages
    .map((m) => `${m.role === 'user' ? 'You' : 'Assistant'}:\n${chatMsgPlainText(m.content)}`)
    .join('\n\n');
}

function chatHasConversation() {
  return chatState.messages.length > 0 || chatState.sending;
}

function activeChatThread() {
  const id = chatState.activeId;
  if (!id) return null;
  const found = chatState.threads.find((t) => t.id === id);
  if (found) return found;
  return { id, title: chatState.title || 'Chat', archived: false };
}

function buildChatPaneNavHeader() {
  const header = document.createElement('div');
  header.className = 'de-header ch-pane-header ch-pane-header--nav-only';
  header.appendChild(createPanelBackBtn({
    label: 'Back to chats',
    onClick: () => closeActiveChat(),
  }));
  return header;
}

function buildChatPaneHeader() {
  const main = document.createElement('div');
  main.className = 'ch-pane-header-main';
  main.appendChild(createHeaderChatTitle(chatState.activeId, chatState.title));

  const transcript = chatTranscriptText();
  const thread = activeChatThread();
  const isArchived = !!thread?.archived;

  return createPaneSubheader({
    className: 'ch-pane-header',
    back: { label: 'Back to chats', onClick: () => closeActiveChat() },
    titleNode: main,
    afterTitle: createChatModelSwitcher(),
    icons: [
      createIosIconBtn({
        iconKey: 'copy',
        label: 'Copy entire conversation',
        className: 'ios-icon-btn ch-copy-chat-btn',
        onClick: (btn) => copyChatText(transcript, btn),
      }),
      paneShareIcon({
        label: 'Share entire conversation',
        onClick: (btn) => shareChatText(transcript, 'assistant', btn),
      }),
      createIosIconBtn({
        iconKey: 'archive',
        label: isArchived ? 'Unarchive chat' : 'Archive chat',
        className: 'ios-icon-btn ch-archive-chat-btn',
        onClick: () => {
          const t = activeChatThread();
          if (t) void archiveChat(t);
        },
      }),
      paneDeleteIcon({
        label: 'Delete chat',
        onClick: () => deleteChat(chatState.activeId),
      }),
    ],
  }).header;
}

function syncTopbarPanelContext() {
  clearTopbarPanelContext();
}

function isPendingReviewNotification(ev) {
  if (!ev || ev.automationAckAt) return false;
  const action = String(ev.action || '').toLowerCase();
  if (action === 'booked' && ev.bookingUid && ev.automationKind !== 'meeting_followup') return true;
  if (ev.automationKind === 'meeting_followup' && ev.bookingUid) return true;
  if (
    (ev.automationKind === 'meeting_request' || ev.automationKind === 'meeting_conflict') &&
    !ev.bookingUid
  ) {
    return true;
  }
  if (!ev.bookingUid && !ev.automationKind && ev.category !== 'junk') {
    const blob = [ev.summary, ev.subject, ev.schedulingNote, ev.bodySnippet].join(' ').toLowerCase();
    const mentionsMeeting = /\b(meet(ing)?|schedule|appointment|call|get together)\b/.test(blob);
    const mentionsTime =
      ev.proposedMeetingStart ||
      ev.schedulingNote ||
      /\b(\d{1,2}(:\d{2})?\s*(am|pm|a\.m|p\.m)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        blob,
      );
    if (mentionsMeeting && mentionsTime) return true;
  }
  if (ev.automationKind === 'project_created' && ev.jobSlug) return true;
  return false;
}

function pendingReviewCount(events) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return (events || []).filter((ev) => {
    if (!isPendingReviewNotification(ev)) return false;
    const t = new Date(ev.receivedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

function updateInboxBadgesFromState() {
  const n = pendingReviewCount(emailState.allEvents);
  syncReviewBadge(n);
  void setAppIconBadge(n);
}

async function clearCachedBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.delete(BADGE_URL);
  } catch {}
}

async function writeCachedBadgeCount(n) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    if (n <= 0) {
      await cache.delete(BADGE_URL);
      return;
    }
    await cache.put(BADGE_URL, new Response(String(n)));
  } catch {}
}

async function setAppIconBadge(n) {
  const count = Math.max(0, Number(n) || 0);
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/admin/');
    if (reg?.active) {
      reg.active.postMessage({ type: 'reave-badge-sync', count });
      await writeCachedBadgeCount(count);
      return;
    }
  } catch {}
  if (!('setAppBadge' in navigator)) return;
  try {
    await writeCachedBadgeCount(count);
    if (count > 0) await navigator.setAppBadge(count);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch (e) {
    console.warn('[badge]', e);
  }
}

async function syncInboxAppBadge(events, reviewsPending) {
  const n =
    reviewsPending != null
      ? Math.max(0, Number(reviewsPending) || 0)
      : pendingReviewCount(events);
  syncReviewBadge(n);
  await setAppIconBadge(n);
}

async function refreshFooterBadgesQuiet() {
  try {
    const [dashRes, inboxRes] = await Promise.all([
      fetch('/api/admin/dashboard', { cache: 'no-store' }),
      fetch('/api/email/inbox?limit=100', { cache: 'no-store' }),
    ]);
    
    const inboxOk = inboxRes.ok;
    
    if (dashRes.ok) {
      const dash = await dashRes.json();
      if (dash.ok) {
        if (inboxOk) {
          syncDashboardFooterBadgesWithoutReview(dash.stats);
        } else {
          syncDashboardFooterBadges(dash.stats);
        }
      }
    }
    if (inboxOk) {
      const inboxData = await inboxRes.json();
      const events = inboxData.events || [];
      if (MAP.type === 'email' && emailState.allEvents.length) {
        mergeEmailSeenFromServer(events);
      }
      await syncInboxAppBadge(events, inboxData.digest?.reviewsPending);
      return;
    }
    await setAppIconBadge(reviewsPendingCount);
  } catch {}
}

async function refreshInboxBadgeQuiet(forceHome = false) {
  const prevCount = reviewsPendingCount;
  await refreshFooterBadgesQuiet();
  // Re-render the home review-alert banners when the pending-review count
  // changes (polling) or when forced by a push, so they update without a tab
  // switch. Push forces it because a new mail may not always change the count.
  if (MAP.type === 'home' && (forceHome || reviewsPendingCount !== prevCount)) {
    await loadHomeDashboard();
  }
}

function stopInboxBadgePoll() {
  if (inboxBadgeTimer) {
    clearInterval(inboxBadgeTimer);
    inboxBadgeTimer = null;
  }
}

function syncInboxBadgePoll() {
  stopInboxBadgePoll();
  if (!document.hidden) {
    refreshInboxBadgeQuiet();
    inboxBadgeTimer = setInterval(refreshInboxBadgeQuiet, 60000);
  }
}

function emailCategoryClass(cat) {
  const key = String(cat || 'review').toLowerCase();
  const known = new Set(['junk', 'client', 'alert', 'internal', 'review', 'receipt', 'project']);
  return known.has(key) ? `em-cat-${key}` : 'em-cat-review';
}

function formatEmailCategoryLabel(ev) {
  if (isProjectReplyEmail(ev)) return 'Client reply';
  if (isEmailProject(ev)) return 'Projects';
  const cat = String(ev.category || 'review').toLowerCase();
  if (cat === 'project') return 'Projects';
  return ev.category || 'review';
}

function emailMonetaryAmount(ev) {
  const n = Number(ev.monetaryAmount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatEmailUsd(amount) {
  return Number(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function emailShowsReceiptAction(ev) {
  if (ev.category === 'receipt') return false;
  return emailMonetaryAmount(ev) != null;
}

function parseSenderEmail(from) {
  const raw = String(from || '').trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw;
  return raw || '';
}

function formatEmailCardFrom(ev) {
  return parseSenderEmail(ev.from) || '(unknown)';
}

function formatEmailAction(ev) {
  const bits = [];
  if (ev.action === 'project_reply' || ev.status === 'PROJECT_REPLY') {
    bits.push('🚨 client reply');
  } else if (ev.bookingUid) bits.push('booked');
  else if (ev.action) bits.push(ev.action);
  if (ev.jobTitle) bits.push(ev.jobTitle);
  if (ev.routeNote && !ev.jobTitle && ev.action !== 'project_reply') bits.push(ev.routeNote);
  return bits.join(' · ');
}

function isProjectReplyEmail(ev) {
  return ev.action === 'project_reply' || ev.status === 'PROJECT_REPLY';
}

async function askAgentWithPrompt(prompt, opts = {}) {
  closeOpenSwipeRow();
  try {
    const payload = {};
    if (opts.sourceEmailId) payload.sourceEmailId = opts.sourceEmailId;
    if (opts.sourceJobSlug) payload.sourceJobSlug = opts.sourceJobSlug;
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readApiJson(res);
    const thread = data.thread;
    chatState.threads.unshift(thread);
    chatState.activeId = thread.id;
    chatState.title = thread.title;
    chatState.linkedJobs = thread.linked_jobs || [];
    chatState.messages = [];
    chatState.pendingDraft = prompt;
    chatState.pendingAutoSend = true;
    chatState.disposableChatId = null;

    if (activeKey === 'chats') {
      renderChatPanel();
    } else {
      setActiveMap('chats', { force: true, keepChatSession: true });
    }
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

function buildAgentContentPrompt(intro, metaLines, body) {
  const lines = [intro, '', ...metaLines];
  const trimmed = (body || '').trim();
  if (trimmed) lines.push('', '---', trimmed.slice(0, 12000));
  return lines.join('\n');
}

async function askAgentAboutKnowledge(entry) {
  try {
    const res = await adminFetch(`${KNOWLEDGE_API}/${encodeURIComponent(entry.slug)}`);
    const data = await readApiJson(res);
    const prompt = buildAgentContentPrompt(
      'Help me work with this knowledge doc:',
      [`Title: ${entry.title}`, `Slug: ${entry.slug}`],
      data.content,
    );
    await askAgentWithPrompt(prompt);
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

async function askAgentAboutRule(rule) {
  try {
    const lines = [
      'Help me understand and improve this email triage rule:',
      '',
      `Title: ${rule.title || rule.status}`,
      `Status tag: ${rule.status}`,
    ];
    if (rule.description) lines.push(`Description: ${rule.description}`);
    lines.push(`Match mode: ${rule.matchMode === 'all' ? 'All phrases must match' : 'Any phrase matches'}`);
    lines.push(`Search in: ${(rule.fields || ['subject', 'body']).join(', ')}`);
    if (rule.phrases && rule.phrases.length > 0) {
      lines.push('', 'Keywords / phrases:');
      for (const phrase of rule.phrases) {
        lines.push(`  - ${phrase}`);
      }
    }
    lines.push('', `Enabled: ${rule.enabled !== false ? 'Yes' : 'No'}`);
    lines.push(`Send alert: ${rule.notify ? 'Yes' : 'No'}`);
    lines.push('', 'Please suggest improvements or explain how this rule works.');
    await askAgentWithPrompt(lines.join('\n'));
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

async function askAgentAboutDocument(tpl) {
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(tpl.slug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const prompt = buildAgentContentPrompt(
      'Help me work with this document template:',
      [`Title: ${tpl.title}`, `Slug: ${tpl.slug}`],
      data.content || data.html,
    );
    await askAgentWithPrompt(prompt);
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

async function askAgentAboutWork(job) {
  try {
    const lines = [
      'Help me work on this job.',
      '',
      `Title: ${job.title}`,
      `Slug: ${job.slug}`,
    ];
    if (job.contact_name || job.client) lines.push(`Client: ${job.contact_name || job.client}`);
    if (job.status) lines.push(`Status: ${WORK_STATUS_LABELS[job.status] || job.status}`);
    lines.push('', 'Use read_work on the slug above if you need the full project notes.');
    await askAgentWithPrompt(lines.join('\n'), { sourceJobSlug: job.slug });
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

function createDocumentListItem(tpl) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (tpl.slug === docState.activeSlug ? ' active' : '');
  item.dataset.slug = tpl.slug;
  item.innerHTML =
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(tpl.title)}</span></span>` +
    `<span class="ch-item-sub ch-item-slug">${escHtml(tpl.slug)}</span>`;
  item.addEventListener('click', () => openDocument(tpl.slug));
  return item;
}

function createDocumentSwipeRow(tpl) {
  return createSwipeRow(createDocumentListItem(tpl), [
    swipeAgentAction(() => askAgentAboutDocument(tpl)),
    swipeDeleteAction({
      onClick: () => deleteDocument(tpl.slug),
    }),
  ]);
}

function createKnowledgeListItem(entry) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (entry.slug === knowledgeState.activeSlug ? ' active' : '');
  item.dataset.slug = entry.slug;
  const typeBadge = entry.isDefault
    ? '<span class="ch-item-badge ch-item-badge--default" title="Default app playbook — controls how the agent works with the app">Default</span>'
    : '<span class="ch-item-badge ch-item-badge--custom" title="Custom doc — specific to this business/owner">Custom</span>';
  const sourceBadge = entry.source === 'db'
    ? '<span class="ch-item-badge" title="Live database entry">DB</span>'
    : '';
  item.innerHTML =
    `<span class="ch-item-row">${SIDEBAR_LIST_GRIP}<span class="ch-item-title">${escHtml(entry.title)}</span>${typeBadge}${sourceBadge}</span>` +
    `<span class="ch-item-sub ch-item-slug">${escHtml(entry.slug)}</span>`;
  item.addEventListener('click', () => openKnowledge(entry.slug));
  return item;
}

function createKnowledgeSwipeRow(entry) {
  return createSwipeRow(createKnowledgeListItem(entry), [
    swipeAgentAction(() => askAgentAboutKnowledge(entry)),
    swipeDeleteAction({
      onClick: () => deleteKnowledge(entry.slug),
    }),
  ]);
}

function createWorkListItem(job) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (job.slug === workState.activeSlug ? ' active' : '');
  item.dataset.slug = job.slug;
  item.innerHTML =
    `<span class="ch-item-row">${SIDEBAR_LIST_GRIP}<span class="ch-item-title">${escHtml(job.title)}</span></span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact">${escHtml(job.contact_name || job.client || '—')}</span>` +
    `<span class="${workStatusClass(job.status)}">${escHtml(WORK_STATUS_LABELS[job.status] || job.status)}</span>` +
    `</span>`;
  item.addEventListener('click', () => openWork(job.slug));
  return item;
}

function createWorkSwipeRow(job) {
  return createSwipeRow(createWorkListItem(job), [
    swipeAgentAction(() => askAgentAboutWork(job)),
    swipeDeleteAction({
      onClick: () => deleteWork(job.slug),
    }),
  ]);
}

function createClientListItem(c) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (c.uid === clientState.activeUid ? ' active' : '');
  item.dataset.id = c.uid;
  item.innerHTML =
    `<span class="ch-item-row">${SIDEBAR_LIST_GRIP}<span class="ch-item-title">${escHtml(c.name)}</span></span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact">${escHtml(clientSubline(c))}</span>` +
    (c.archived ? '<span class="cl-archived">Archived</span>' : '') +
    `</span>`;
  item.addEventListener('click', () => openClient(c.uid));
  return item;
}

function createClientSwipeRow(c) {
  return createSwipeRow(createClientListItem(c), [
    swipeDeleteAction({
      onClick: () => deleteClient(c.uid, c.company || c.name),
    }),
  ]);
}

async function confirmEmailBooking(ev, startIso, address) {
  const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: startIso,
      ...(address ? { address } : {}),
    }),
  });
  const data = await readApiJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.check = data.check;
    throw err;
  }
  const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
  if (idx !== -1 && data.event) emailState.allEvents[idx] = data.event;
  renderEmailPanel();
  return data;
}

function showEmailScheduleDialog(ev, check) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let destroyAddressAutocomplete = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      destroyAddressAutocomplete();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (evKey) => {
      if (evKey.key === 'Escape') finish(false);
    };

    titleEl.textContent = check.available ? 'Schedule meeting' : 'Time conflict';
    const parts = [
      `<p class="em-book-dialog-lead">${escHtml(ev.subject || '(no subject)')}</p>`,
      `<p><strong>Requested:</strong> ${escHtml(check.proposedLabel)}</p>`,
      `<p><strong>With:</strong> ${escHtml(check.attendeeName)} &lt;${escHtml(check.attendeeEmail)}&gt;</p>`,
    ];
    if (!check.available && check.conflictReason) {
      parts.push(`<p class="em-book-conflict">${escHtml(check.conflictReason)}</p>`);
    }
    if (!check.available && check.alternatives?.length) {
      parts.push('<p class="em-book-alt-label">Pick an open slot:</p>');
      parts.push('<div class="em-book-alt-slots">');
      for (const slot of check.alternatives) {
        parts.push(
          `<button type="button" class="em-book-alt-slot" data-start="${escHtml(slot.iso)}">${escHtml(slot.label || formatScheduleWhen(slot.iso))}</button>`,
        );
      }
      parts.push('</div>');
    } else if (!check.available) {
      parts.push('<p class="em-book-conflict">No nearby open slots found. Try Cal.com directly.</p>');
    }
    parts.push(
      '<label class="de-label sched-create-field em-book-address-field">' +
        '<span>Meeting address</span>' +
        '<div class="control-field">' +
          `<input id="em-book-address" type="text" autocomplete="street-address" autocapitalize="words" placeholder="123 Main St, City, MA 02134" value="${escHtml(readScheduleLastAddress())}">` +
        '</div>' +
      '</label>',
    );
    bodyEl.innerHTML = parts.join('');
    actionsEl.innerHTML = '';
    const addressInput = bodyEl.querySelector('#em-book-address');

    const mkBtn = (label, cls, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', () => finish(value));
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', false);

    if (check.available) {
      const bookBtn = document.createElement('button');
      bookBtn.type = 'button';
      bookBtn.className = 'os-dialog-btn os-dialog-btn--primary';
      bookBtn.textContent = 'Book meeting';
      bookBtn.addEventListener('click', async () => {
        const address = addressInput?.value.trim() || '';
        bookBtn.disabled = true;
        bookBtn.textContent = 'Booking…';
        try {
          await confirmEmailBooking(ev, check.proposedStart, address);
          if (address) rememberScheduleAddress(address);
          finish(true);
          await osAlert({
            title: 'Meeting scheduled',
            bodyHtml: `<p>Booked for <strong>${escHtml(check.proposedLabel)}</strong> with ${escHtml(check.attendeeName)}.</p>`,
          });
        } catch (err) {
          bookBtn.disabled = false;
          bookBtn.textContent = 'Book meeting';
          if (err.check) {
            finish(false);
            await showEmailScheduleDialog(ev, err.check);
          } else {
            await osAlert({ title: 'Booking failed', bodyHtml: escHtml(err.message) });
          }
        }
      });
      actionsEl.appendChild(bookBtn);
    }

    bodyEl.querySelectorAll('.em-book-alt-slot').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const start = btn.getAttribute('data-start');
        if (!start) return;
        const address = addressInput?.value.trim() || '';
        btn.disabled = true;
        try {
          await confirmEmailBooking(ev, start, address);
          if (address) rememberScheduleAddress(address);
          finish(true);
          await osAlert({
            title: 'Meeting scheduled',
            bodyHtml: `<p>Booked for <strong>${escHtml(btn.textContent || formatScheduleWhen(start))}</strong>.</p>`,
          });
        } catch (err) {
          btn.disabled = false;
          if (err.check) {
            await showEmailScheduleDialog(ev, err.check);
          } else {
            await osAlert({ title: 'Booking failed', bodyHtml: escHtml(err.message) });
          }
        }
      });
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, true);
    document.addEventListener('keydown', onKey);
    if (addressInput) {
      destroyAddressAutocomplete = mountScheduleAddressAutocomplete(addressInput);
    }
  });
}

async function startEmailScheduleFlow(ev) {
  if (isEmailBooked(ev)) {
    await osAlert({
      title: 'Already scheduled',
      bodyHtml:
        `<p>Meeting booked for <strong>${escHtml(formatScheduleWhen(ev.bookingStart || ev.proposedMeetingStart))}</strong>.</p>` +
        (ev.bookingUid ? `<p class="em-hint">Booking ID: ${escHtml(ev.bookingUid.slice(0, 8))}…</p>` : ''),
    });
    return;
  }
  let data;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
      cache: 'no-store',
    });
    data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (e) {
    await osAlert({ title: 'Could not check calendar', bodyHtml: escHtml(e.message) });
    return;
  }
  await showEmailScheduleDialog(ev, data.check);
}

function attendeeFromEmailEvent(ev) {
  const email = parseSenderEmail(ev.from);
  const raw = String(ev.from || '').trim();
  const nameMatch = raw.match(/^([^<]+)</);
  const parsedName = nameMatch?.[1]?.replace(/"/g, '').trim();
  const name = (ev.contactName || parsedName || email.split('@')[0] || 'Guest').trim();
  return { name, email: email.includes('@') ? email : '' };
}

async function runEmailScheduleAction(ev, action, btn) {
  const prevLabel = btn.textContent;
  const needsBooking = (action === 'accept-notify' && !ev.bookingUid) || action === 'book';
  let address = needsBooking ? readScheduleLastAddress() : '';

  async function postScheduleAction(addr) {
    btn.disabled = true;
    btn.textContent = action === 'accept-notify' ? 'Booking…' : 'Sending…';
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ...(addr ? { address: addr } : {}),
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  try {
    let data;
    try {
      data = await postScheduleAction(address);
    } catch (err) {
      if (needsBooking && isScheduleAddressError(err.message)) {
        btn.disabled = false;
        btn.textContent = prevLabel;
        const prompted = await ensureScheduleAddress({ forcePrompt: true, initial: address });
        if (!prompted) return;
        address = prompted;
        data = await postScheduleAction(address);
      } else {
        throw err;
      }
    }

    if (address) rememberScheduleAddress(address);
    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }
    if (data.event?.automationAckAt) {
      removeReviewAlertBanner(ev.id);
      updateInboxBadgesFromState();
    }
    renderEmailPanel();
    if (action === 'accept-notify') {
      await osAlert({
        title: data.alreadyBooked ? 'Notification sent' : 'Meeting accepted',
        bodyHtml: data.notifyError
          ? `<p>Meeting booked, but the notification email failed: ${escHtml(data.notifyError)}</p>`
          : `<p>Calendar updated and ${escHtml(attendeeFromEmailEvent(ev).name || 'the sender')} was notified.</p>`,
      });
    } else {
      await osAlert({
        title: 'Notification sent',
        bodyHtml: `<p>Let ${escHtml(attendeeFromEmailEvent(ev).name || 'the sender')} know that time is booked.</p>`,
      });
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = prevLabel;
    await osAlert({ title: 'Could not complete action', bodyHtml: escHtml(err.message) });
  }
}

function openScheduleFromEmail(ev) {
  const attendee = attendeeFromEmailEvent(ev);
  const notes = [
    ev.subject ? `Re: ${ev.subject}` : '',
    ev.schedulingNote ? `Requested: ${ev.schedulingNote}` : '',
    ev.summary ? ev.summary.slice(0, 200) : '',
  ]
    .filter(Boolean)
    .join('\n');

  const iso = ev.bookingStart || ev.proposedMeetingStart;
  let dateKey;
  let hour;
  let minute;
  if (iso) {
    const d = new Date(iso);
    dateKey = scheduleDateKey(d);
    hour = d.getHours();
    minute = d.getMinutes();
  }

  openScheduleTab({ date: dateKey, view: 'week' });
  void openScheduleCreateDialog({
    dateKey,
    hour,
    minute,
    name: attendee.name,
    email: attendee.email,
    notes,
  });
}

function isMeetingPendingConfirm(ev) {
  return isEmailBooked(ev) && !ev.automationAckAt;
}

async function mountEmailScheduleActions(container, ev) {
  if (!container) return;

  const primaryBtn = container.querySelector('.em-schedule-action-primary');
  const altBtn = container.querySelector('.em-schedule-action-secondary');

  if (container.classList.contains('em-schedule-actions-confirm')) {
    primaryBtn?.addEventListener('click', () => {
      const attendee = attendeeFromEmailEvent(ev);
      void confirmScheduledMeeting(
        {
          emailId: ev.id,
          bookingUid: ev.bookingUid,
          bookingStart: ev.bookingStart,
          whenLabel: formatScheduleWhen(ev.bookingStart || ev.proposedMeetingStart),
          attendeeName: attendee.name,
          attendeeEmail: attendee.email,
          from: ev.from,
        },
        primaryBtn,
      );
    });
    altBtn?.addEventListener('click', () => {
      if (ev.bookingUid) openScheduleTab({ uid: ev.bookingUid, view: 'week' });
      else openScheduleFromEmail(ev);
    });
    return;
  }

  if (isEmailBooked(ev)) return;

  altBtn?.addEventListener('click', () => openScheduleFromEmail(ev));

  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/schedule`, {
      cache: 'no-store',
    });
    const data = await readApiJson(res);
    if (emailState.activeId !== ev.id) return;

    if (!res.ok || !data.check) {
      if (primaryBtn) {
        primaryBtn.hidden = true;
      }
      return;
    }

    if (primaryBtn) {
      primaryBtn.hidden = false;
      primaryBtn.disabled = false;
      const action = data.check.available ? 'accept-notify' : 'notify-conflict';
      primaryBtn.textContent = data.check.available ? 'Accept and Notify' : 'Time slot is booked';
      primaryBtn.dataset.action = action;
      primaryBtn.addEventListener('click', () => {
        void runEmailScheduleAction(ev, action, primaryBtn);
      });
    }
  } catch {
    if (emailState.activeId === ev.id && primaryBtn) primaryBtn.hidden = true;
  }
}

function shouldShowEmailProjectActions(ev) {
  return !ev.jobSlug;
}

function applyEmailEventUpdate(event) {
  const idx = emailState.allEvents.findIndex((e) => e.id === event.id);
  if (idx !== -1) emailState.allEvents[idx] = event;
  if (isEmailProject(event)) emailState.inboxFilter = 'project';
  if (emailState.activeId === event.id && !filteredInboxEvents().some((e) => e.id === event.id)) {
    emailState.activeId = null;
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

async function postEmailProject(ev, payload, opts = {}) {
  const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}/project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await readApiJson(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  applyEmailEventUpdate(data.event);
  if (data.slug) {
    if (data.title && !workState.jobs.some((j) => j.slug === data.slug)) {
      workState.jobs.unshift({
        slug: data.slug,
        title: data.title,
        status: 'inquiry',
        client: data.event?.contactName || '',
        contact_name: data.event?.contactName || '',
        contact_uid: data.event?.contactUid || '',
      });
    }
    if (!opts.skipNavigate) {
      navigateToWork(data.slug, { fromEmailId: ev.id });
    }
  }
  return data;
}

async function fetchOpenJobsForEmail(ev) {
  const qs = ev.contactUid ? `?contact_uid=${encodeURIComponent(ev.contactUid)}` : '';
  const res = await fetch(`/api/work${qs}`, { cache: 'no-store' });
  const data = await readApiJson(res);
  return (data.jobs || []).filter((j) => j.status === 'inquiry' || j.status === 'active');
}

async function runEmailProjectAction(ev, payload, errorTitle) {
  closeEmailProjectMenu();
  try {
    await postEmailProject(ev, payload);
  } catch (e) {
    await osAlert({ title: errorTitle, bodyHtml: escHtml(e.message) });
  }
}

async function handleEmailProjectAddNew(ev, triggerEl) {
  closeEmailProjectMenu();
  if (triggerEl) {
    triggerEl.disabled = true;
    triggerEl.textContent = 'Creating…';
  }
  try {
    await postEmailProject(ev, {
      mode: 'create',
      title: (ev.subject || 'New project').trim(),
    });
  } catch (e) {
    if (triggerEl) {
      triggerEl.disabled = false;
      triggerEl.textContent = 'Add New';
    }
    await osAlert({ title: 'Could not create project', bodyHtml: escHtml(e.message) });
  }
}

let openEmailProjectMenu = null;

function closeEmailProjectMenu() {
  if (openEmailProjectMenu) {
    openEmailProjectMenu.classList.remove('open');
    openEmailProjectMenu = null;
  }
}

async function populateEmailProjectMenu(ev, menu) {
  menu.innerHTML = '<div class="em-project-menu-empty">Loading…</div>';

  const addNew = document.createElement('button');
  addNew.type = 'button';
  addNew.className = 'em-project-menu-item em-project-menu-item--new';
  addNew.textContent = 'Add New';
  addNew.addEventListener('click', () => handleEmailProjectAddNew(ev, addNew));

  menu.innerHTML = '';
  menu.appendChild(addNew);

  const divider = document.createElement('div');
  divider.className = 'em-project-menu-divider';
  menu.appendChild(divider);

  try {
    const jobs = await fetchOpenJobsForEmail(ev);
    if (!jobs.length) {
      const empty = document.createElement('div');
      empty.className = 'em-project-menu-empty';
      empty.textContent = ev.contactUid
        ? 'No open projects for this client'
        : 'No open projects yet';
      menu.appendChild(empty);
      return;
    }
    for (const job of jobs) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'em-project-menu-item';
      item.innerHTML =
        `<span class="em-project-menu-title">${escHtml(job.title)}</span>` +
        `<span class="em-project-menu-meta">${escHtml(WORK_STATUS_LABELS[job.status] || job.status)}</span>`;
      item.addEventListener('click', async () => {
        item.disabled = true;
        item.querySelector('.em-project-menu-title').textContent = 'Merging…';
        await runEmailProjectAction(
          ev,
          { mode: 'link', slug: job.slug },
          'Could not update project',
        );
      });
      menu.appendChild(item);
    }
  } catch {
    menu.appendChild(Object.assign(document.createElement('div'), {
      className: 'em-project-menu-empty',
      textContent: 'Could not load projects',
    }));
  }
}

function createEmailProjectDropdown(ev) {
  const wrap = document.createElement('div');
  wrap.className = 'em-project-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'em-btn-group-segment em-project-trigger';
  trigger.setAttribute('aria-label', 'Project');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.innerHTML =
    `<span class="em-project-trigger-icon" aria-hidden="true">${navIcon('briefcase', 16)}</span>` +
    '<span class="em-project-trigger-label">Project</span>' +
    '<span class="em-project-trigger-caret" aria-hidden="true">▾</span>';

  const menu = document.createElement('div');
  menu.className = 'em-project-menu';
  menu.setAttribute('role', 'menu');

  trigger.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (openEmailProjectMenu && openEmailProjectMenu !== wrap) closeEmailProjectMenu();
    const opening = !wrap.classList.contains('open');
    if (opening) await populateEmailProjectMenu(ev, menu);
    wrap.classList.toggle('open', opening);
    openEmailProjectMenu = opening ? wrap : null;
  });

  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  return wrap;
}

document.addEventListener('click', (e) => {
  if (!openEmailProjectMenu) return;
  if (openEmailProjectMenu.contains(e.target)) return;
  closeEmailProjectMenu();
});

function buildEmailAgentPrompt(ev) {
  const received = formatEmailWhen(ev.receivedAt) || ev.receivedAt || 'unknown';
  const lines = [
    `From: ${ev.from || '(unknown)'}`,
    `Subject: ${ev.subject || '(no subject)'}`,
    `Received: ${received}`,
  ];
  const body = (ev.bodyText || ev.bodySnippet || '').trim();
  if (body) {
    lines.push('', 'Body:', body);
  }
  lines.push('', 'Please wait for instructions on how to deal with this email.');
  return lines.join('\n');
}

async function fetchFullEmailRecord(ev) {
  if (!ev?.id) return ev;
  if (ev._fullLoaded && ev.bodyText) return ev;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    if (!data.event) return ev;
    const full = { ...data.event, _fullLoaded: true };
    const idx = emailState.allEvents.findIndex((e) => e.id === ev.id);
    if (idx !== -1) emailState.allEvents[idx] = full;
    return full;
  } catch {
    return ev;
  }
}

async function askAgentAboutEmail(ev) {
  const full = await fetchFullEmailRecord(ev);
  await askAgentWithPrompt(buildEmailAgentPrompt(full), {
    sourceEmailId: full.id || ev.id,
    sourceJobSlug: full.jobSlug || ev.jobSlug || null,
  });
}

async function markEmailJunk(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'junk', action: 'junk', status: 'JUNK' }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not mark junk', bodyHtml: escHtml(e.message) });
  }
}

async function archiveEmail(ev) {
  closeOpenSwipeRow();
  try {
    const patch = { action: 'filed', status: 'FILED' };
    if (ev.category === 'review') patch.category = 'internal';
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not archive', bodyHtml: escHtml(e.message) });
  }
}

async function unarchiveEmail(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'review', action: 'review', status: 'UNMATCHED' }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not unarchive', bodyHtml: escHtml(e.message) });
  }
}

function applyEmailPatchResult(id, event) {
  if (!event) return;
  const idx = emailState.allEvents.findIndex((e) => e.id === id);
  if (idx !== -1) emailState.allEvents[idx] = event;
  if (emailState.activeId === id && !filteredInboxEvents().some((e) => e.id === id)) {
    emailState.activeId = null;
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

async function markEmailReceipt(ev) {
  closeOpenSwipeRow();
  const amount = emailMonetaryAmount(ev);
  const routeNote = amount != null ? `Tax receipt — ${formatEmailUsd(amount)}` : 'Tax receipt';
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'receipt',
        action: 'receipt',
        status: 'RECEIPT',
        routeNote,
      }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Could not file receipt', bodyHtml: escHtml(e.message) });
  }
}

async function unmarkEmailReceipt(ev) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'review', action: 'review', status: 'UNMATCHED', routeNote: '' }),
    });
    const data = await readApiJson(res);
    applyEmailPatchResult(ev.id, data.event);
  } catch (e) {
    osAlert({ title: 'Update failed', bodyHtml: escHtml(e.message) });
  }
}

async function deleteEmail(ev) {
  closeOpenSwipeRow();
  const summary = ev.summary || ev.subject || ev.from || 'this message';
  const ok = await osConfirm({
    title: 'Delete message?',
    bodyHtml: `<p>Remove <strong>${escHtml(summary.slice(0, 80))}</strong> from the inbox log?</p>`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    await readApiJson(res);
    emailState.allEvents = emailState.allEvents.filter((e) => e.id !== ev.id);
    if (emailState.activeId === ev.id) emailState.activeId = null;
    renderEmailPanel();
    syncInboxAppBadge(emailState.allEvents);
  } catch (e) {
    osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

function bulkDeleteBannerBody(tab, count) {
  const label = tab.label.toLowerCase();
  if (tab.id === 'junk') {
    return `<p>${count} junk message${count === 1 ? '' : 's'} will be removed from the inbox log.</p>`;
  }
  return `<p>${count} ${escHtml(label)} message${count === 1 ? '' : 's'} will be removed from the inbox log.</p>`;
}

async function bulkDeleteInboxCategory(tab) {
  closeOpenSwipeRow();
  const events = inboxEventsForFilter();
  const count = events.length;
  if (count === 0 || tab.id === 'all') return;

  const ok = await showAdminConfirmBanner({
    title: `Delete all ${tab.label.toLowerCase()}?`,
    bodyHtml: bulkDeleteBannerBody(tab, count),
    confirmLabel: 'Delete all',
    danger: true,
  });
  if (!ok) return;

  const ids = events.map((ev) => ev.id);
  const idSet = new Set(ids);
  try {
    const res = await fetch('/api/email/inbox/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await readApiJson(res);
    emailState.allEvents = emailState.allEvents.filter((e) => !idSet.has(e.id));
    if (emailState.activeId && idSet.has(emailState.activeId)) emailState.activeId = null;
    renderEmailPanel();
    syncInboxAppBadge(emailState.allEvents);
    if (data.deleted < ids.length) {
      osAlert({
        title: 'Partial delete',
        bodyHtml: `<p>Removed ${data.deleted} of ${ids.length} messages. Reload to sync.</p>`,
      });
    }
  } catch (e) {
    osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
  }
}

function isEmailUnseen(ev) {
  return ev.category !== 'junk' && !ev.seenAt;
}

/** Dot ids for the current inbox visit — cleared when leaving the email tab. */
let inboxSessionDotIds = new Set();
let emailSeenObserver = null;
let pendingSeenIds = new Set();
let flushSeenTimer = null;

function seedInboxSessionDots() {
  for (const ev of emailState.allEvents) {
    if (isEmailUnseen(ev)) inboxSessionDotIds.add(ev.id);
  }
}

function showEmailNewDot(ev) {
  return inboxSessionDotIds.has(ev.id);
}

function clearInboxSessionDots() {
  void flushPendingEmailSeen();
  inboxSessionDotIds.clear();
  emailSeenObserver?.disconnect();
  emailSeenObserver = null;
}

function mergeEmailSeenFromServer(serverEvents) {
  const byId = new Map((serverEvents || []).map((ev) => [ev.id, ev]));
  for (const local of emailState.allEvents) {
    const remote = byId.get(local.id);
    if (remote?.seenAt) local.seenAt = remote.seenAt;
  }
}

function markEmailSeenLocal(id) {
  const ev = emailState.allEvents.find((e) => e.id === id);
  if (!ev || !isEmailUnseen(ev)) return false;
  ev.seenAt = new Date().toISOString();
  return true;
}

async function flushPendingEmailSeen() {
  flushSeenTimer = null;
  const ids = [...pendingSeenIds];
  pendingSeenIds.clear();
  if (!ids.length) return;
  try {
    await fetch('/api/email/inbox/mark-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch {}
}

function queueEmailSeen(id) {
  if (!id || !markEmailSeenLocal(id)) return;
  pendingSeenIds.add(id);
  updateInboxBadgesFromState();
  clearTimeout(flushSeenTimer);
  flushSeenTimer = setTimeout(() => { void flushPendingEmailSeen(); }, 400);
}

function bindEmailListSeenObserver(listEl) {
  emailSeenObserver?.disconnect();
  emailSeenObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.dataset.id;
        if (id) queueEmailSeen(id);
      }
    },
    { root: listEl, threshold: 0.55 },
  );
  listEl.querySelectorAll('.em-list-item').forEach((el) => {
    if (el.querySelector('.em-unseen-dot')) emailSeenObserver.observe(el);
  });
}

function createEmailListItem(ev) {
  const summary = ev.summary || ev.bodySnippet || ev.subject || '(no summary)';
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'em-list-item' +
    (ev.id === emailState.activeId ? ' active' : '') +
    (isProjectReplyEmail(ev) ? ' em-list-item-urgent' : '');
  item.dataset.id = ev.id;
  item.innerHTML =
    `<span class="em-item-row em-item-header">` +
      (showEmailNewDot(ev) ? '<span class="em-unseen-dot" aria-hidden="true"></span>' : '') +
      (isProjectReplyEmail(ev)
        ? '<span class="em-status em-project-reply">Client reply</span>'
        : `<span class="em-status ${emailCategoryClass(isEmailProject(ev) ? 'project' : ev.category)}">${escHtml(formatEmailCategoryLabel(ev))}</span>`) +
      (emailMonetaryAmount(ev) && ev.category !== 'receipt'
        ? `<span class="em-status em-money-hint">${escHtml(formatEmailUsd(emailMonetaryAmount(ev)))}</span>`
        : '') +
      (isEmailBooked(ev)
        ? '<span class="em-status em-book-scheduled">Scheduled ✓</span>'
        : isEmailBookable(ev)
          ? '<span class="em-status em-book-pending">Schedule pending</span>'
          : '') +
      `<span class="em-item-date">${escHtml(formatChatDate(ev.receivedAt))}</span>` +
      `<span class="em-item-from">${escHtml(formatEmailCardFrom(ev))}</span>` +
    `</span>` +
    `<span class="em-item-summary">${escHtml(summary)}</span>`;
  item.addEventListener('click', () => openEmailEvent(ev.id));
  return item;
}

function buildEmailSwipeActions(ev) {
  const actions = [
    swipeAgentAction(() => askAgentAboutEmail(ev)),
  ];

  if (ev.category !== 'junk') {
    actions.push(
      swipeArchiveAction({
        label: isEmailRouted(ev) ? 'Unarchive' : 'Archive',
        onClick: () => (isEmailRouted(ev) ? unarchiveEmail(ev) : archiveEmail(ev)),
      }),
    );
  }

  if (ev.category === 'receipt') {
    actions.push(
      swipeClearAction({
        label: 'Not receipt',
        onClick: () => unmarkEmailReceipt(ev),
      }),
    );
  }

  actions.push(
    swipeJunkAction({
      label: ev.category === 'junk' ? 'Not junk' : 'Junk',
      onClick: () => {
        if (ev.category === 'junk') {
          fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'review', action: 'review', status: 'UNMATCHED' }),
          })
            .then(readApiJson)
            .then((data) => applyEmailPatchResult(ev.id, data.event))
            .catch((err) => osAlert({ title: 'Update failed', bodyHtml: escHtml(err.message) }));
        } else {
          markEmailJunk(ev);
        }
      },
    }),
  );

  if (emailShowsReceiptAction(ev)) {
    actions.push(
      swipeReceiptAction({
        onClick: () => markEmailReceipt(ev),
      }),
    );
  }

  return actions;
}

function createEmailSwipeRow(ev) {
  return createSwipeRow(createEmailListItem(ev), buildEmailSwipeActions(ev));
}

function stopEmailPoll() {
  if (emailPollTimer) {
    clearInterval(emailPollTimer);
    emailPollTimer = null;
  }
}

function syncEmailPoll() {
  stopEmailPoll();
  if (MAP.type === 'email' && !document.hidden) {
    emailPollTimer = setInterval(() => loadEmailTab(true), 45000);
  }
}

async function loadEmailTab(quiet) {
  const root = getEmailPanel();
  if (!root) return;
  if (!quiet) root.innerHTML = '<div class="de-loading">Loading inbox…</div>';
  try {
    const res = await adminFetch('/api/email/inbox?junk=1');
    const data = await readAdminJson(res, 'Inbox');
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    emailState.allEvents = data.events || [];
    for (const id of pendingSeenIds) {
      const ev = emailState.allEvents.find((e) => e.id === id);
      if (ev && !ev.seenAt) ev.seenAt = new Date().toISOString();
    }
    emailState.storage = data.storage || 'files';
    emailState.digest = data.digest || null;
    emailState.pushConfigured = !!data.pushConfigured;
  } catch (e) {
    if (e.message === 'Session expired') return;
    if (!quiet) root.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    return;
  }
  if (!quiet) inboxSessionDotIds.clear();
  seedInboxSessionDots();
  const deepLinkId = pendingEmailDeepLinkId || parseEmailDeepLinkFromUrl();
  pendingEmailDeepLinkId = null;
  let openedFromDeepLink = false;
  if (deepLinkId) {
    openedFromDeepLink = await openEmailFromDeepLink(deepLinkId);
  } else if (emailState.activeId && !filteredInboxEvents().some((ev) => ev.id === emailState.activeId)) {
    emailState.activeId = null;
  }
  if (!openedFromDeepLink && !emailState.activeId) {
    getEmailPanel()?.classList.remove('em-pane-active');
  }
  renderEmailPanel();
  syncInboxAppBadge(emailState.allEvents);
}

function renderEmailFilterTabs() {
  const counts = inboxTabCounts();
  const nav = document.createElement('div');
  nav.className = 'em-filter-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Inbox filters');

  const tabs = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'alert', label: 'Alerts', count: counts.alert },
    { id: 'review', label: 'Review', count: counts.review },
    { id: 'book', label: 'Book', count: counts.book },
    { id: 'project', label: 'Projects', count: counts.project },
    { id: 'routed', label: 'Archive', count: counts.routed },
    { id: 'receipt', label: 'Receipts', count: counts.receipt },
    { id: 'junk', label: 'Junk', count: counts.junk },
  ];

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = emailState.inboxFilter === tab.id;
    const canBulkDelete = isActive && tab.id !== 'all' && tab.count > 0;
    btn.className =
      'em-filter-tab' +
      (isActive ? ' active' : '') +
      (canBulkDelete ? ' em-filter-tab--purge' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');

    if (canBulkDelete) {
      btn.innerHTML =
        `<span class="em-filter-tab-label">${escHtml(tab.label)}</span>` +
        `<span class="em-filter-purge-icon">${IOS_ICONS.trash}</span>`;
      btn.setAttribute('aria-label', `Delete all ${tab.label.toLowerCase()} messages`);
      btn.title = `Delete all ${tab.label.toLowerCase()} messages`;
      btn.addEventListener('click', () => bulkDeleteInboxCategory(tab));
    } else {
      btn.innerHTML = `${escHtml(tab.label)} <span class="em-filter-count">${tab.count}</span>`;
      btn.addEventListener('click', () => {
        if (emailState.inboxFilter === tab.id) return;
        emailState.inboxFilter = tab.id;
        emailState.activeId = null;
        emailState.composing = false;
        getEmailPanel()?.classList.remove('em-pane-active');
        renderEmailPanel();
      });
    }

    nav.appendChild(btn);
  }
  requestAnimationFrame(() => {
    nav.querySelector('.em-filter-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  return nav;
}

function renderEmailSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const counts = inboxTabCounts();
  const countForTab =
    emailState.inboxFilter === 'junk'
      ? counts.junk
      : emailState.inboxFilter === 'receipt'
        ? counts.receipt
        : emailState.inboxFilter === 'alert'
        ? counts.alert
        : emailState.inboxFilter === 'review'
          ? counts.review
          : emailState.inboxFilter === 'book'
            ? counts.book
            : emailState.inboxFilter === 'project'
              ? counts.project
            : emailState.inboxFilter === 'routed'
              ? counts.routed
              : counts.all;
  const subheader = listSearchSubheader({
    itemCount: countForTab,
    search: {
      value: emailState.search,
      placeholder: `Search ${countForTab} ${countForTab === 1 ? 'email' : 'emails'}`,
      onInput: (value) => {
        emailState.search = value;
        if (emailState.activeId && !filteredInboxEvents().some((ev) => ev.id === emailState.activeId)) {
          emailState.activeId = null;
          emailState.composing = false;
          getEmailPanel()?.classList.remove('em-pane-active');
        }
        renderEmailPanel();
      },
    },
    below: renderEmailFilterTabs(),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const events = filteredInboxEvents();
  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  for (const ev of events) {
    list.appendChild(createEmailSwipeRow(ev));
  }
  if (events.length === 0) {
    let emptyBody;
    if (emailState.search.trim()) {
      emptyBody = 'No matches.';
    } else if (emailState.inboxFilter === 'junk') {
      emptyBody = 'No junk messages.';
    } else if (emailState.inboxFilter === 'alert') {
      emptyBody = 'No alerts.';
    } else if (emailState.inboxFilter === 'review') {
      emptyBody = 'No messages need review.';
    } else if (emailState.inboxFilter === 'book') {
      emptyBody = 'No emails with a proposed meeting time.';
    } else if (emailState.inboxFilter === 'project') {
      emptyBody = 'No project emails yet. Create or link a project from an inbound message.';
    } else if (emailState.inboxFilter === 'routed') {
      emptyBody = 'No archived messages yet.';
    } else if (emailState.inboxFilter === 'receipt') {
      emptyBody = 'No tax receipts filed yet. Swipe a message with a dollar amount and tap Receipt.';
    } else {
      emptyBody =
        'No inbound email yet.<br><span class="em-hint">Forward or BCC copies to your Resend address (e.g. ' +
        escHtml(companyBrand().inboundEmailExample || 'inbox@mail.example.com') +
        ').</span>';
    }
    list.appendChild(createCenteredListEmpty({ innerHtml: emptyBody }));
  }
  attachIosPullToRefresh(list, () => {
    if (MAP.type !== 'email') return;
    return loadEmailTab(true);
  });
  sidebar.appendChild(list);
  bindEmailListSeenObserver(list);
  return sidebar;
}

function normalizeEmailRecipient(raw) {
  if (typeof raw === 'string') {
    const email = raw.trim().toLowerCase();
    return email ? { email, name: '', uid: null } : null;
  }
  if (raw && typeof raw === 'object' && raw.email) {
    const email = String(raw.email).trim().toLowerCase();
    if (!email) return null;
    return {
      email,
      name: String(raw.name || '').trim(),
      uid: raw.uid ? String(raw.uid) : null,
    };
  }
  return null;
}

function emailRecipientLabel(r) {
  return r.name || r.email;
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

let emailToSearchTimer = null;

/**
 * Multi-recipient To field: client autocomplete + removable chips.
 * Returns { getRecipients, focus }.
 */
function mountEmailToRecipientsPicker(parent, initial, onChange, opts = {}) {
  const disabled = opts.disabled === true;
  let recipients = (Array.isArray(initial) ? initial : [])
    .map(normalizeEmailRecipient)
    .filter(Boolean);
  let highlightIdx = -1;

  const wrap = document.createElement('div');
  wrap.className = 'em-compose-to-wrap';

  const chipsEl = document.createElement('div');
  chipsEl.className = 'em-compose-to-chips';

  const input = document.createElement('input');
  input.id = 'em-compose-to';
  input.type = 'text';
  input.className = 'em-compose-to-input';
  input.placeholder = 'Search clients or type an email…';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.disabled = disabled;

  const dropdown = document.createElement('div');
  dropdown.className = 'em-compose-to-dropdown';
  dropdown.style.display = 'none';
  dropdown.setAttribute('role', 'listbox');

  chipsEl.appendChild(input);
  wrap.appendChild(chipsEl);
  wrap.appendChild(dropdown);
  parent.appendChild(wrap);

  function syncPlaceholder() {
    input.placeholder = recipients.length ? 'Add another…' : 'Search clients or type an email…';
  }

  function hasRecipient(email) {
    const key = String(email || '').trim().toLowerCase();
    return recipients.some((r) => r.email === key);
  }

  function emitChange() {
    onChange?.(recipients.map((r) => ({ ...r })));
  }

  function addRecipient(recipient) {
    const next = normalizeEmailRecipient(recipient);
    if (!next || hasRecipient(next.email)) return false;
    recipients.push(next);
    renderChips();
    emitChange();
    return true;
  }

  function removeRecipient(email) {
    const key = String(email || '').trim().toLowerCase();
    const before = recipients.length;
    recipients = recipients.filter((r) => r.email !== key);
    if (recipients.length === before) return;
    renderChips();
    emitChange();
  }

  function renderChips() {
    chipsEl.querySelectorAll('.em-compose-to-chip').forEach((el) => el.remove());
    for (const r of recipients) {
      const chip = document.createElement('span');
      chip.className = 'em-compose-to-chip';
      const label = document.createElement('span');
      label.className = 'em-compose-to-chip-label';
      label.textContent = emailRecipientLabel(r);
      label.title = r.email;
      chip.appendChild(label);
      if (!disabled) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'em-compose-to-chip-remove';
        removeBtn.setAttribute('aria-label', `Remove ${emailRecipientLabel(r)}`);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          removeRecipient(r.email);
          input.focus();
        });
        chip.appendChild(removeBtn);
      }
      chipsEl.insertBefore(chip, input);
    }
    syncPlaceholder();
  }

  function setDropdownOpen(open) {
    dropdown.style.display = open ? 'block' : 'none';
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) highlightIdx = -1;
  }

  function pickClient(client) {
    const email = String(client?.email || '').trim().toLowerCase();
    if (!email) return;
    addRecipient({
      email,
      name: client.name || '',
      uid: client.uid || null,
    });
    input.value = '';
    setDropdownOpen(false);
    dropdown.innerHTML = '';
    input.focus();
  }

  function renderDropdown(clients, query) {
    dropdown.innerHTML = '';
    highlightIdx = -1;
    const q = query.trim();
    if (!clients.length && !q) {
      setDropdownOpen(false);
      return;
    }
    if (!clients.length) {
      const empty = document.createElement('div');
      empty.className = 'em-compose-to-empty';
      empty.textContent = q ? 'No matching clients.' : 'No clients yet.';
      dropdown.appendChild(empty);
      if (isValidEmailAddress(q) && !hasRecipient(q)) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'em-compose-to-option em-compose-to-option-add';
        addBtn.textContent = `Use ${q}`;
        addBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
        addBtn.addEventListener('click', () => {
          addRecipient({ email: q.toLowerCase(), name: '', uid: null });
          input.value = '';
          setDropdownOpen(false);
          dropdown.innerHTML = '';
          input.focus();
        });
        dropdown.appendChild(addBtn);
      }
      setDropdownOpen(true);
      return;
    }
    clients.forEach((c, idx) => {
      const email = String(c.email || '').trim().toLowerCase();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'em-compose-to-option';
      btn.dataset.idx = String(idx);
      btn.innerHTML =
        `${escHtml(c.name || 'Client')}` +
        `<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      if (!email) {
        btn.disabled = true;
        btn.classList.add('em-compose-to-option--disabled');
      } else if (hasRecipient(email)) {
        btn.disabled = true;
        btn.classList.add('em-compose-to-option--disabled');
      }
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => pickClient(c));
      dropdown.appendChild(btn);
    });
    if (isValidEmailAddress(q) && !hasRecipient(q)) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'em-compose-to-option em-compose-to-option-add';
      addBtn.textContent = `Use ${q}`;
      addBtn.addEventListener('mousedown', (ev) => ev.preventDefault());
      addBtn.addEventListener('click', () => {
        addRecipient({ email: q.toLowerCase(), name: '', uid: null });
        input.value = '';
        setDropdownOpen(false);
        dropdown.innerHTML = '';
        input.focus();
      });
      dropdown.appendChild(addBtn);
    }
    setDropdownOpen(true);
  }

  async function runSearch() {
    const q = input.value.trim();
    if (!q) {
      try {
        const res = await adminFetch('/api/clients?limit=20');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        renderDropdown(data.clients || [], '');
        return;
      } catch (e) {
        if (e.message === 'Session expired') return;
        dropdown.innerHTML = `<div class="em-compose-to-empty">${escHtml(e.message)}</div>`;
        setDropdownOpen(true);
      }
      return;
    }
    try {
      const params = new URLSearchParams({ q, limit: '20' });
      const res = await adminFetch(`/api/clients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderDropdown(data.clients || [], q);
    } catch (e) {
      if (e.message === 'Session expired') return;
      dropdown.innerHTML = `<div class="em-compose-to-empty">${escHtml(e.message)}</div>`;
      setDropdownOpen(true);
    }
  }

  function scheduleSearch() {
    clearTimeout(emailToSearchTimer);
    emailToSearchTimer = setTimeout(runSearch, 250);
  }

  function commitTypedRecipient() {
    const raw = input.value.trim().replace(/[,;]+$/, '').trim();
    if (!raw) return false;
    if (!isValidEmailAddress(raw)) return false;
    const added = addRecipient({ email: raw.toLowerCase(), name: '', uid: null });
    if (added) {
      input.value = '';
      setDropdownOpen(false);
      dropdown.innerHTML = '';
    }
    return added;
  }

  function highlightOption(nextIdx) {
    const options = [...dropdown.querySelectorAll('.em-compose-to-option:not(:disabled)')];
    if (!options.length) {
      highlightIdx = -1;
      return;
    }
    highlightIdx = ((nextIdx % options.length) + options.length) % options.length;
    options.forEach((btn, i) => btn.classList.toggle('active', i === highlightIdx));
    options[highlightIdx]?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', () => scheduleSearch());
  input.addEventListener('input', () => scheduleSearch());
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!wrap.contains(document.activeElement)) setDropdownOpen(false);
    }, 150);
  });
  input.addEventListener('keydown', (ev) => {
    const options = [...dropdown.querySelectorAll('.em-compose-to-option:not(:disabled)')];
    if (ev.key === 'ArrowDown') {
      if (dropdown.style.display !== 'none' && options.length) {
        ev.preventDefault();
        highlightOption(highlightIdx + 1);
      }
      return;
    }
    if (ev.key === 'ArrowUp') {
      if (dropdown.style.display !== 'none' && options.length) {
        ev.preventDefault();
        highlightOption(highlightIdx <= 0 ? options.length - 1 : highlightIdx - 1);
      }
      return;
    }
    if (ev.key === 'Enter' || ev.key === 'Tab' || ev.key === ',') {
      if (dropdown.style.display !== 'none' && highlightIdx >= 0 && options[highlightIdx]) {
        ev.preventDefault();
        options[highlightIdx].click();
        return;
      }
      if (ev.key === 'Enter' || ev.key === ',') {
        if (commitTypedRecipient()) ev.preventDefault();
      }
      return;
    }
    if (ev.key === 'Backspace' && !input.value && recipients.length) {
      removeRecipient(recipients[recipients.length - 1].email);
    }
  });

  renderChips();

  return {
    getRecipients: () => recipients.map((r) => ({ ...r })),
    focus: () => input.focus(),
  };
}

function parseEmailAddress(from) {
  const raw = String(from || '').trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw.toLowerCase();
  return raw.toLowerCase();
}

function buildReplySubjectClient(subject) {
  const s = String(subject || '').trim();
  if (/^re:\s/i.test(s)) return s;
  return `Re: ${s || '(no subject)'}`;
}

function buildReplyQuoteClient(ev) {
  const body = String(ev.bodyText || ev.bodySnippet || '').trim();
  if (!body) return '';
  const when = new Date(ev.receivedAt).toLocaleString();
  const from = ev.from || 'sender';
  const quoted = body.split('\n').map((line) => `> ${line}`).join('\n');
  return `\n\n---\nOn ${when}, ${from} wrote:\n${quoted}`;
}

function closeEmailCompose() {
  emailState.composing = false;
  emailState.replyToId = null;
  emailState.compose = { to: [], subject: '', body: '' };
  emailState.sending = false;
  getEmailPanel()?.classList.remove('em-pane-active');
  renderEmailPanel();
  syncFooterNav();
}

function startNewEmail() {
  emailState.activeId = null;
  emailState.composing = true;
  emailState.replyToId = null;
  emailState.compose = { to: [], subject: '', body: '' };
  emailState.sending = false;
  getEmailPanel()?.classList.add('em-pane-active');
  renderEmailPanel();
  syncFooterNav();
  requestAnimationFrame(() => {
    getEmailPanel()?.querySelector('.em-compose-to-input')?.focus();
  });
}

async function startReplyEmail(ev) {
  if (!ev?.id) return;
  emailState.activeId = ev.id;
  emailState.composing = true;
  emailState.replyToId = ev.id;
  emailState.sending = false;
  emailState.compose = { to: [], subject: '', body: '' };
  getEmailPanel()?.classList.add('em-pane-active');
  renderEmailPanel();
  syncFooterNav();

  const full = await fetchFullEmailRecord(ev);
  const toAddr = parseEmailAddress(
    (Array.isArray(full.replyTo) && full.replyTo[0]) || full.from || '',
  );
  emailState.compose = {
    to: toAddr ? [{ email: toAddr, name: '', uid: null }] : [],
    subject: buildReplySubjectClient(full.subject),
    body: buildReplyQuoteClient(full),
  };
  renderEmailPanel();
  requestAnimationFrame(() => {
    const bodyEl = getEmailPanel()?.querySelector('.em-compose-textarea');
    if (bodyEl) {
      bodyEl.focus();
      bodyEl.setSelectionRange(0, 0);
      bodyEl.scrollTop = 0;
    }
  });
}

async function sendEmailCompose() {
  const { to, subject, body } = emailState.compose;
  const recipients = (Array.isArray(to) ? to : [])
    .map(normalizeEmailRecipient)
    .filter(Boolean);
  const toEmails = recipients.map((r) => r.email);
  const subjectTrim = subject.trim();
  const bodyTrim = body.trim();
  if (!toEmails.length || !subjectTrim || !bodyTrim || emailState.sending) return;

  emailState.sending = true;
  renderEmailPanel();

  try {
    const payload = {
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      subject: subjectTrim,
      text: bodyTrim,
    };
    if (emailState.replyToId) payload.inReplyToEmailId = emailState.replyToId;
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readApiJson(res);
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const replyId = emailState.replyToId;
    closeEmailCompose();
    if (replyId) {
      try {
        const refresh = await fetch(`/api/email/inbox/${encodeURIComponent(replyId)}`, { cache: 'no-store' });
        const refreshed = await readApiJson(refresh);
        if (refreshed.event) {
          emailState.activeId = replyId;
          applyEmailPatchResult(replyId, refreshed.event);
        }
      } catch {
        await loadEmailTab();
        emailState.activeId = replyId;
        renderEmailPanel();
      }
      showChatToast('Reply sent');
    } else {
      showChatToast('Email sent');
    }
  } catch (e) {
    emailState.sending = false;
    renderEmailPanel();
    osAlert({ title: 'Could not send email', bodyHtml: escHtml(e.message) });
  }
}

function emailShareText(ev) {
  return [ev.subject, ev.from, ev.summary || ev.bodySnippet].filter(Boolean).join('\n\n');
}

function renderEmailComposePane(pane) {
  pane.appendChild(
    createPaneSubheader({
      back: { label: 'Back to inbox', onClick: () => closeEmailCompose() },
      title: emailState.replyToId ? 'Reply' : 'New message',
    }).header,
  );

  const form = document.createElement('div');
  form.className = 'em-compose';

  const toField = document.createElement('div');
  toField.className = 'em-compose-field';
  toField.innerHTML = '<label class="em-compose-label" for="em-compose-to">To</label>';
  mountEmailToRecipientsPicker(
    toField,
    emailState.compose.to,
    (next) => {
      emailState.compose.to = next;
    },
    { disabled: emailState.sending },
  );

  const subjectField = document.createElement('div');
  subjectField.className = 'em-compose-field';
  subjectField.innerHTML = '<label class="em-compose-label" for="em-compose-subject">Subject</label>';
  const subjectInput = document.createElement('input');
  subjectInput.id = 'em-compose-subject';
  subjectInput.type = 'text';
  subjectInput.className = 'em-compose-input';
  subjectInput.placeholder = 'Subject';
  subjectInput.value = emailState.compose.subject;
  subjectInput.disabled = emailState.sending;
  subjectInput.addEventListener('input', () => {
    emailState.compose.subject = subjectInput.value;
  });
  subjectField.appendChild(subjectInput);

  const bodyField = document.createElement('div');
  bodyField.className = 'em-compose-field';
  bodyField.innerHTML = '<label class="em-compose-label" for="em-compose-body">Message</label>';
  const bodyInput = document.createElement('textarea');
  bodyInput.id = 'em-compose-body';
  bodyInput.className = 'em-compose-textarea';
  bodyInput.placeholder = 'Write your message…';
  bodyInput.value = emailState.compose.body;
  bodyInput.disabled = emailState.sending;
  bodyInput.addEventListener('input', () => {
    emailState.compose.body = bodyInput.value;
  });
  bodyField.appendChild(bodyInput);

  const hint = document.createElement('p');
  hint.className = 'em-compose-hint';
  hint.textContent = emailState.replyToId
    ? 'Reply is sent in the same thread when the original message ID is available. The message is marked handled after send.'
    : 'Sent via Resend using your configured outbound address.';

  const actions = document.createElement('div');
  actions.className = 'em-compose-actions';
  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'em-compose-send';
  sendBtn.setAttribute('aria-label', emailState.sending ? 'Sending…' : 'Send');
  sendBtn.title = emailState.sending ? 'Sending…' : 'Send';
  sendBtn.innerHTML = IOS_ICONS.send || '';
  sendBtn.disabled = emailState.sending;
  sendBtn.addEventListener('click', () => void sendEmailCompose());

  actions.appendChild(sendBtn);
  form.appendChild(toField);
  form.appendChild(subjectField);
  form.appendChild(bodyField);
  form.appendChild(hint);
  form.appendChild(actions);
  pane.appendChild(form);
}

function openEmailEvent(id) {
  queueEmailSeen(id);
  emailState.activeId = id;
  emailState.composing = false;
  emailState.replyToId = null;
  renderEmailPanel();
}

function renderEmailPanel() {
  const root = getEmailPanel();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  root.innerHTML = '';
  root.appendChild(renderEmailSidebar());

  const pane = document.createElement('div');
  pane.className = 'ch-pane';

  if (emailState.composing) {
    renderEmailComposePane(pane);
    root.appendChild(pane);
    getEmailPanel()?.classList.add('em-pane-active');
    syncFooterNav();
    finishSidebarListScroll(root, savedSidebarScroll);
    return;
  }

  const ev = emailState.allEvents.find((e) => e.id === emailState.activeId);
  if (!ev) {
    appendEmptyDetailPane(pane, {
      mapKey: 'email',
      iconName: 'mail',
      bodyHtml:
        '<p>Select a message or compose a new one.</p>' +
        '<p class="em-hint">Inbound mail arrives via Resend — forward or BCC to your receiving address.</p>',
      btnLabel: 'Compose',
      onCreate: () => startNewEmail(),
    });
    root.appendChild(pane);
    getEmailPanel()?.classList.remove('em-pane-active');
    syncFooterNav();
    finishSidebarListScroll(root, savedSidebarScroll);
    return;
  }

  const agentBtn = document.createElement('button');
  agentBtn.type = 'button';
  agentBtn.setAttribute('aria-label', 'Agent');
  agentBtn.title = 'Agent';
  agentBtn.innerHTML = navIcon('agent', 16);
  agentBtn.addEventListener('click', () => askAgentAboutEmail(ev));

  const beforeIcons = [];
  if (shouldShowEmailProjectActions(ev)) {
    agentBtn.className = 'em-btn-group-segment em-agent-btn';
    const group = document.createElement('div');
    group.className = 'em-btn-group';
    group.appendChild(agentBtn);
    group.appendChild(createEmailProjectDropdown(ev));
    beforeIcons.push(group);
  } else {
    agentBtn.className = 'de-new-btn em-agent-btn em-header-action-btn';
    beforeIcons.push(agentBtn);
  }

  pane.appendChild(
    createPaneSubheader({
      back: {
        label: 'Back to inbox',
        onClick: () => {
          emailState.activeId = null;
          emailState.composing = false;
          getEmailPanel()?.classList.remove('em-pane-active');
          renderEmailPanel();
        },
      },
      title: ev.subject || '(no subject)',
      beforeIcons,
      icons: [
        createIosIconBtn({
          iconKey: 'reply',
          label: 'Reply',
          className: 'ios-icon-btn em-reply-btn',
          onClick: () => void startReplyEmail(ev),
        }),
        paneShareIcon({
          label: 'Share message',
          onClick: (btn) => shareChatText(emailShareText(ev), 'assistant', btn),
        }),
        paneDeleteIcon({
          label: 'Delete message',
          onClick: () => deleteEmail(ev),
        }),
      ],
    }).header,
  );

  const detail = document.createElement('div');
  detail.className = 'em-detail';
  const summary = ev.summary || ev.bodySnippet || '';
  let detailHtml =
    `<div class="em-item-row"><span class="em-status ${isProjectReplyEmail(ev) ? 'em-project-reply' : emailCategoryClass(isEmailProject(ev) ? 'project' : ev.category)}">${escHtml(formatEmailCategoryLabel(ev))}</span>` +
    (isEmailBooked(ev) ? '<span class="em-status em-book-scheduled">Scheduled ✓</span>' : '') +
    `</div>`;
  if (isEmailBookable(ev)) {
    const whenLabel =
      ev.bookingStart || ev.proposedMeetingStart
        ? formatScheduleWhen(ev.bookingStart || ev.proposedMeetingStart)
        : ev.schedulingNote || 'Meeting time pending';
    detailHtml +=
      `<div class="em-book-card">` +
        `<div class="em-book-card-title">${isEmailBooked(ev) ? 'Meeting scheduled' : 'Meeting requested'}</div>` +
        `<div class="em-book-card-when">${escHtml(whenLabel)}</div>` +
        (ev.schedulingNote && (ev.bookingStart || ev.proposedMeetingStart)
          ? `<div class="em-book-card-note">${escHtml(ev.schedulingNote)}</div>`
          : '') +
        (isEmailBooked(ev) && ev.bookingUid
          ? `<div class="em-hint">Cal.com booking · ${escHtml(ev.bookingUid.slice(0, 8))}…</div>`
          : '') +
      `</div>`;
  }
  detailHtml +=
    (summary ? `<div class="em-detail-summary">${linkifyPlainText(summary)}</div>` : '');
  if (isMeetingPendingConfirm(ev)) {
    detailHtml +=
      `<div class="em-schedule-actions em-schedule-actions-confirm">` +
        `<button type="button" class="em-schedule-action-primary de-new-btn">Confirm</button>` +
        `<button type="button" class="em-schedule-action-secondary de-new-btn">Reschedule</button>` +
      `</div>`;
  } else if (isEmailSchedulingRequest(ev) && !isEmailBooked(ev)) {
    detailHtml +=
      `<div class="em-schedule-actions">` +
        `<button type="button" class="em-schedule-action-primary de-new-btn" disabled>Checking availability…</button>` +
        `<button type="button" class="em-schedule-action-secondary de-new-btn">Suggest alternate time</button>` +
      `</div>`;
  }
  detailHtml +=
    `<div class="em-detail-subject">${escHtml(ev.subject || '(no subject)')}</div>` +
    `<div class="em-detail-meta">` +
      `<span><strong>From</strong> ${escHtml(ev.from || '(unknown)')}</span>` +
      (Array.isArray(ev.to) && ev.to.length
        ? `<span><strong>To</strong> ${escHtml(ev.to.join(', '))}</span>`
        : '') +
      (ev.contactName ? `<span><strong>Client</strong> ${escHtml(ev.contactName)}</span>` : '') +
      (ev.jobTitle || ev.jobSlug
        ? `<span class="em-detail-project"><strong>Project</strong> <button type="button" class="project-link-chip em-project-link">${escHtml(ev.jobTitle || ev.jobSlug)}</button></span>`
        : '') +
      `<span><strong>Received</strong> ${escHtml(new Date(ev.receivedAt).toLocaleString())}</span>` +
      `<span><strong>Action</strong> ${escHtml(formatEmailAction(ev))}</span>` +
      (ev.routeNote ? `<span><strong>Route</strong> ${escHtml(ev.routeNote)}</span>` : '') +
    `</div>` +
    ((ev.bodyText || ev.bodySnippet) && (ev.bodyText || ev.bodySnippet) !== summary
      ? `<div class="em-detail-body">${linkifyPlainText(ev.bodyText || ev.bodySnippet)}</div>`
      : '');
  detail.innerHTML = detailHtml;
  if (!ev._fullLoaded) {
    void fetchFullEmailRecord(ev).then((full) => {
      if (emailState.activeId === full.id) renderEmailPanel();
    });
  }
  void mountEmailScheduleActions(detail.querySelector('.em-schedule-actions'), ev);
  detail.querySelector('.em-project-link')?.addEventListener('click', () =>
    navigateToWork(ev.jobSlug, { fromEmailId: ev.id }),
  );
  pane.appendChild(detail);

  root.appendChild(pane);
  getEmailPanel()?.classList.add('em-pane-active');
  syncFooterNav();
  finishSidebarListScroll(root, savedSidebarScroll);
}

// ---- persistence ----
function savePositions() {
  const pos = {};
  for (const n of byId.values()) pos[n.id] = { x: n.x, y: n.y };
  try {
    localStorage.setItem(storeKey(), JSON.stringify(pos));
  } catch {}
}
function loadPositions() {
  let pos;
  try {
    pos = JSON.parse(localStorage.getItem(storeKey()) || 'null');
  } catch {
    pos = null;
  }
  if (!pos) return;
  for (const n of byId.values()) {
    if (pos[n.id]) {
      n.x = pos[n.id].x;
      n.y = pos[n.id].y;
    }
  }
}
function loadActiveKey() {
  try {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && MAPS[tab]) return tab;
  } catch {}
  let key;
  try {
    key = localStorage.getItem(MAP_STORE);
  } catch {
    key = null;
  }
  return MAPS[key] ? key : 'home';
}
function saveActiveKey() {
  try {
    localStorage.setItem(MAP_STORE, activeKey);
  } catch {}
}

// ---- init ----
async function rebuildTabsForViewport() {
  const order = await resolveTabOrder();
  cachedTabOrder = order;
  buildTabs(order);
  if (activeKey === 'home') loadHomeDashboard();
}

function showBootError(err) {
  console.error('[admin] boot failed', err);
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'position:fixed;inset:auto 0 0 0;z-index:99999;padding:0.75rem 1rem;background:#7f1d1d;color:#fecaca;font:600 0.85rem/1.45 ui-sans-serif,system-ui,sans-serif;border-top:1px solid #991b1b';
  banner.textContent =
    'Admin failed to start (JavaScript error). Hard-refresh the page. If it persists, clear site data for this domain.';
  document.body?.appendChild(banner);
}

async function boot() {
  const tabOrder = await resolveTabOrder();
  cachedTabOrder = tabOrder;
  buildTabs(tabOrder);
  initTopbarMenus();
  initDeployIndicator();
  initFooterNav();
  initFooterNavScrollCollapse();
  initChatComposeFocusLayout();
  initSearchOverlay();
  MOBILE_TABS_MQ.addEventListener('change', rebuildTabsForViewport);
  MOBILE_TABS_MQ.addEventListener('change', syncTopbarPanelContext);
  MOBILE_TABS_MQ.addEventListener('change', () => {
    syncAdminSplitView(MAP?.type);
    scanPanelSidebars();
  });
  COMPACT_TABS_MQ.addEventListener('change', rebuildTabsForViewport);
  initSidebarLayout();
  initModelSelector();
  syncCanvasVisibility();
  activateMapPanel();
  syncHealthLifecycle();
  syncEmailPoll();
  syncInboxBadgePoll();
  syncFooterNav();
  syncProfileMenuActive();
  syncTopbarPanelContext();
  syncAdminSplitView(MAP?.type);
  scanPanelSidebars();
}

boot().catch(showBootError);

window.addEventListener('pageshow', () => {
  const emailId = parseEmailDeepLinkFromUrl();
  if (!emailId || MAP?.type !== 'email' || emailState.activeId === emailId) return;
  if (emailState.allEvents.length) void openEmailFromDeepLink(emailId);
  else pendingEmailDeepLinkId = emailId;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(() => refreshInboxBadgeQuiet())
    .catch(() => undefined);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'reave-inbox-push') refreshInboxBadgeQuiet(true);
    if (event.data?.type === 'reave-notification-open') handleNotificationOpen(event.data.url);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopHealth();
    stopEmailPoll();
    stopInboxBadgePoll();
    stopDeployPoll();
  } else {
    syncHealthLifecycle();
    syncEmailPoll();
    syncInboxBadgePoll();
    startDeployPoll();
  }
});
