import { MAPS, SYSTEM_MAP_KEYS, SYSTEM_TAB_SLOT, CHAT_MAP_KEYS, CHAT_TAB_SLOT } from '/admin/os-map-data.js';
import { createClientMap } from '/admin/client-map.js';
import { createFleetMap } from '/admin/fleet-map.js';

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
  const domainPlaceholder = /(?:reave|example)\.app/g;
  for (const map of Object.values(MAPS)) {
    for (const node of map.nodes || []) {
      if (typeof node.sub === 'string') {
        node.sub = node.sub
          .replace(domainPlaceholder, domain)
          .replace(/ap\.(?:reave|example)\.app/g, domain ? `ap.${domain}` : 'ap.example.com')
          .replace(/cal\.(?:reave|example)\.app/g, domain ? `cal.${domain}` : 'cal.example.com');
        const githubRepo = window.__githubRepo?.trim();
        if (githubRepo) {
          node.sub = node.sub.replace(/[\w.-]+\/[\w.-]+(?= · REST)/, githubRepo);
        }
      }
      if (typeof node.title === 'string') {
        node.title = node.title
          .replace(/Reave App/g, projectLabel)
          .replace(/^Production app$/, projectLabel);
      }
    }
    for (const group of map.groups || []) {
      if (typeof group.title === 'string') {
        group.title = group.title
          .replace(/Reave App/g, projectLabel)
          .replace(/^Railway — App$/, `Railway — ${projectLabel}`);
      }
    }
  }
  if (MAPS.finance) {
    const crater = window.__craterFinanceUrl?.trim().replace(/\/$/, '');
    if (crater) MAPS.finance.link = crater;
    else if (domain) MAPS.finance.link = `https://ap.${domain}`;
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
} from './admin-ui.js?v=20260728i';
import { showAdminConfirmBanner } from './push-client.js?v=20250715b';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=20260728i';
import {
  initWorkPanel,
  workState,
  loadWorkTab,
  navigateToWork,
  navigateToNewWorkFromTodo,
  startNewProject,
  refreshWorkLinkTrackStatus,
  mountClientWorkSection,
  queueWorkDeepLink,
} from './work-panel.js?v=20260728i';
import {
  initTodoPanel,
  todoState,
  loadTodoTab,
  navigateToTodo,
  navigateToNewTodoForProject,
  normalizeTodoItemDates,
  todoSubline,
  flushTodoAutosave,
  saveActiveTodoDraft,
  formatTodoDueDate,
} from './todo-panel.js?v=20260728i';
import {
  initDocumentsPanel,
  docState,
  loadDocumentsTab,
} from './documents-panel.js?v=20260728i';
import {
  initKnowledgePanel,
  knowledgeState,
  loadKnowledgeTab,
} from './knowledge-panel.js?v=20260728i';
import {
  initSchedulePanel,
  scheduleState,
  loadScheduleTab,
} from './schedule-panel.js?v=20260728i';
import {
  initClientsPanel,
  clientState,
  loadClientsTab,
  navigateToClient,
} from './clients-panel.js?v=20260728i';
import {
  initChatPanel,
  chatState,
  loadChatsTab,
  navigateToChat,
  renderChatPanel,
  syncChatRunningPoll,
  stopChatRunningPoll,
  showChatToast,
  copyChatText,
  formatChatDate,
  finalizeChatTitleIfNeeded,
  abandonDisposableChat,
  fetchChatThreads,
  createHeaderChatTitle,
  deleteChat,
  createPortalShareBtn,
  renderLinkTrackStatus,
  sharePortalLink,
  queueChatDeepLink,
} from './chat-panel.js?v=20260728i';

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
  fleet: 'truck',
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
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="M10.5 13.5 7 17"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
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
  if (prevType === 'fleet' && MAP.type !== 'fleet') {
    stopFleetPoll();
    if (fleetMapInstance) {
      fleetMapInstance.destroy();
      fleetMapInstance = null;
    }
  }
  activateMapPanel(opts);
  syncHealthLifecycle();
  syncEmailPoll();
  syncChatRunningPoll();
  syncFooterNav();
  syncProfileMenuActive();
  syncTopbarPanelContext();
  syncAdminSplitView(MAP?.type);
  if (MAP.type !== 'email') {
    emailState.composing = false;
  }
  if (key !== 'chats') {
    setChatComposeFocused(false);
    if (prevType === 'chats' && !chatState.sending) {
      void finalizeChatTitleIfNeeded(chatState.activeId).then(() =>
        abandonDisposableChat(chatState.activeId),
      );
    }
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
    t === 'fleet' ||
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
  } else if (MAP.type === 'fleet') {
    loadFleetTab();
  } else if (MAP.type === 'chats') {
    if (opts.chatId) queueChatDeepLink(opts.chatId);
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
    MAP.type === 'fleet' ||
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
  setPanelDisplay('fleet-panel', MAP.type === 'fleet' ? 'flex' : 'none');
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

}

/** Flat tab keys for the home dashboard grid (all sections, no collapsed slots). */
function dashboardTabKeys(order) {
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
  for (const key of dashboardTabKeys(order || cachedTabOrder || defaultTabKeys())) {
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

function formatDashTodoWhen(raw) {
  const d = parseTodoDueInstant(raw);
  if (!d) return '';
  const now = new Date();
  const dueDay = isUtcDateOnlyInstant(raw, d)
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toDateString()
    : d.toDateString();
  if (d.getTime() < now.getTime() && dueDay !== now.toDateString()) return 'Overdue';
  if (dueDay === now.toDateString()) {
    const time = formatTodoDueTime(d);
    return time || 'Today';
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueDay === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dashTodoSubline(todo) {
  const bits = ['To-do'];
  if (todo.section) bits.push(todo.section);
  if (todo.assignee) bits.push(todo.assignee);
  if (todo.priority && todo.priority !== 'normal') {
    bits.push(TODO_PRIORITY_LABELS[todo.priority] || todo.priority);
  }
  return bits.join(' · ');
}

function buildDashTodayGroups(events, todos) {
  const todoItems = [];
  for (const todo of todos) {
    if (!todo?.due_date) continue;
    todoItems.push(todo);
  }
  todoItems.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const eventItems = [];
  for (const ev of events) {
    if (!ev?.time) continue;
    eventItems.push(ev);
  }
  eventItems.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return { todos: todoItems, events: eventItems };
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

function formatReviewAlertWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

let uptimePlatformSyncPollTimer = null;
let uptimePlatformSyncActive = false;

const UPTIME_SYNC_SITES_BTN_SELECTOR = '.dash-uptime-sync-sites-btn';

function uptimeMonitorTileMeta(m) {
  if (m?.tile_label) return { offline: m.is_offline === true, label: m.tile_label };
  const status = Number(m?.status);
  if (status === 0) return { offline: true, label: 'offline' };
  if (status === 8 || status === 9 || m?.is_down) return { offline: true, label: 'down' };
  if (m?.uptime_ratio_7d != null) return { offline: false, label: `${Number(m.uptime_ratio_7d).toFixed(1)}%` };
  return { offline: false, label: 'up' };
}

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
      const result = data.result ?? data;
      const created = data.created ?? result?.created ?? 0;
      void showUptimeSyncResultDialog(result);
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

// Mirror of uptimeQuickStartUrl() in src/lib/uptimerobotClient.ts — used as a
// fallback if the server payload predates the quickStartUrl field. (The server
// version also prefills &email= from UPTIMEROBOT_ALERT_EMAIL when configured.)
function uptimeQuickStartUrlClient(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return 'https://uptimerobot.com/quick-monitor-setup/';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return `https://uptimerobot.com/quick-start?url=${encodeURIComponent(url)}`;
}

function normalizeUptimeUrlClient(raw) {
  let url = String(raw || '').trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

/** Actionable error copy for Add site — includes quick-start when API create is blocked. */
function uptimeAddSiteErrorHtml(url, message) {
  const msg = String(message || 'Could not add site');
  const lower = msg.toLowerCase();
  if (
    /free plan|not allowed to use some settings|not allowed on your uptimerobot plan|blocks api/i.test(
      lower,
    )
  ) {
    const quickStart = uptimeQuickStartUrlClient(url);
    return (
      `<p>${escHtml(msg)}</p>` +
      '<p class="em-book-dialog-lead">UptimeRobot\u2019s free plan blocks API monitor creation. ' +
      'Use the one-click link below, confirm via the email UptimeRobot sends, then tap ' +
      '<strong>Sync status</strong> on the dashboard to import it.</p>' +
      `<p><a class="os-dialog-btn os-dialog-btn--primary" href="${escHtml(quickStart)}" ` +
      'target="_blank" rel="noopener noreferrer">Add to UptimeRobot ↗</a></p>'
    );
  }
  return escHtml(msg);
}

async function showUptimeSyncResultDialog(result) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return;

  const httpOk = result?.ok !== false || (result?.created ?? 0) > 0 || (result?.skipped ?? 0) > 0;
  const manualItems = Array.isArray(result?.manualItems) ? result.manualItems : [];
  titleEl.textContent = manualItems.length ? 'Site sync — manual setup needed' : 'Site sync complete';
  bodyEl.innerHTML = renderUptimeSyncResultHtml(result, httpOk);
  actionsEl.innerHTML = '';

  if (manualItems.length) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
    copyBtn.textContent = 'Copy URLs';
    copyBtn.addEventListener('click', async () => {
      const text = manualItems.map((item) => item.url).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied';
        window.setTimeout(() => {
          copyBtn.textContent = 'Copy URLs';
        }, 1800);
      } catch {
        await osAlert({ title: 'Copy failed', bodyHtml: '<p>Could not access clipboard.</p>' });
      }
    });
    actionsEl.appendChild(copyBtn);

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
    linkBtn.textContent = 'Link monitor';
    linkBtn.addEventListener('click', () => {
      closeOsDialogBackdrop();
      void showLinkUptimeMonitorDialog();
    });
    actionsEl.appendChild(linkBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'os-dialog-btn os-dialog-btn--primary';
  closeBtn.textContent = 'Done';
  closeBtn.addEventListener('click', () => closeOsDialogBackdrop());
  actionsEl.appendChild(closeBtn);
  openOsDialogBackdrop();
  closeBtn.focus();
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

  const manualItems = Array.isArray(data.manualItems) ? data.manualItems : [];
  const manualLines = manualItems
    .slice(0, 30)
    .map((item) => {
      const quickStart = item.quickStartUrl || uptimeQuickStartUrlClient(item.url);
      return (
        '<li class="dash-uptime-manual-item">' +
        `<span class="dash-uptime-manual-name"><strong>${escHtml(item.friendlyName)}</strong>` +
        `<span class="dash-muted-inline"> ${escHtml(item.url)}</span></span>` +
        `<a class="os-dialog-btn os-dialog-btn--primary os-dialog-btn--sm" href="${escHtml(quickStart)}" ` +
        'target="_blank" rel="noopener noreferrer">Add to UptimeRobot ↗</a>' +
        '</li>'
      );
    })
    .join('');
  const manualBlock = manualItems.length
    ? '<div class="dash-uptime-manual">' +
      '<p class="em-book-dialog-lead">UptimeRobot\u2019s free plan blocks creating monitors through the API, so these can\u2019t be added automatically. ' +
      'Click <strong>Add to UptimeRobot</strong> on each site \u2014 it opens UptimeRobot\u2019s one-click quick-start ' +
      '(solves the challenge in your browser). Confirm via the email UptimeRobot sends, then click ' +
      '<strong>Sync status</strong> here to import them.</p>' +
      `<ul class="meeting-confirm-steps dash-uptime-manual-list">${manualLines}</ul>` +
      '</div>'
    : '';

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
    manualBlock +
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
  if (item?.alertId) {
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      if (prevLabel) btn.textContent = 'Archiving…';
    }
    try {
      await dismissPushAlertById(item.alertId);
    } catch (e) {
      await osAlert({ title: 'Could not archive', bodyHtml: escHtml(e.message || String(e)) });
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevLabel) btn.textContent = prevLabel;
      }
    }
    return;
  }
  if (item?.engagementId) {
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      if (prevLabel) btn.textContent = 'Dismissing…';
    }
    try {
      const res = await fetch(`/api/admin/engagement/${encodeURIComponent(item.engagementId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      removeReviewAlertBanner(null, null, item.engagementId);
      syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
    } catch (e) {
      await osAlert({ title: 'Could not dismiss', bodyHtml: escHtml(e.message || String(e)) });
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevLabel) btn.textContent = prevLabel;
      }
    }
    return;
  }
  if (item?.commentId) {
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      if (prevLabel) btn.textContent = 'Dismissing…';
    }
    try {
      const res = await fetch(`/api/work/comments/${encodeURIComponent(item.commentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      removeReviewAlertBanner(null, item.commentId);
      syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
    } catch (e) {
      await osAlert({ title: 'Could not dismiss', bodyHtml: escHtml(e.message || String(e)) });
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevLabel) btn.textContent = prevLabel;
      }
    }
    return;
  }
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
    removeReviewAlertBanner(item.emailId);
    syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
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
      `<span class="meeting-confirm-project-picker-meta">${escHtml(workStatusLabel(job.status))}</span>`;
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
  if (type === 'push_alert') return 'confirm';
  if (type === 'meeting_conflict') return 'confirm';
  if (
    type === 'project' ||
    type === 'project_match' ||
    type === 'project_comment' ||
    type === 'vault_entry' ||
    type === 'share_open' ||
    type === 'deck_view' ||
    type === 'contact_form'
  ) {
    return 'pwa';
  }
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
    case 'project_match':
      return 'link';
    case 'project_comment':
      return 'message-circle';
    case 'vault_entry':
      return 'key';
    case 'share_open':
      return 'eye';
    case 'deck_view':
      return 'monitor';
    case 'contact_form':
      return 'mail';
    case 'push_alert':
      return 'alert-triangle';
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
  if (item.type === 'push_alert' && item.url) {
    handleNotificationOpen(item.url);
    return;
  }
  if (
    (item.type === 'project' ||
      item.type === 'project_match' ||
      item.type === 'project_comment' ||
      item.type === 'share_open' ||
      item.type === 'contact_form') &&
    item.jobSlug
  ) {
    navigateToWork(item.jobSlug, { fromEmailId: item.emailId || null });
    return;
  }
  if ((item.type === 'vault_entry' || item.type === 'deck_view') && item.contactUid) {
    navigateToClient(item.contactUid);
    return;
  }
  if (item.emailId) setActiveMap('email', { force: true, emailId: item.emailId });
}

function buildReviewAlertBanner(item) {
  const alert = document.createElement('div');
  alert.className = `admin-setup-alert admin-setup-alert--${reviewAlertVariant(item.type)}`;
  alert.setAttribute('role', 'status');
  if (item.emailId) alert.setAttribute('data-review-email-id', item.emailId);
  if (item.commentId) alert.setAttribute('data-review-comment-id', item.commentId);
  if (item.engagementId) alert.setAttribute('data-review-engagement-id', item.engagementId);
  if (item.alertId) alert.setAttribute('data-review-alert-id', item.alertId);

  const iconWrap = document.createElement('div');
  iconWrap.className = 'admin-setup-alert-icon';
  iconWrap.dataset.type = item.type;
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.innerHTML = navIcon(reviewAlertIconName(item.type), 18);

  const copy = document.createElement('div');
  copy.className = 'admin-setup-alert-copy';
  const when = formatReviewAlertWhen(item.receivedAt);
  const titleLine = when
    ? `${escHtml(when)} - ${escHtml(item.title)}`
    : escHtml(item.title);
  copy.innerHTML =
    `<strong>${titleLine}</strong>` +
    `<p>${escHtml(item.detail)}</p>`;
  copy.addEventListener('click', () => openReviewNotificationTarget(item));

  const actions = document.createElement('div');
  actions.className = 'admin-setup-alert-actions';

  const isProject = item.type === 'project';
  const isProjectMatch = item.type === 'project_match';
  const isProjectComment = item.type === 'project_comment';
  const isVaultEntry = item.type === 'vault_entry';
  const isShareOpen = item.type === 'share_open';
  const isDeckView = item.type === 'deck_view';
  const isContactForm = item.type === 'contact_form';
  const isMeetingFollowup = item.type === 'meeting_followup';
  const isMeetingRequest = item.type === 'meeting_request' || item.type === 'meeting_conflict';
  const isAutoBookedMeeting = item.type === 'meeting';
  const isPushAlert = item.type === 'push_alert';

  if (isPushAlert) {
    appendReviewAlertAction(actions, {
      label: 'View',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
    appendReviewAlertAction(actions, {
      label: 'Archive',
      onClick: (actionBtn) => void dismissReviewNotification(item, actionBtn),
    });
  } else if (isProjectComment || isShareOpen || isContactForm) {
    appendReviewAlertAction(actions, {
      label: 'View project',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isVaultEntry) {
    appendReviewAlertAction(actions, {
      label: 'View vault',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isDeckView && item.contactUid) {
    appendReviewAlertAction(actions, {
      label: 'View client',
      primary: true,
      onClick: () => openReviewNotificationTarget(item),
    });
  } else if (isProjectMatch) {
    appendReviewAlertAction(actions, {
      label: 'Add to project',
      primary: true,
      onClick: (btn) => void confirmSuggestedProjectMatch(item, btn),
    });
    appendReviewAlertAction(actions, {
      label: 'Not this project',
      onClick: (btn) => void rejectSuggestedProjectMatch(item, btn),
    });
  } else if (isProject) {
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
  bindReviewAlertSwipe(alert, item);
  return alert;
}

function bindReviewAlertSwipe(alert, item) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  alert.addEventListener(
    'touchstart',
    (ev) => {
      if (ev.touches.length !== 1) return;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      tracking = true;
      alert.style.transition = 'none';
    },
    { passive: true },
  );

  alert.addEventListener(
    'touchmove',
    (ev) => {
      if (!tracking || ev.touches.length !== 1) return;
      const dx = ev.touches[0].clientX - startX;
      const dy = ev.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
        alert.style.transform = '';
        alert.style.opacity = '';
        return;
      }
      if (dx > 0) {
        alert.style.transform = `translateX(${Math.min(dx, 120)}px)`;
        alert.style.opacity = String(Math.max(0.35, 1 - dx / 180));
      }
    },
    { passive: true },
  );

  alert.addEventListener(
    'touchend',
    (ev) => {
      if (!tracking) return;
      tracking = false;
      alert.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      const dx = (ev.changedTouches[0]?.clientX ?? startX) - startX;
      if (dx > 80) {
        alert.style.transform = 'translateX(120%)';
        alert.style.opacity = '0';
        window.setTimeout(() => {
          void dismissReviewNotification(item).catch(() => {
            alert.style.transform = '';
            alert.style.opacity = '';
          });
        }, 180);
        return;
      }
      alert.style.transform = '';
      alert.style.opacity = '';
    },
    { passive: true },
  );
}

async function dismissPushAlertById(alertId) {
  const id = String(alertId || '').trim();
  if (!id) return;
  const res = await fetch(`/api/admin/alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await readApiJson(res);
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  removeReviewAlertBanner(null, null, null, id);
  syncReviewBadge(Math.max(0, reviewsPendingCount - 1));
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
function removeReviewAlertBanner(emailId, commentId, engagementId, alertId) {
  const emailKey = String(emailId || '').trim();
  const commentKey = String(commentId || '').trim();
  const engagementKey = String(engagementId || '').trim();
  const alertKey = String(alertId || '').trim();
  let banner = null;
  if (alertKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-alert-id="${CSS.escape(alertKey)}"]`,
    );
  } else if (engagementKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-engagement-id="${CSS.escape(engagementKey)}"]`,
    );
  } else if (commentKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-comment-id="${CSS.escape(commentKey)}"]`,
    );
  } else if (emailKey) {
    banner = document.querySelector(
      `.dash-review-alerts [data-review-email-id="${CSS.escape(emailKey)}"]`,
    );
  }
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
  const upcomingTodos = Array.isArray(data?.upcomingTodos) ? data.upcomingTodos : [];
  const todayGroups = buildDashTodayGroups(events, upcomingTodos);
  const automationNotifications = Array.isArray(data?.automationNotifications)
    ? data.automationNotifications
    : [];

  if (automationNotifications.length) {
    scroll.appendChild(buildReviewAlertBanners(automationNotifications));
  }

  const todaySection = document.createElement('section');
  todaySection.className = 'dash-today';
  todaySection.innerHTML =
    `<div class="dash-today-head">` +
      `<h2 class="dash-panel-title">Today</h2>` +
      (scheduleLive
        ? `<button type="button" class="dash-panel-btn" data-schedule-all>View Schedule</button>`
        : '') +
    `</div>`;
  todaySection.querySelector('[data-schedule-all]')?.addEventListener('click', () => {
    openScheduleTab({ view: 'day', date: scheduleTodayKey() });
  });

  const todayLists = document.createElement('div');
  todayLists.className = 'dash-today-lists';
  const hasTodos = todayGroups.todos.length > 0;
  const hasEvents = todayGroups.events.length > 0;

  if (!hasTodos && !hasEvents) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = scheduleLive
      ? 'Nothing scheduled today.'
      : 'No meetings or due to-dos right now.';
    todayLists.appendChild(empty);
  } else {
    if (hasTodos) {
      const todoList = document.createElement('ul');
      todoList.className = 'dash-events';
      for (const todo of todayGroups.todos) {
        const li = document.createElement('li');
        const when = formatDashTodoWhen(todo.due_date);
        const whenClass =
          when === 'Overdue'
            ? 'dash-event-time dash-event-time--overdue'
            : 'dash-event-time dash-event-time--todo';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dash-event dash-event-btn';
        btn.innerHTML =
          `<span class="${whenClass}">${escHtml(when)}</span>` +
          `<div class="dash-event-body">` +
            `<div class="dash-event-title">${escHtml(todo.title || 'To-do')}</div>` +
            `<div class="dash-event-type">${escHtml(dashTodoSubline(todo))}</div>` +
          `</div>`;
        btn.addEventListener('click', () => navigateToTodo(todo.id));
        li.appendChild(btn);
        todoList.appendChild(li);
      }
      todayLists.appendChild(todoList);
    }
    if (hasEvents) {
      const eventsList = document.createElement('ul');
      eventsList.className = 'dash-events';
      for (const ev of todayGroups.events) {
        const li = document.createElement('li');
        const uid = ev.uid || ev.id;
        const canOpen = scheduleLive && uid;
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
      todayLists.appendChild(eventsList);
    }
  }
  todaySection.appendChild(todayLists);
  scroll.appendChild(todaySection);

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
  if (uptimeConfigured || uptimeSummary) {
    const downCount = uptimeSummary?.down ?? stats.uptimeDown ?? 0;
    statsEl.appendChild(buildDashStat({
      value: downCount,
      label: 'Sites down',
      hint: uptimeSummary
        ? `${uptimeSummary.up}/${uptimeSummary.total} up locally · ${uptimeSummary.open_incidents ?? 0} open incidents`
        : uptimeConfigured
          ? 'sync pending'
          : 'not configured',
      tone: downCount > 0 ? 'failed' : uptimeSummary?.total ? 'live' : 'muted',
      muted: !uptimeConfigured,
    }));
  }

  scroll.appendChild(statsEl);

  if (uptimeConfigured) {
    const list = document.createElement('ul');
    list.className = 'dash-uptime-grid';
    const monitors = Array.isArray(data?.uptimeMonitors) ? data.uptimeMonitors : [];
    for (const m of monitors) {
      const li = document.createElement('li');
      const { offline, label } = uptimeMonitorTileMeta(m);
      li.className = `dash-uptime-tile${offline ? ' dash-uptime-tile--down' : ''}`;
      li.innerHTML =
        `<span class="dash-uptime-dot" aria-hidden="true"></span>` +
        `<div class="dash-uptime-name">${escHtml(m.friendly_name || m.url || `Monitor ${m.id}`)}</div>` +
        `<div class="dash-uptime-meta">${escHtml(label)}</div>`;
      list.appendChild(li);
    }

    scroll.appendChild(list);
  }

  const inboxRecent = Array.isArray(data?.recentEmails) ? data.recentEmails : [];
  const inboxPanel = document.createElement('section');
  inboxPanel.className =
    'dash-panel dash-panel-inbox' + (inboxRecent.length ? '' : ' dash-panel-inbox--empty');
  inboxPanel.innerHTML = `<div class="dash-panel-head"><h2 class="dash-panel-title">Recent inbox</h2></div>`;
  const inboxBody = document.createElement('div');
  inboxBody.className = 'dash-panel-body';
  if (!inboxRecent.length) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = 'No emails yet.';
    inboxBody.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'dash-inbox-list';
    for (const mail of inboxRecent) {
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
    inboxBody.appendChild(list);
  }
  inboxPanel.appendChild(inboxBody);
  scroll.appendChild(inboxPanel);

  const grid = document.createElement('div');
  grid.className = 'home-dashboard-grid';
  for (const key of dashboardTabKeys(cachedTabOrder || defaultTabKeys())) {
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
      '<p class="em-book-dialog-lead">Create an HTTP monitor via the UptimeRobot API. ' +
      'If your plan blocks API creates, add the monitor in the ' +
      '<a href="https://uptimerobot.com/dashboard" target="_blank" rel="noopener noreferrer">UptimeRobot dashboard</a> ' +
      'and use <strong>Link monitor</strong> or <strong>Sync status</strong> instead.</p>' +
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
      const url = normalizeUptimeUrlClient(urlInput?.value);
      if (!url) {
        urlInput?.focus();
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        const res = await adminFetch('/api/uptime/monitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            friendlyName: nameInput?.value.trim() || undefined,
          }),
        });
        const data = await readApiJson(res);
        if (!data.ok) throw new Error(data.error || 'Could not add site');
        finish(true);
        await loadHomeDashboard();
      } catch (e) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add site';
        await osAlert({
          title: 'Could not add site',
          bodyHtml: uptimeAddSiteErrorHtml(url, e.message || String(e)),
        });
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(false), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    urlInput?.focus();
  });
}

function showLinkUptimeMonitorDialog() {
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

    titleEl.textContent = 'Link UptimeRobot monitor';
    bodyEl.innerHTML =
      '<p class="em-book-dialog-lead">After creating a monitor in the ' +
      '<a href="https://uptimerobot.com/dashboard" target="_blank" rel="noopener noreferrer">UptimeRobot dashboard</a>, ' +
      'enter its numeric ID here to import it into ' +
      escHtml(companyBrand().name) +
      '. You can also use <strong>Sync status</strong> to pull all monitors at once.</p>' +
      '<label class="de-label sched-create-field">' +
        '<span>Monitor ID</span>' +
        '<div class="control-field">' +
          '<input id="uptime-link-id" type="number" inputmode="numeric" min="1" step="1" placeholder="798092635" required>' +
        '</div>' +
      '</label>' +
      '<p class="dash-muted-inline">Find the ID in the dashboard URL when editing a monitor, or in the monitor list.</p>';
    actionsEl.innerHTML = '';

    const idInput = bodyEl.querySelector('#uptime-link-id');

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
    const linkBtn = mkBtn('Link monitor', 'os-dialog-btn--primary', async () => {
      const monitorId = Number(idInput?.value.trim());
      if (!Number.isFinite(monitorId) || monitorId <= 0) {
        idInput?.focus();
        return;
      }
      linkBtn.disabled = true;
      linkBtn.textContent = 'Linking…';
      try {
        const res = await adminFetch('/api/uptime/monitors/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monitorId }),
        });
        const data = await readApiJson(res);
        if (!data.ok) throw new Error(data.error || 'Could not link monitor');
        finish(true);
        await loadHomeDashboard();
      } catch (e) {
        linkBtn.disabled = false;
        linkBtn.textContent = 'Link monitor';
        await osAlert({ title: 'Could not link monitor', bodyHtml: escHtml(e.message || String(e)) });
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(false), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    idInput?.focus();
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
    void initFleetLocationReporter();
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
    `<p class="fl-hint">Assign a Clerk user id to each vehicle. When that user is signed into ${escHtml(companyBrand().projectLabel)}, their device reports GPS automatically.</p>` +
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
      `<p class="fl-hint">Assign a driver so their ${escHtml(companyBrand().projectLabel)} session reports GPS for this vehicle.</p>` +
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
        await osAlert({ title: 'Could not add vehicle', bodyHtml: escHtml(e.message || String(e)) });
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
  const root = document.getElementById('fleet-panel');
  if (!root) return;
  stopFleetPoll();
  root.innerHTML = '<div class="social-scroll"><div class="dash-loading">Loading fleet…</div></div>';

  try {
    const res = await fetch('/api/fleet/map', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderFleetDashboard(root, data);
    void initFleetLocationReporter();
    fleetPollTimer = setInterval(() => {
      if (MAP.type !== 'fleet') return;
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
  if (!root || MAP.type !== 'fleet') return;
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

function companyIconPreviewUrl(company) {
  if (!company?.iconPath || company.iconSource !== 'admin') return '';
  const path = String(company.iconPath);
  const v = company.iconVersion ? `?v=${encodeURIComponent(company.iconVersion)}` : '';
  if (/^https?:\/\//i.test(path)) return path + (company.iconVersion ? v : '');
  return `${path.startsWith('/') ? path : `/${path}`}${v}`;
}

function companyStaffAvatarPreviewUrl(company) {
  if (!company?.iconPath) return window.__companyStaffAvatarUrl || '';
  const path = String(company.iconPath);
  const v = company.iconVersion ? `?v=${encodeURIComponent(company.iconVersion)}` : '';
  if (/^https?:\/\//i.test(path)) return path + (company.iconVersion ? v : '');
  return `${path.startsWith('/') ? path : `/${path}`}${v}`;
}

function hasCustomCompanyLogo(company) {
  return company?.logoSource === 'admin' && !!companyLogoPreviewUrl(company);
}

function hasCustomCompanyIcon(company) {
  return company?.iconSource === 'admin' && !!companyIconPreviewUrl(company);
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

function bindCompanyIconUpload(root, companyAlert) {
  const fileInput = root.querySelector('#company-icon-file');
  const fileWrap = root.querySelector('#company-icon-file-wrap');
  const previewWrap = root.querySelector('#company-icon-preview-wrap');
  const preview = root.querySelector('#company-icon-preview');
  const removeBtn = root.querySelector('#company-icon-remove');

  const refreshPreview = (company) => {
    const hasIcon = hasCustomCompanyIcon(company);
    const url = hasIcon ? companyIconPreviewUrl(company) : '';

    if (preview instanceof HTMLImageElement) {
      preview.src = url;
    }
    if (previewWrap instanceof HTMLElement) {
      previewWrap.hidden = !hasIcon;
    }
    if (fileWrap instanceof HTMLElement) {
      fileWrap.hidden = hasIcon;
    }
    window.__companyStaffAvatarUrl = companyStaffAvatarPreviewUrl(company);
  };

  fileInput?.addEventListener('change', async () => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;
    const file = fileInput.files[0];
    const fd = new FormData();
    fd.append('icon', file);
    if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = true;
    fileInput.disabled = true;
    try {
      const res = await fetch('/api/admin/company/icon', { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok && json.company) {
        refreshPreview(json.company);
        window.__companyStaffAvatarUrl = companyStaffAvatarPreviewUrl(json.company);
        showProfileAlert(companyAlert, 'Icon updated.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Icon upload failed.', 'error');
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
      const res = await fetch('/api/admin/company/icon', { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.company) {
        refreshPreview(json.company);
        window.__companyStaffAvatarUrl = companyStaffAvatarPreviewUrl(json.company);
        showProfileAlert(companyAlert, 'Icon removed — using site default.', 'success');
      } else {
        showProfileAlert(companyAlert, json.error || 'Could not remove icon.', 'error');
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

function bindCompanyForm(root, company, fontCatalog) {
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
  bindCompanyIconUpload(root, root.querySelector('#company-alert'));
  bindCompanyFontPreview(root, fontCatalog);
  bindCompanyFontScrape(root, fontCatalog, root.querySelector('#company-alert'), company);
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
  const form = root.querySelector('#socials-form');
  const hiddenInput = root.querySelector('#social-hidden-platforms');

  const readHidden = () => {
    try {
      const parsed = JSON.parse(hiddenInput?.value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeHidden = (ids) => {
    if (hiddenInput) hiddenInput.value = JSON.stringify(ids);
  };

  const saveCompanyPayload = async (payload) => {
    const res = await fetch('/api/admin/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return { ok: res.ok, error: json.error };
  };

  bindAutosaveForm(root, {
    formSelector: '#socials-form',
    alertEl: root.querySelector('#socials-alert'),
    save: saveCompanyPayload,
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

  root.querySelectorAll('[data-soc-hide]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platformId = btn.getAttribute('data-soc-hide');
      if (!platformId || !(form instanceof HTMLFormElement)) return;
      const label = socialPlatformLabel(platformId);
      if (!confirm(`Remove ${label} from your socials list? You can restore it later from "Removed platforms".`)) {
        return;
      }

      const hidden = readHidden();
      if (!hidden.includes(platformId)) hidden.push(platformId);
      writeHidden(hidden);

      const platform = socialPlatformCatalog.find((p) => p.id === platformId);
      if (platform) {
        const input = form.querySelector(`[name="${platform.field}"]`);
        if (input instanceof HTMLInputElement) input.value = '';
      }

      btn.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(form));
        const result = await saveCompanyPayload(payload);
        if (!result.ok) throw new Error(result.error || 'Save failed');
        await loadSocialsTab();
      } catch (e) {
        btn.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Remove failed.', 'error');
      }
    });
  });

  root.querySelectorAll('[data-soc-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platformId = btn.getAttribute('data-soc-restore');
      if (!platformId || !(form instanceof HTMLFormElement)) return;
      writeHidden(readHidden().filter((id) => id !== platformId));
      btn.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(form));
        const result = await saveCompanyPayload(payload);
        if (!result.ok) throw new Error(result.error || 'Save failed');
        await loadSocialsTab();
      } catch (e) {
        btn.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Restore failed.', 'error');
      }
    });
  });

  const addSelect = root.querySelector('#social-add-platform');
  if (addSelect instanceof HTMLSelectElement) {
    addSelect.addEventListener('change', async () => {
      const platformId = addSelect.value;
      if (!platformId || !(form instanceof HTMLFormElement)) return;
      writeHidden(readHidden().filter((id) => id !== platformId));
      addSelect.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(form));
        const result = await saveCompanyPayload(payload);
        if (!result.ok) throw new Error(result.error || 'Save failed');
        await loadSocialsTab();
      } catch (e) {
        addSelect.disabled = false;
        showProfileAlert(root.querySelector('#socials-alert'), e.message || 'Could not add platform.', 'error');
      }
    });
  }

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

function brandFontsForRole(catalog, role) {
  return (catalog || []).filter(
    (entry) => Array.isArray(entry.roles) && entry.roles.includes(role),
  );
}

function renderBrandFontOptions(catalog, role, selectedId) {
  const options = brandFontsForRole(catalog, role);
  const fallbacks = {
    primary: 'space-grotesk',
    secondary: 'space-grotesk',
    content: 'mozilla-text',
  };
  const selected = selectedId || fallbacks[role] || 'space-grotesk';
  return options
    .map(
      (entry) =>
        `<option value="${escHtml(entry.id)}"${entry.id === selected ? ' selected' : ''}>${escHtml(entry.label)}</option>`,
    )
    .join('');
}

function buildBrandFontsHref(catalog, primaryId, secondaryId, contentId) {
  const ids = [primaryId, secondaryId, contentId].filter(Boolean);
  const entries = ids
    .map((id) => (catalog || []).find((entry) => entry.id === id))
    .filter(Boolean);
  if (!entries.length) return '';
  const specs = new Map();
  for (const entry of entries) {
    specs.set(entry.family, entry.googleSpec);
  }
  return `https://fonts.googleapis.com/css2?${[...specs.values()]
    .map((spec) => `family=${spec}`)
    .join('&')}&display=swap`;
}

function bindCompanyFontPreview(root, catalog) {
  const primarySelect = root.querySelector('#company-fontPrimary');
  const secondarySelect = root.querySelector('#company-fontSecondary');
  const contentSelect = root.querySelector('#company-fontContent');
  const previewPrimary = root.querySelector('.prof-font-preview-primary');
  const previewSecondary = root.querySelector('.prof-font-preview-secondary');
  const previewContent = root.querySelector('.prof-font-preview-content');
  if (
    !primarySelect ||
    !secondarySelect ||
    !contentSelect ||
    !previewPrimary ||
    !previewSecondary ||
    !previewContent
  ) {
    return;
  }

  let fontLink = document.getElementById('company-font-preview-link');
  if (!(fontLink instanceof HTMLLinkElement)) {
    fontLink = document.createElement('link');
    fontLink.id = 'company-font-preview-link';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }

  const sansFallback = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const contentFallback = 'Georgia, "Times New Roman", serif';

  const update = () => {
    const primaryId = primarySelect.value;
    const secondaryId = secondarySelect.value;
    const contentId = contentSelect.value;
    const primary = (catalog || []).find((entry) => entry.id === primaryId);
    const secondary = (catalog || []).find((entry) => entry.id === secondaryId);
    const content = (catalog || []).find((entry) => entry.id === contentId);
    const href = buildBrandFontsHref(catalog, primaryId, secondaryId, contentId);
    if (href) fontLink.href = href;
    previewPrimary.style.fontFamily = primary ? `"${primary.family}", ${sansFallback}` : '';
    previewSecondary.style.fontFamily = secondary ? `"${secondary.family}", ${sansFallback}` : '';
    previewContent.style.fontFamily = content ? `"${content.family}", ${contentFallback}` : '';
  };

  primarySelect.addEventListener('change', update);
  secondarySelect.addEventListener('change', update);
  contentSelect.addEventListener('change', update);
  update();
}

function rebuildCompanyFontSelects(root, catalog, fonts) {
  const primary = root.querySelector('#company-fontPrimary');
  const secondary = root.querySelector('#company-fontSecondary');
  const content = root.querySelector('#company-fontContent');
  if (!(primary instanceof HTMLSelectElement)) return;
  if (!(secondary instanceof HTMLSelectElement)) return;
  if (!(content instanceof HTMLSelectElement)) return;
  primary.innerHTML = renderBrandFontOptions(catalog, 'primary', fonts?.fontPrimaryId);
  secondary.innerHTML = renderBrandFontOptions(catalog, 'secondary', fonts?.fontSecondaryId);
  content.innerHTML = renderBrandFontOptions(catalog, 'content', fonts?.fontContentId);
  primary.value = fonts?.fontPrimaryId || primary.value;
  secondary.value = fonts?.fontSecondaryId || secondary.value;
  content.value = fonts?.fontContentId || content.value;
}

function bindCompanyFontScrape(root, fontCatalog, alertEl, company) {
  const btn = root.querySelector('#company-font-scrape');
  const domainInput = root.querySelector('#company-domain');
  if (!(btn instanceof HTMLButtonElement)) return;

  const hasWebsite = () => {
    const typed = domainInput instanceof HTMLInputElement ? domainInput.value.trim() : '';
    return !!(typed || (company?.domain || '').trim());
  };

  const syncBtn = () => {
    btn.disabled = !hasWebsite();
  };

  syncBtn();
  domainInput?.addEventListener('input', syncBtn);

  btn.addEventListener('click', async () => {
    const domain = domainInput instanceof HTMLInputElement ? domainInput.value.trim() : '';
    if (!hasWebsite()) return;

    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = 'Fetching…';
    try {
      const res = await fetch('/api/admin/company/scrape-fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(domain ? { website: domain } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showProfileAlert(alertEl, json.error || 'Could not fetch fonts from website.', 'error');
        return;
      }

      const catalog = Array.isArray(json.fontCatalog) ? json.fontCatalog : fontCatalog;
      rebuildCompanyFontSelects(root, catalog, json.company?.fonts);
      root.querySelector('#company-fontPrimary')?.dispatchEvent(new Event('change'));
      showProfileAlert(alertEl, json.message || 'Fonts imported from website.', 'success');
    } catch {
      showProfileAlert(alertEl, 'Network error — please try again.', 'error');
    } finally {
      syncBtn();
      btn.textContent = prevLabel;
    }
  });
}

function renderCompanyPanel(company, fontCatalog) {
  const c = company || {};
  const fonts = c.fonts || {};
  const logoUrl = companyLogoPreviewUrl(c);
  const hasLogo = hasCustomCompanyLogo(c);
  const iconUrl = companyIconPreviewUrl(c);
  const hasIcon = hasCustomCompanyIcon(c);
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
          `<input id="company-address" name="address" type="text" value="${escHtml(c.address || '')}" placeholder="Business or street address" autocomplete="street-address" autocapitalize="words" />` +
          `<span class="prof-hint prof-hint--block">Office location for the map below, driving directions, and address autocomplete defaults.</span></div>` +
          `<div id="company-map-host" class="cl-map-section"></div>` +
          `<div class="prof-field">` +
          `<label>Branding</label>` +
          `<div class="prof-branding-uploads">` +
            `<div class="prof-branding-upload-item">` +
              `<label for="company-logo-file">Logo</label>` +
              `<div class="prof-logo-upload">` +
                `<div id="company-logo-preview-wrap" class="prof-logo-preview-wrap"${hasLogo ? '' : ' hidden'}>` +
                  `<img id="company-logo-preview" class="prof-logo-preview" src="${escHtml(logoUrl)}" alt="" />` +
                  `<button type="button" id="company-logo-remove" class="prof-logo-remove" aria-label="Remove logo">×</button>` +
                `</div>` +
                `<div id="company-logo-file-wrap" class="prof-logo-file-wrap"${hasLogo ? ' hidden' : ''}>` +
                  `<input id="company-logo-file" type="file" accept="image/png,image/jpeg,image/webp" />` +
                `</div>` +
              `</div>` +
            `</div>` +
            `<div class="prof-branding-upload-item">` +
              `<label for="company-icon-file">Icon</label>` +
              `<div class="prof-logo-upload">` +
                `<div id="company-icon-preview-wrap" class="prof-logo-preview-wrap"${hasIcon ? '' : ' hidden'}>` +
                  `<img id="company-icon-preview" class="prof-icon-preview" src="${escHtml(iconUrl)}" alt="" />` +
                  `<button type="button" id="company-icon-remove" class="prof-logo-remove" aria-label="Remove icon">×</button>` +
                `</div>` +
                `<div id="company-icon-file-wrap" class="prof-logo-file-wrap"${hasIcon ? ' hidden' : ''}>` +
                  `<input id="company-icon-file" type="file" accept="image/png,image/jpeg,image/webp" />` +
                `</div>` +
              `</div>` +
            `</div>` +
          `</div>` +
          `<span class="prof-hint prof-hint--block">Logo: header and homepage. Icon: favicons, install icons, and team comment avatars. PNG, JPEG, or WebP — max 2 MB each.</span>` +
          `<div class="prof-field prof-field--font-heading">` +
            `<div class="prof-font-heading-row">` +
              `<label>Typography</label>` +
              `<button type="button" id="company-font-scrape" class="de-btn de-btn-secondary cl-branding-scrape-btn">Fetch fonts from website</button>` +
            `</div>` +
          `</div>` +
          `<div class="prof-field-row prof-field-row--fonts">` +
            `<div class="prof-field"><label for="company-fontPrimary">Primary font</label>` +
            `<select id="company-fontPrimary" name="fontPrimary" aria-describedby="company-font-hint">` +
              renderBrandFontOptions(fontCatalog, 'primary', fonts.fontPrimaryId) +
            `</select></div>` +
            `<div class="prof-field"><label for="company-fontSecondary">Secondary font</label>` +
            `<select id="company-fontSecondary" name="fontSecondary" aria-describedby="company-font-hint">` +
              renderBrandFontOptions(fontCatalog, 'secondary', fonts.fontSecondaryId) +
            `</select></div>` +
            `<div class="prof-field"><label for="company-fontContent">Content font</label>` +
            `<select id="company-fontContent" name="fontContent" aria-describedby="company-font-hint">` +
              renderBrandFontOptions(fontCatalog, 'content', fonts.fontContentId) +
            `</select></div>` +
          `</div>` +
          `<div class="prof-font-preview" aria-hidden="true">` +
            `<p class="prof-font-preview-secondary">THE BUSINESS OS</p>` +
            `<p class="prof-font-preview-primary">Runs the whole business</p>` +
            `<p class="prof-font-preview-content">Contacts, billing, projects, and AI — one platform.</p>` +
          `</div>` +
          `<span id="company-font-hint" class="prof-hint prof-hint--block">Primary = headlines. Secondary = labels and UI accents. Content = body copy. Saved as global <code>--font-primary</code>, <code>--font-secondary</code>, and <code>--font-content</code>. Uses the website domain below — same idea as fetching logos from the source site.</span>` +
          `<div class="prof-field"><label for="company-domain">Website domain</label>` +
          `<input id="company-domain" name="domain" type="text" value="${escHtml(c.domain || '')}" placeholder="example.com" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url" />` +
          `<span class="prof-hint prof-hint--block">Hostname only — used in link previews, emails, and legal pages. Leave blank to use this deployment's domain.</span></div>` +
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
  bluesky: 'Bluesky',
  threads: 'Threads',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  discord: 'Discord',
  reddit: 'Reddit',
  github: 'GitHub',
  twitch: 'Twitch',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  substack: 'Substack',
  yelp: 'Yelp',
  googlebusiness: 'Google Business',
};

let socialPlatformCatalog = [];
let socialDefaultVisible = [];

const FALLBACK_SOCIAL_LINK_CATALOG = [
  { id: 'twitter', label: 'X / Twitter', field: 'socialTwitter', placeholder: 'https://x.com/yourcompany', iconSlug: 'x', color: '#1d9bf0' },
  { id: 'instagram', label: 'Instagram', field: 'socialInstagram', placeholder: 'https://instagram.com/yourcompany', iconSlug: 'instagram', color: '#e1306c' },
  { id: 'linkedin', label: 'LinkedIn', field: 'socialLinkedin', placeholder: 'https://linkedin.com/company/yourcompany', iconSlug: 'linkedin', color: '#0a66c2' },
  { id: 'facebook', label: 'Facebook', field: 'socialFacebook', placeholder: 'https://facebook.com/yourcompany', iconSlug: 'facebook', color: '#1877f2' },
  { id: 'youtube', label: 'YouTube', field: 'socialYoutube', placeholder: 'https://youtube.com/@yourcompany', iconSlug: 'youtube', color: '#ff0000' },
  { id: 'tiktok', label: 'TikTok', field: 'socialTiktok', placeholder: 'https://tiktok.com/@yourcompany', iconSlug: 'tiktok', color: '#ff0050' },
  { id: 'bluesky', label: 'Bluesky', field: 'socialBluesky', placeholder: 'https://bsky.app/profile/yourcompany.bsky.social', iconSlug: 'bluesky', color: '#0085ff' },
  { id: 'threads', label: 'Threads', field: 'socialThreads', placeholder: 'https://threads.net/@yourcompany', iconSlug: 'threads', color: '#000000' },
];

const FALLBACK_SOCIAL_DEFAULT_VISIBLE = ['twitter', 'instagram', 'linkedin', 'facebook', 'youtube', 'tiktok', 'bluesky', 'threads'];

function syncSocialPlatformCatalog(catalog, defaultVisible) {
  socialPlatformCatalog = Array.isArray(catalog) ? catalog : [];
  socialDefaultVisible = Array.isArray(defaultVisible) ? defaultVisible : [];
  for (const platform of socialPlatformCatalog) {
    if (!platform?.id) continue;
    SOCIAL_PLATFORM_LABELS[platform.id] = platform.label || platform.id;
    SOCIAL_PLATFORM_UI[platform.id] = {
      slug: platform.iconSlug || platform.id,
      color: platform.color || '#64748b',
    };
  }
}

function socialHiddenPlatformIds(company) {
  return Array.isArray(company?.socialHiddenPlatforms) ? company.socialHiddenPlatforms : [];
}

function visibleSocialLinkPlatforms(company) {
  const hidden = new Set(socialHiddenPlatformIds(company));
  const visible = socialPlatformCatalog.filter((p) => !hidden.has(p.id));
  if (visible.length) return visible;
  const defaults = new Set(socialDefaultVisible);
  return socialPlatformCatalog.filter((p) => defaults.has(p.id));
}

function hiddenSocialLinkPlatforms(company) {
  const hidden = new Set(socialHiddenPlatformIds(company));
  return socialPlatformCatalog.filter((p) => hidden.has(p.id));
}

function addableSocialLinkPlatforms(company) {
  const visibleIds = new Set(visibleSocialLinkPlatforms(company).map((p) => p.id));
  return socialPlatformCatalog.filter((p) => !visibleIds.has(p.id));
}

function socialLinkFieldRow(platform, company) {
  const value = company?.[platform.field] || '';
  return (
    `<div class="soc-field-row" data-soc-platform="${escHtml(platform.id)}">` +
      `<div class="prof-field soc-field">` +
        `<label for="social-${escHtml(platform.id)}">${escHtml(platform.label)}</label>` +
        `<input id="social-${escHtml(platform.id)}" name="${escHtml(platform.field)}" type="url" value="${escHtml(value)}" placeholder="${escHtml(platform.placeholder)}" autocomplete="url" />` +
      `</div>` +
      `<button type="button" class="prof-btn-secondary soc-field-remove" data-soc-hide="${escHtml(platform.id)}" aria-label="Remove ${escHtml(platform.label)}">Remove</button>` +
    `</div>`
  );
}

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
  const visible = visibleSocialLinkPlatforms(c);
  const hidden = hiddenSocialLinkPlatforms(c);
  const addable = addableSocialLinkPlatforms(c);
  const hiddenJson = escHtml(JSON.stringify(socialHiddenPlatformIds(c)));

  const addPlatformHtml = addable.length
    ? `<div class="soc-add-row">` +
        `<label for="social-add-platform">Add platform</label>` +
        `<select id="social-add-platform" class="soc-add-select">` +
          `<option value="">Choose a platform…</option>` +
          addable.map((p) => `<option value="${escHtml(p.id)}">${escHtml(p.label)}</option>`).join('') +
        `</select>` +
      `</div>`
    : '';

  const hiddenHtml = hidden.length
    ? `<details class="soc-hidden-wrap">` +
        `<summary>Removed platforms (${hidden.length})</summary>` +
        `<div class="soc-hidden-list">` +
          hidden
            .map(
              (p) =>
                `<div class="soc-hidden-item">` +
                  `<span>${escHtml(p.label)}</span>` +
                  `<button type="button" class="prof-btn-secondary soc-field-restore" data-soc-restore="${escHtml(p.id)}">Restore</button>` +
                `</div>`,
            )
            .join('') +
        `</div>` +
      `</details>`
    : '';

  return (
    `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
        `<h1 class="prof-title">Socials</h1>` +
        `<p class="prof-subtitle">Public profile links for your organization. Remove platforms you will never use — they stay out of the way until you restore them.</p>` +
        `<div id="socials-alert" class="prof-alert" hidden></div>` +
        `<form id="socials-form" class="prof-form">` +
          `<input type="hidden" id="social-hidden-platforms" name="socialHiddenPlatforms" value="${hiddenJson}" />` +
          `<div id="social-fields-list" class="soc-fields-list">` +
            visible.map((p) => socialLinkFieldRow(p, c)).join('') +
          `</div>` +
          addPlatformHtml +
          hiddenHtml +
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

/**
 * Every settings/account page (Profile, Company, Socials, Industries, Vapi —
 * everything reached from the profile menu in the top-right) fully replaces
 * root.innerHTML per tab load, so the back control has to be re-prepended
 * after every render, including loading/error states. Unlike the mobile-only
 * .de-back-btn used for split-view "back to list" panes, this back button is
 * shown at every viewport size (#settings-panel is a full-screen takeover
 * with no adjacent sidebar to fall back to on desktop).
 */
function prependSettingsBackHeader(root) {
  const { header } = createPaneSubheader({
    back: { label: 'Back', onClick: () => setActiveMap('home', { force: true }) },
    className: 'settings-subheader',
  });
  root.prepend(header);
}

async function loadProfileTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading profile…</div></div>';
  prependSettingsBackHeader(root);

  try {
    const profileRes = await fetch('/api/admin/profile', { cache: 'no-store' });
    const profileData = await profileRes.json();
    if (!profileRes.ok || !profileData.ok) throw new Error(profileData.error || `HTTP ${profileRes.status}`);
    root.innerHTML = renderProfileOnlyPanel(profileData.profile);
    prependSettingsBackHeader(root);
    bindProfileForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Profile</h1>` +
        `<p class="dash-empty">Could not load profile: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function loadCompanyTab() {
  await flushSettingsAutosave();
  destroyCompanyMap();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading company…</div></div>';
  prependSettingsBackHeader(root);

  try {
    const companyRes = await fetch('/api/admin/company', { cache: 'no-store' });
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);
    root.innerHTML = renderCompanyPanel(companyData.company, companyData.fontCatalog);
    prependSettingsBackHeader(root);
    bindCompanyForm(root, companyData.company, companyData.fontCatalog);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Company</h1>` +
        `<p class="dash-empty">Could not load company details: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function loadSocialsTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading socials…</div></div>';
  prependSettingsBackHeader(root);

  try {
    const [companyRes, connRes, catalogRes] = await Promise.all([
      fetch('/api/admin/company', { cache: 'no-store' }),
      fetch('/api/admin/social/connections', { cache: 'no-store' }),
      fetch('/api/admin/social/platforms', { cache: 'no-store' }),
    ]);
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);

    try {
      const catalogData = await catalogRes.json();
      if (catalogRes.ok && catalogData.ok) {
        syncSocialPlatformCatalog(catalogData.platforms, catalogData.defaultVisible);
      }
    } catch {
      /* catalog is best-effort */
    }
    if (!socialPlatformCatalog.length) {
      syncSocialPlatformCatalog(FALLBACK_SOCIAL_LINK_CATALOG, FALLBACK_SOCIAL_DEFAULT_VISIBLE);
    }

    let connections = [];
    try {
      const connData = await connRes.json();
      if (connRes.ok && connData.ok) connections = connData.connections || [];
    } catch {
      /* connection status is best-effort */
    }

    root.innerHTML = renderSocialsPanel(companyData.company, connections);
    prependSettingsBackHeader(root);
    bindSocialsForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Socials</h1>` +
        `<p class="dash-empty">Could not load social links: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
  }
}

async function loadIndustriesTab() {
  await flushSettingsAutosave();
  const root = settingsPanelRoot();
  if (!root) return;
  root.innerHTML = '<div class="profile-panel-scroll"><div class="dash-loading">Loading industries…</div></div>';
  prependSettingsBackHeader(root);

  try {
    const industriesRes = await fetch('/api/admin/deck-industries', { cache: 'no-store' });
    const industriesData = await industriesRes.json().catch(() => ({}));
    if (!industriesRes.ok || !industriesData.ok) {
      throw new Error(industriesData.error || `HTTP ${industriesRes.status}`);
    }
    root.innerHTML = renderIndustriesPanel(industriesData.industries);
    prependSettingsBackHeader(root);
    bindIndustriesEditor(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Industries</h1>` +
        `<p class="dash-empty">Could not load industries: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
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
  prependSettingsBackHeader(root);

  try {
    const companyRes = await fetch('/api/admin/company', { cache: 'no-store' });
    const companyData = await companyRes.json();
    if (!companyRes.ok || !companyData.ok) throw new Error(companyData.error || `HTTP ${companyRes.status}`);
    root.innerHTML = renderVapiPanel(companyData.company);
    prependSettingsBackHeader(root);
    bindVapiForm(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Vapi</h1>` +
        `<p class="dash-empty">Could not load Vapi settings: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    prependSettingsBackHeader(root);
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

// ── New-record drawer ───────────────────────────────────────────────────────
// New records open as an iOS bottom drawer over their list rather than taking
// over the detail pane, so there is nothing to unwind and no back chevron. The
// drawer *is* the detail pane with `.de-pane--drawer` on it, which keeps every
// `#<panel> .de-pane …` style rule working inside it.

const CREATE_DRAWER_EXIT_MS = 320;

let createDrawer = null;
let createDrawerVisible = false;
let createDrawerKeyboardBound = false;

function isCreateDrawerOpen(key) {
  if (!createDrawer) return false;
  return key == null || createDrawer.key === key;
}

function getCreateDrawerPane() {
  return document.querySelector('.de-pane--drawer');
}

/** Start a create flow. Call from the tap handler, before the panel re-renders. */
function beginCreateDrawer(opts) {
  createDrawer = {
    key: opts.key,
    title: opts.title,
    submitLabel: opts.submitLabel || 'Add',
    onSubmit: opts.onSubmit || null,
    onDismiss: opts.onDismiss || null,
    submitBtn: null,
    baseline: null,
  };
}

/** Strip drawer styling and injected chrome from a pane. */
function stripCreateDrawerChrome(pane) {
  if (!pane) return;
  pane.classList.remove('de-pane--drawer', 'de-pane--drawer-open', 'de-pane--drawer-keyboard');
  pane.style.removeProperty('transform');
  pane.style.removeProperty('transition');
  pane.querySelector(':scope > .de-drawer-grabber')?.remove();
  pane.querySelector(':scope > .de-drawer-bar')?.remove();
}

/** Build the grabber + Cancel/title/Add bar at the top of the drawer pane. */
function mountCreateDrawerChrome(pane) {
  // Panes are reused across renders, and one create flow can hand off to
  // another panel (a new to-do that spawns a project), so scrub every other
  // pane: `getCreateDrawerPane` resolves to the first match in the document.
  for (const stale of document.querySelectorAll('.de-pane--drawer')) {
    if (stale !== pane) stripCreateDrawerChrome(stale);
  }
  if (!createDrawer) {
    stripCreateDrawerChrome(pane);
    return;
  }
  pane.classList.add('de-pane--drawer');
  pane.style.removeProperty('transform');
  pane.style.removeProperty('transition');

  const grabber = document.createElement('div');
  grabber.className = 'de-drawer-grabber';
  grabber.setAttribute('aria-hidden', 'true');

  const bar = document.createElement('div');
  bar.className = 'de-drawer-bar';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'de-drawer-btn de-drawer-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => dismissCreateDrawer());

  const heading = document.createElement('span');
  heading.className = 'de-drawer-title';
  heading.textContent = createDrawer.title;

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'de-drawer-btn de-drawer-submit';
  submit.textContent = createDrawer.submitLabel;
  submit.addEventListener('click', () => void runCreateDrawerSubmit());
  createDrawer.submitBtn = submit;

  bar.append(cancel, heading, submit);
  pane.prepend(grabber, bar);

  createDrawer.baseline = createDrawerFieldSignature(pane);
  bindCreateDrawerDrag(pane, [grabber, bar]);
  showCreateDrawer(pane);
}

function setCreateDrawerSubmit(submitFn) {
  if (!createDrawer) return;
  createDrawer.onSubmit = submitFn || null;
}

/** Point the user at the empty title field when a create is missing one. */
function flagCreateDrawerTitleMissing() {
  const field = getCreateDrawerPane()?.querySelector('.de-header-title-input, .cl-title-input');
  if (!(field instanceof HTMLElement)) return;
  setFormFieldState(field, 'invalid');
  field.focus({ preventScroll: true });
}

async function runCreateDrawerSubmit() {
  const drawer = createDrawer;
  if (!drawer || typeof drawer.onSubmit !== 'function') return;
  const btn = drawer.submitBtn;
  if (btn) btn.disabled = true;
  try {
    await drawer.onSubmit();
  } finally {
    if (btn?.isConnected) btn.disabled = false;
  }
}

let createDrawerDismissBound = false;

function bindCreateDrawerDismissControls() {
  if (createDrawerDismissBound) return;
  createDrawerDismissBound = true;
  document.getElementById('create-drawer-scrim')?.addEventListener('click', () => {
    dismissCreateDrawer({ confirmEdits: true });
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !isCreateDrawerOpen()) return;
    ev.stopPropagation();
    dismissCreateDrawer();
  });
}

function showCreateDrawer(pane) {
  bindCreateDrawerDismissControls();
  bindCreateDrawerKeyboardLayout();
  // Re-rendered while already up — skip the entrance so it doesn't replay.
  const entering = !createDrawerVisible;
  createDrawerVisible = true;
  requestAnimationFrame(() => {
    const scrim = document.getElementById('create-drawer-scrim');
    const root = pane.parentElement;
    if (root && scrim) {
      for (const el of document.querySelectorAll('.de-drawer-host')) {
        if (el !== root) el.classList.remove('de-drawer-host');
      }
      root.classList.add('de-drawer-host');
      if (scrim.parentElement !== root) root.appendChild(scrim);
      scrim.hidden = false;
    }
    if (!entering) {
      scrim?.classList.add('open');
      pane.classList.add('de-pane--drawer-open');
      return;
    }
    requestAnimationFrame(() => {
      scrim?.classList.add('open');
      pane.classList.add('de-pane--drawer-open');
    });
  });
}

function fadeCreateDrawerScrim() {
  const scrim = document.getElementById('create-drawer-scrim');
  scrim?.classList.remove('open');
  return scrim;
}

/** Park the scrim back on the body so the next drawer can re-home it. */
function parkCreateDrawerScrim(scrim) {
  for (const el of document.querySelectorAll('.de-drawer-host')) {
    el.classList.remove('de-drawer-host');
  }
  if (!scrim) return;
  scrim.hidden = true;
  document.body.appendChild(scrim);
}

function clearCreateDrawerPaneChrome() {
  stripCreateDrawerChrome(getCreateDrawerPane());
}

/** Tear the drawer down without animating — the caller is replacing the pane. */
function finishCreateDrawer() {
  createDrawer = null;
  createDrawerVisible = false;
  releaseCreateDrawerKeyboardLayout();
  clearCreateDrawerPaneChrome();
  parkCreateDrawerScrim(fadeCreateDrawerScrim());
}

/** Snapshot of everything typed into the drawer, taken as it is rendered. */
function createDrawerFieldSignature(pane) {
  if (!pane) return null;
  const values = [];
  for (const el of pane.querySelectorAll('input, textarea, select, [contenteditable="true"]')) {
    values.push(el.isContentEditable ? el.textContent || '' : el.value ?? '');
  }
  return values.join('\u0000');
}

function createDrawerHasEdits() {
  if (createDrawer?.baseline == null) return false;
  const current = createDrawerFieldSignature(getCreateDrawerPane());
  return current != null && current !== createDrawer.baseline;
}

/**
 * Slide the drawer away, then let the owner reset its state and re-render.
 * Nothing here is autosaved, so incidental dismissals (a tap on the scrim, a
 * swipe down) check before throwing away work the user has typed.
 */
function dismissCreateDrawer({ confirmEdits = false } = {}) {
  const drawer = createDrawer;
  if (!drawer) return;
  if (confirmEdits && createDrawerHasEdits()) {
    void confirmDiscardChanges().then((ok) => {
      if (ok && createDrawer === drawer) closeCreateDrawer(drawer);
    });
    return;
  }
  closeCreateDrawer(drawer);
}

function closeCreateDrawer(drawer) {
  const onDismiss = drawer.onDismiss;
  const pane = getCreateDrawerPane();
  createDrawer = null;
  createDrawerVisible = false;
  releaseCreateDrawerKeyboardLayout();
  const scrim = fadeCreateDrawerScrim();
  pane?.classList.remove('de-pane--drawer-open');
  window.setTimeout(() => {
    if (createDrawerVisible) return; // another create flow started mid-animation
    parkCreateDrawerScrim(scrim);
    clearCreateDrawerPaneChrome();
    onDismiss?.();
  }, CREATE_DRAWER_EXIT_MS);
}

/** Pull the drawer down by its grabber or title bar to dismiss it. */
function bindCreateDrawerDrag(pane, handles) {
  let startY = 0;
  let offset = 0;
  let dragging = false;

  const end = () => {
    if (!dragging) return;
    dragging = false;
    pane.style.transition = '';
    const dismissing = offset > 100;
    offset = 0;
    if (dismissing && createDrawerHasEdits()) {
      // Settle back up so the discard prompt is answered over an open drawer.
      pane.style.transform = '';
      dismissCreateDrawer({ confirmEdits: true });
      return;
    }
    // Carry the swipe through to the closed position rather than snapping back.
    pane.style.transform = dismissing ? 'translateY(100%)' : '';
    if (dismissing) dismissCreateDrawer();
  };

  // Touch events stay bound to the element the gesture started on, so the whole
  // drag lives on the handles — the pane itself is reused across renders.
  for (const handle of handles) {
    handle.addEventListener(
      'touchstart',
      (ev) => {
        const touch = ev.touches[0];
        if (!touch || ev.target.closest('button')) return;
        startY = touch.clientY;
        offset = 0;
        dragging = true;
        pane.style.transition = 'none';
      },
      { passive: true },
    );
    handle.addEventListener(
      'touchmove',
      (ev) => {
        if (!dragging) return;
        const touch = ev.touches[0];
        if (!touch) return;
        offset = Math.max(0, touch.clientY - startY);
        pane.style.transform = `translateY(${offset}px)`;
      },
      { passive: true },
    );
    handle.addEventListener('touchend', end, { passive: true });
    handle.addEventListener('touchcancel', end, { passive: true });
  }
}

/** Keyboard inset below which the viewport is just browser chrome, not a keyboard. */
const CREATE_DRAWER_KEYBOARD_MIN_PX = 80;

function syncCreateDrawerKeyboardLayout() {
  const pane = getCreateDrawerPane();
  const vv = window.visualViewport;
  // Measure the viewport rather than what has focus: tying this to focus makes
  // the drawer resize on the mousedown that precedes a Cancel/Add tap, which
  // moves the button out from under the finger before the click lands.
  const inset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  if (!pane || inset < CREATE_DRAWER_KEYBOARD_MIN_PX) {
    pane?.classList.remove('de-pane--drawer-keyboard');
    document.documentElement.style.removeProperty('--create-drawer-keyboard-inset');
    return;
  }
  pane.classList.add('de-pane--drawer-keyboard');
  document.documentElement.style.setProperty('--create-drawer-keyboard-inset', `${inset}px`);
}

function bindCreateDrawerKeyboardLayout() {
  if (createDrawerKeyboardBound) {
    syncCreateDrawerKeyboardLayout();
    return;
  }
  createDrawerKeyboardBound = true;
  document.addEventListener('focusin', syncCreateDrawerKeyboardLayout, true);
  window.visualViewport?.addEventListener('resize', syncCreateDrawerKeyboardLayout);
  window.visualViewport?.addEventListener('scroll', syncCreateDrawerKeyboardLayout);
}

function releaseCreateDrawerKeyboardLayout() {
  getCreateDrawerPane()?.classList.remove('de-pane--drawer-keyboard');
  document.documentElement.style.removeProperty('--create-drawer-keyboard-inset');
  if (!createDrawerKeyboardBound) return;
  createDrawerKeyboardBound = false;
  document.removeEventListener('focusin', syncCreateDrawerKeyboardLayout, true);
  window.visualViewport?.removeEventListener('resize', syncCreateDrawerKeyboardLayout);
  window.visualViewport?.removeEventListener('scroll', syncCreateDrawerKeyboardLayout);
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
  // While a create drawer is up the footer is behind the scrim, so its save
  // action belongs to the drawer's own button instead.
  if (isCreateDrawerOpen()) {
    setCreateDrawerSubmit(submitFn);
    return;
  }
  footerSaveNav = footerSaveNavForEditor();
  footerSaveHandler = footerSaveNav && submitFn ? submitFn : null;
  if (!footerSaveHandler) footerSaveNav = null;
  syncFooterNav();
}

function clearEditorFooterSave() {
  if (isCreateDrawerOpen()) return;
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
  const { create, save, icon, label, title, saveLabel = 'Save' } = opts;
  btn.classList.toggle('footer-nav-btn--create', !!create);
  btn.classList.toggle('footer-nav-btn--save', !!save);
  btn.querySelector('.footer-nav-save-label')?.remove();
  if (save) {
    iconEl.innerHTML = navIcon('check-square', 20);
    const saveText = document.createElement('span');
    saveText.className = 'footer-nav-save-label';
    saveText.textContent = saveLabel;
    btn.appendChild(saveText);
    btn.setAttribute('aria-label', saveLabel);
    btn.title = saveLabel;
    return;
  }
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
  const save = footerNavShowsSave('work');
  const create = !save && footerNavShowsCreate('work');
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
    save,
    icon: 'briefcase',
    label: 'Projects',
    title: 'New project',
    saveLabel: 'Save project',
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
  const save = footerNavShowsSave('clients');
  const create = !save && footerNavShowsCreate('clients');
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
    save,
    icon: 'users',
    label: 'Clients',
    title: 'New client',
    saveLabel: 'Save client',
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
/** Primary scroll roots per panel — nested overflow regions must not collapse the footer. */
const FOOTER_PANEL_SCROLL_ROOT_SELECTOR =
  '.home-dashboard-scroll, .profile-panel-scroll, .schedule-panel-scroll, .ch-list, .ch-messages, .de-list, .em-detail, .search-overlay-results, .re-form-scroll, .de-sc-dir-body';
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
  renderFooterNavBadges();
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
  renderFooterNavBadges();
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
  // Only the panel shell or its primary scroll root should drive footer collapse.
  if (target !== panel && !target.matches(FOOTER_PANEL_SCROLL_ROOT_SELECTOR)) return;

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
  renderFooterNavBadges();
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
    empty.textContent = q ? 'No Matches.' : 'Search Sections And Clients…';
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
  renderFooterNavBadges();
  void setAppIconBadge(reviewsPendingCount);
}

function renderFooterNavBadges() {
  const badge = document.getElementById('footer-home-badge');
  const btn = document.getElementById('footer-nav-home');
  if (!badge || !btn) return;

  const n = reviewsPendingCount;
  if (n > 0) {
    badge.hidden = false;
    badge.textContent = n > 99 ? '99+' : String(n);
    const hint = `${n} review${n === 1 ? '' : 's'} pending`;
    btn.setAttribute(
      'aria-label',
      footerNavCollapsed ? `Show navigation (${hint})` : `Home (${hint})`,
    );
  } else {
    badge.hidden = true;
    badge.textContent = '0';
    btn.setAttribute('aria-label', footerNavCollapsed ? 'Show navigation' : 'Home');
  }
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

function isRuleExpired(rule) {
  if (!rule?.expiresAt) return false;
  const t = new Date(rule.expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

function formatRuleExpiresLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toRuleDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromRuleDatetimeLocalValue(local) {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function defaultRuleExpiresLocalValue() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return toRuleDatetimeLocalValue(d.toISOString());
}

function ruleSubline(rule) {
  const bits = [];
  if (rule.status) bits.push(rule.status);
  bits.push(rule.notify ? 'Notify' : 'Silent');
  if (!rule.enabled) bits.push('Off');
  if (rule.expiresAt) {
    bits.push(isRuleExpired(rule) ? 'Expired' : `Until ${formatRuleExpiresLabel(rule.expiresAt)}`);
  }
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
  btn.className = `ch-list-item${activeId === rule.id ? ' active' : ''}${rule.enabled === false || isRuleExpired(rule) ? ' re-list-disabled' : ''}`;
  btn.dataset.id = rule.id;
  btn.innerHTML = `
    <span class="ch-item-row">
      <span class="ch-item-title">${escHtml(rule.title || rule.status)}</span>
      <span class="ch-item-date">${escHtml(formatChatDate(rule.updatedAt || rule.createdAt))}</span>
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
      placeholder: `Search ${rules.length} ${rules.length === 1 ? 'Rule' : 'Rules'}`,
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
    mountCreateDrawerChrome(pane);
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
  flushTitleFocus('rules');
  finishSidebarListScroll(root, savedSidebarScroll);
}

async function openRuleEditor(id) {
  await flushRuleAutosave();
  if (ruleState.dirty && ruleState.activeId && ruleState.activeId !== id) {
    if (!(await confirmDiscardChanges())) return;
  }
  ruleState.activeId = id;
  ruleState.dirty = false;
  if (!isCreateDrawerOpen('rules')) getRuleEditor()?.classList.add('de-pane-active');
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

  const inDrawer = isCreateDrawerOpen('rules');
  const header = createPaneSubheader({
    back: inDrawer ? null : { label: 'Back to rules', onClick: () => closeRuleEditor() },
    title: rule.title || rule.status || 'Rule',
    subtitle: rule.status || '',
    beforeIcons: [agentBtn],
    icons: inDrawer
      ? []
      : [
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
  requestTitleFocus('rules', titleIn);

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

  const expiresLb = document.createElement('label');
  expiresLb.className = 're-check';
  const expiresCb = document.createElement('input');
  expiresCb.type = 'checkbox';
  expiresCb.checked = !!rule.expiresAt;
  expiresLb.append(expiresCb, document.createTextNode(' Expires'));

  const expiresAtIn = document.createElement('input');
  expiresAtIn.className = 'de-input';
  expiresAtIn.type = 'datetime-local';
  expiresAtIn.value = toRuleDatetimeLocalValue(rule.expiresAt);
  expiresAtIn.disabled = !expiresCb.checked;
  expiresAtIn.style.marginTop = '0.4rem';

  const expiresWrap = document.createElement('div');
  expiresWrap.className = 're-expires-field';
  expiresWrap.appendChild(expiresLb);
  expiresWrap.appendChild(expiresAtIn);

  const syncExpiresUi = () => {
    expiresAtIn.disabled = !expiresCb.checked;
    if (expiresCb.checked && !expiresAtIn.value) {
      expiresAtIn.value = defaultRuleExpiresLocalValue();
    }
    ruleState.dirty = true;
  };
  expiresCb.addEventListener('change', syncExpiresUi);
  expiresAtIn.addEventListener('input', () => { ruleState.dirty = true; });
  expiresAtIn.addEventListener('change', () => { ruleState.dirty = true; });

  appendRuleField(form, 'Title', titleIn);
  appendRuleField(form, 'Status tag', statusIn);
  appendRuleField(form, 'Description', descIn);
  appendRuleField(form, 'Keywords / phrases', phrasesIn);
  appendRuleField(form, 'Match mode', matchSel);
  appendRuleField(form, 'Search in', fieldsWrap);
  form.appendChild(notifyLb);
  form.appendChild(enabledLb);
  form.appendChild(expiresWrap);
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
    expiresCb,
    expiresAtIn,
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
    expiresAt: inputs.expiresCb.checked ? fromRuleDatetimeLocalValue(inputs.expiresAtIn.value) : null,
  };
}

let ruleAutosaveTimer = null;
let ruleAutosaveFlush = null;

function serializeRulePayload(payload) {
  return JSON.stringify(payload);
}

function syncRuleListItem(id, payload, savedRule) {
  const rule = ruleState.rules.find((r) => r.id === id);
  if (rule) Object.assign(rule, payload, savedRule || {});
  const item = getRuleEditor()?.querySelector(`.ch-list-item[data-id="${CSS.escape(id)}"]`);
  if (!item) return;
  const titleEl = item.querySelector('.ch-item-title');
  if (titleEl) titleEl.textContent = payload.title || payload.status || 'Rule';
  const dateEl = item.querySelector('.ch-item-date');
  if (dateEl) {
    const when = (savedRule && (savedRule.updatedAt || savedRule.createdAt)) || (rule && (rule.updatedAt || rule.createdAt));
    dateEl.textContent = formatChatDate(when);
  }
  const subEl = item.querySelector('.de-item-slug');
  if (subEl && rule) subEl.textContent = ruleSubline(rule);
  item.classList.toggle('re-list-disabled', rule?.enabled === false || isRuleExpired(rule));
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
    inputs.expiresCb,
    inputs.expiresAtIn,
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
    if (inputs.expiresCb.checked && !payload.expiresAt) {
      setFormFieldState(inputs.expiresAtIn, 'invalid');
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
      syncRuleListItem(rule.id, payload, data.rule);
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
  armTitleFocus('rules');
  if (ruleState.dirty && !(await confirmDiscardChanges())) {
    cancelTitleFocus();
    return;
  }
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
        expiresAt: null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const newId = data.rule.id;
    ruleState.activeId = newId;
    ruleState.dirty = false;
    // The rule row has to exist before its form can be edited, so Cancel here
    // means "delete the placeholder I just made".
    beginCreateDrawer({
      key: 'rules',
      title: 'New Rule',
      submitLabel: 'Add',
      onSubmit: async () => {
        await flushRuleAutosave();
        finishCreateDrawer();
        getRuleEditor()?.classList.add('de-pane-active');
        renderRulesEditor();
      },
      onDismiss: () => {
        void deleteRule(newId);
      },
    });
    // `loadRulesTab` renders the pane for the id set above; opening the editor
    // on top of that would re-render and drop the auto-focused title field.
    await loadRulesTab();
  } catch (e) {
    cancelTitleFocus();
    alert(`Could not create rule: ${e.message}`);
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
let emailPollTimer = null;
let inboxBadgeTimer = null;

const BADGE_CACHE = 'reave-badge-v1';
const BADGE_URL = '/badge-count';

function navigateToEmail(id) {
  if (!id) return;
  pendingEmailDeepLinkId = id;
  setActiveMap('email', { force: true, emailId: id });
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

function syncAdminDeepLinkUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return;
    history.replaceState({}, '', u.pathname + u.search + u.hash);
  } catch {}
}

/** Mobile inbox is list-only until em-pane-active — ensure detail opens after deep links. */
function ensureEmailMobilePaneOpen() {
  if (!isMobileTabs() || !emailState.activeId) return;
  getEmailPanel()?.classList.add('em-pane-active');
}

function resumeEmailDeepLinkFromUrl() {
  const emailId = parseEmailDeepLinkFromUrl();
  if (!emailId) return;
  if (MAP?.type !== 'email') {
    pendingEmailDeepLinkId = emailId;
    setActiveMap('email', { force: true, emailId });
    return;
  }
  if (emailState.activeId === emailId) {
    ensureEmailMobilePaneOpen();
    return;
  }
  if (emailState.allEvents.length) void openEmailFromDeepLink(emailId);
  else pendingEmailDeepLinkId = emailId;
}

function handleNotificationOpen(url) {
  if (!url) return;
  try {
    const u = new URL(url, window.location.origin);
    syncAdminDeepLinkUrl(u.href);
    const tab = u.searchParams.get('tab');
    const emailId = u.searchParams.get('email')?.trim();
    if (tab === 'email' && emailId) {
      pendingEmailDeepLinkId = emailId;
      setActiveMap('email', { force: true, emailId });
      return;
    }
    const workSlug = u.searchParams.get('slug')?.trim();
    if (tab === 'work' && workSlug) {
      queueWorkDeepLink(workSlug);
      setActiveMap('work', { force: true, workSlug });
      return;
    }
    const chatId = u.searchParams.get('chat')?.trim();
    if (tab === 'chats' && chatId) {
      queueChatDeepLink(chatId);
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
  void finalizeChatTitleIfNeeded(id).then(() => abandonDisposableChat(id)).then(async () => {
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

function isProjectMatchSuggested(ev) {
  if (!ev || ev.automationAckAt) return false;
  if (!ev.jobSlug) return false;
  const action = String(ev.action || '').toLowerCase();
  if (action === 'filed' || action === 'project_reply') return false;
  if (ev.automationKind === 'project_created') return false;
  if (action === 'matched') return true;
  return action === 'review' && ev.category === 'client';
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
  if (isProjectMatchSuggested(ev)) return true;
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
  syncReviewBadge(pendingReviewCount(emailState.allEvents));
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
}

async function refreshFooterBadgesQuiet() {
  try {
    const [dashRes, inboxRes] = await Promise.all([
      fetch('/api/admin/dashboard', { cache: 'no-store' }),
      fetch('/api/email/inbox?limit=100', { cache: 'no-store' }),
    ]);

    const inboxOk = inboxRes.ok;
    let dashStats = null;

    if (dashRes.ok) {
      const dash = await dashRes.json();
      if (dash.ok) {
        dashStats = dash.stats;
        syncDashboardFooterBadgesWithoutReview(dash.stats);
      }
    }

    if (inboxOk) {
      const inboxData = await inboxRes.json();
      const events = inboxData.events || [];
      if (MAP.type === 'email' && emailState.allEvents.length) {
        mergeEmailSeenFromServer(events);
      }
      const badgeCount =
        dashStats?.reviewsPending ??
        dashStats?.automationPending ??
        inboxData.digest?.reviewsPending;
      await syncInboxAppBadge(events, badgeCount);
      return;
    }

    if (dashStats) syncReviewBadge(dashStats.reviewsPending ?? dashStats.automationPending ?? 0);
    else await setAppIconBadge(reviewsPendingCount);
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
    const emailId = opts.sourceEmailId?.trim?.() || null;

    if (emailId) {
      let existing = chatState.threads.find((t) => t.source_email_id === emailId);
      if (!existing) {
        chatState.threads = await fetchChatThreads();
        existing = chatState.threads.find((t) => t.source_email_id === emailId);
      }
      if (existing) {
        chatState.pendingDraft = null;
        chatState.pendingAutoSend = false;
        if (activeKey === 'chats' && chatState.activeId === existing.id) return;
        await openChat(existing.id, { force: true });
        return;
      }
    }

    const payload = {};
    if (emailId) payload.sourceEmailId = emailId;
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

initTodoPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  appendEmptyDetailPane,
  askAgentWithPrompt,
  createPortalShareBtn,
  attachAutosuggestKeyboardNav,
  SIDEBAR_LIST_GRIP,
  KNOWLEDGE_API,
});

initDocumentsPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  isCreateDrawerOpen,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  appendEmptyDetailPane,
  clearEditorFooterSave,
  setEditorFooterSave,
  setFormFieldState,
  flashFormFieldSaved,
  askAgentWithPrompt,
  buildAgentContentPrompt,
  MAP,
  activeKey,
});

initKnowledgePanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  appendEmptyDetailPane,
  askAgentWithPrompt,
  titleFromKnowledgeMarkdown,
  SIDEBAR_LIST_GRIP,
  KNOWLEDGE_API,
  MAP,
  activeKey,
});

initSchedulePanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  navigateToClient,
  attachAutosuggestKeyboardNav,
  appendEmptyDetailPane,
  MAP,
  activeKey,
});

initClientsPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  beginCreateDrawer,
  finishCreateDrawer,
  isCreateDrawerOpen,
  mountCreateDrawerChrome,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  appendEmptyDetailPane,
  clearEditorFooterSave,
  setEditorFooterSave,
  setFormFieldState,
  flashFormFieldSaved,
  createPortalShareBtn,
  isMobileTabs,
  MAP,
  activeKey,
});

initChatPanel({
  setActiveMap,
  osAlert,
  syncFooterNav,
  appendEmptyDetailPane,
  captureSidebarListScroll,
  finishSidebarListScroll,
  askAgentWithPrompt,
  setChatComposeFocused,
  syncTopbarPanelContext,
  syncAdminSplitView,
  scanPanelSidebars,
  SIDEBAR_LIST_GRIP,
  MAP,
  activeKey,
});

initWorkPanel({
  setActiveMap,
  navigateToEmail,
  navigateToChat,
  navigateToTodo,
  navigateToClient,
  navigateToNewTodoForProject,
  askAgentWithPrompt,
  createPortalShareBtn,
  renderLinkTrackStatus,
  formatChatDate,
  formatTodoDueDate,
  sharePortalLink,
  loadHomeDashboard,
  reviewsPendingCount,
  clearEditorFooterSave,
  mountCreateDrawerChrome,
  appendEmptyDetailPane,
  captureSidebarListScroll,
  finishSidebarListScroll,
  captureFilterTabsScroll,
  mountFilterTabsScroll,
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  getCreateDrawerPane,
  armTitleFocus,
  flushTitleFocus,
  mapPaneTitle,
  osAlert,
  todoState,
  normalizeTodoItemDates,
  todoSubline,
  attachAutosuggestKeyboardNav,
  flushTodoAutosave,
  saveActiveTodoDraft,
  cancelTitleFocus,
  setFormFieldState,
  flashFormFieldSaved,
  isCreateDrawerOpen,
  showChatToast,
  copyChatText,
});

function buildAgentContentPrompt(intro, metaLines, body) {
  const lines = [intro, '', ...metaLines];
  const trimmed = (body || '').trim();
  if (trimmed) lines.push('', '---', trimmed.slice(0, 12000));
  return lines.join('\n');
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
    lines.push(
      `Expires: ${
        rule.expiresAt
          ? `${formatRuleExpiresLabel(rule.expiresAt)}${isRuleExpired(rule) ? ' (expired)' : ''}`
          : 'Indefinite'
      }`,
    );
    lines.push('', 'Please suggest improvements or explain how this rule works.');
    await askAgentWithPrompt(lines.join('\n'));
  } catch (e) {
    osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
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
      releaseOsDialogKeyboardLayout();
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
          `<input id="em-book-address" type="text" autocomplete="street-address" autocapitalize="words" placeholder="Business or street address" value="${escHtml(readScheduleLastAddress())}">` +
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
    bindOsDialogKeyboardLayout();
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

  if (container.querySelector('.em-project-match-add')) {
    primaryBtn?.addEventListener('click', () => {
      void confirmSuggestedProjectMatch(
        {
          emailId: ev.id,
          jobSlug: ev.jobSlug,
          jobTitle: ev.jobTitle,
          type: 'project_match',
        },
        primaryBtn,
      );
    });
    altBtn?.addEventListener('click', () => {
      void rejectSuggestedProjectMatch(
        {
          emailId: ev.id,
          type: 'project_match',
        },
        altBtn,
      );
    });
    return;
  }

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

async function confirmSuggestedProjectMatch(item, btn) {
  const emailId = item?.emailId;
  const slug = item?.jobSlug;
  if (!emailId || !slug) return;
  let ev = emailState.allEvents.find((e) => e.id === emailId);
  if (!ev) {
    setActiveMap('email', { force: true, emailId });
    return;
  }
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }
  try {
    await postEmailProject(ev, { mode: 'link', slug }, { skipNavigate: true });
    removeReviewAlertBanner(emailId);
    updateInboxBadgesFromState();
    if (emailState.activeId === emailId) renderEmailPanel();
  } catch (e) {
    await osAlert({ title: 'Could not add to project', bodyHtml: escHtml(e.message) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
  }
}

async function rejectSuggestedProjectMatch(item, btn) {
  const emailId = item?.emailId;
  if (!emailId) return;
  const prevLabel = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(emailId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectProjectMatch: true }),
    });
    const data = await readApiJson(res);
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.event) {
      const idx = emailState.allEvents.findIndex((e) => e.id === emailId);
      if (idx !== -1) emailState.allEvents[idx] = data.event;
    }
    removeReviewAlertBanner(emailId);
    updateInboxBadgesFromState();
    if (emailState.activeId === emailId) renderEmailPanel();
  } catch (e) {
    await osAlert({ title: 'Could not dismiss match', bodyHtml: escHtml(e.message) });
  } finally {
    if (btn) {
      btn.disabled = false;
      if (prevLabel) btn.textContent = prevLabel;
    }
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
        `<span class="em-project-menu-meta">${escHtml(workStatusLabel(job.status))}</span>`;
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
  return [
    `From: ${ev.from || '(unknown)'}`,
    `Subject: ${ev.subject || '(no subject)'}`,
    `Received: ${received}`,
    '',
    'Please wait for instructions on how to deal with this email.',
  ].join('\n');
}

async function fetchFullEmailRecord(ev) {
  if (!ev?.id) return ev;
  if (ev._fullLoaded && (ev.bodyText || ev.bodyHtml)) return ev;
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

/** Prefer the next (older) message in the current filter; else the previous (newer). */
function adjacentEmailIdAfterRemove(id) {
  const list = filteredInboxEvents();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  return list[idx + 1]?.id ?? list[idx - 1]?.id ?? null;
}

async function deleteEmail(ev) {
  closeOpenSwipeRow();
  const wasActive = emailState.activeId === ev.id;
  const nextId = wasActive ? adjacentEmailIdAfterRemove(ev.id) : null;
  try {
    const res = await fetch(`/api/email/inbox/${encodeURIComponent(ev.id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    await readApiJson(res);
    emailState.allEvents = emailState.allEvents.filter((e) => e.id !== ev.id);
    if (wasActive) {
      if (nextId && emailState.allEvents.some((e) => e.id === nextId)) {
        emailState.activeId = nextId;
        queueEmailSeen(nextId);
      } else {
        emailState.activeId = null;
      }
    }
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
      (ev.verificationCode
        ? `<span class="em-status em-otp-hint">${escHtml(ev.verificationCode)}</span>`
        : '') +
      (Array.isArray(ev.attachments) && ev.attachments.length
        ? `<span class="em-status em-attach-hint" title="${escHtml(
            ev.attachments.map((a) => a.filename || 'file').join(', '),
          )}">${ev.attachments.length} file${ev.attachments.length === 1 ? '' : 's'}</span>`
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
  ensureEmailMobilePaneOpen();
  syncInboxAppBadge(emailState.allEvents);
}

function renderEmailFilterTabs(savedScrollLeft = 0) {
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
  mountFilterTabsScroll(nav, savedScrollLeft);
  return nav;
}

function renderEmailSidebar(savedFilterScroll = 0) {
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
      placeholder: `Search ${countForTab} ${countForTab === 1 ? 'Email' : 'Emails'}`,
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
    below: renderEmailFilterTabs(savedFilterScroll),
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
  input.placeholder = 'Search Clients Or Type An Email…';
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
    input.placeholder = recipients.length ? 'Add Another…' : 'Search Clients Or Type An Email…';
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

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function clipboardLooksLike(text) {
  if (!navigator.clipboard?.readText) return null;
  try {
    return (await navigator.clipboard.readText()) === text;
  } catch {
    return null;
  }
}

async function copyEmailVerificationCode(code, nearEl) {
  const text = String(code || '').trim();
  if (!text) return false;
  let wrote = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      wrote = true;
    }
  } catch {
    wrote = false;
  }
  if (!wrote) wrote = fallbackCopyText(text);
  // iOS often resolves writeText without updating the clipboard when there was no
  // user gesture (e.g. auto-copy on open). Refuse to claim success if we can tell.
  const verified = await clipboardLooksLike(text);
  if (!wrote || verified === false) {
    showChatToast('Tap the code to copy', nearEl);
    return false;
  }
  showChatToast('Copied — switch back to your browser to paste', nearEl);
  return true;
}

function openEmailEvent(id) {
  queueEmailSeen(id);
  emailState.activeId = id;
  emailState.composing = false;
  emailState.replyToId = null;
  renderEmailPanel();
  ensureEmailMobilePaneOpen();
}

function renderEmailPanel() {
  const root = getEmailPanel();
  if (!root) return;
  const savedSidebarScroll = captureSidebarListScroll(root);
  const savedFilterScroll = captureFilterTabsScroll(root);
  root.innerHTML = '';
  root.appendChild(renderEmailSidebar(savedFilterScroll));

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
  const linkedChat = chatState.threads.find((t) => t.source_email_id === ev.id);
  const alreadyInLinkedChat = linkedChat && chatState.activeId === linkedChat.id;
  if (!alreadyInLinkedChat) {
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
  } else if (shouldShowEmailProjectActions(ev)) {
    beforeIcons.push(createEmailProjectDropdown(ev));
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
  if (ev.verificationCode) {
    detailHtml +=
      `<div class="em-otp-card" data-otp-card>` +
        `<div class="em-otp-card-title">Verification code</div>` +
        `<button type="button" class="em-otp-code-btn" data-otp-code data-code="${escHtml(ev.verificationCode)}">${escHtml(ev.verificationCode)}</button>` +
        `<p class="em-otp-hint">Tap the code to copy — switch back to your browser and tap <strong>Paste</strong> above the keyboard.</p>` +
      `</div>`;
  }
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
  } else if (isProjectMatchSuggested(ev)) {
    const attachmentCount = Array.isArray(ev.attachments) ? ev.attachments.length : 0;
    const attachmentHint =
      attachmentCount > 0
        ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} will be added to the project.`
        : 'No attachments on this message.';
    detailHtml +=
      `<div class="em-book-card em-project-match-card">` +
        `<div class="em-book-card-title">Possible project match</div>` +
        `<div class="em-book-card-when">${escHtml(ev.jobTitle || ev.jobSlug || 'Project')}</div>` +
        `<div class="em-book-card-note">Add this email's content to the project notes? ${escHtml(attachmentHint)}</div>` +
      `</div>` +
      `<div class="em-schedule-actions em-schedule-actions-confirm">` +
        `<button type="button" class="em-schedule-action-primary de-new-btn em-project-match-add">Add to project</button>` +
        `<button type="button" class="em-schedule-action-secondary de-new-btn em-project-match-reject">Not this project</button>` +
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
    `</div>`;
  const attachments = Array.isArray(ev.attachments) ? ev.attachments : [];
  if (attachments.length) {
    detailHtml +=
      `<div class="em-detail-attachments">` +
        `<div class="em-detail-attachments-title">${attachments.length} attachment${attachments.length === 1 ? '' : 's'}</div>` +
        `<ul class="em-detail-attachments-list">` +
        attachments
          .map((a) => {
            const name = a.filename || 'attachment';
            const size =
              typeof a.size === 'number' && a.size > 0
                ? a.size < 1024
                  ? `${a.size} B`
                  : a.size < 1024 * 1024
                    ? `${(a.size / 1024).toFixed(a.size < 10240 ? 1 : 0)} KB`
                    : `${(a.size / (1024 * 1024)).toFixed(1)} MB`
                : '';
            const href = `/api/email/inbox/${encodeURIComponent(ev.id)}/attachments/${encodeURIComponent(a.id)}`;
            return (
              `<li class="em-detail-attachment">` +
                `<a class="em-detail-attachment-link" href="${escHtml(href)}" download="${escHtml(name)}">` +
                  `<span class="em-detail-attachment-name">${escHtml(name)}</span>` +
                  (size || a.contentType
                    ? `<span class="em-detail-attachment-meta">${escHtml(
                        [a.contentType, size].filter(Boolean).join(' · '),
                      )}</span>`
                    : '') +
                `</a>` +
              `</li>`
            );
          })
          .join('') +
        `</ul>` +
      `</div>`;
  }
  const bodyHtmlSource = (ev.bodyHtml || '').trim();
  const plainBody = ev.bodyText || ev.bodySnippet || '';
  const showPlainBody = !bodyHtmlSource && plainBody && plainBody !== summary;
  if (bodyHtmlSource) {
    detailHtml +=
      `<div class="em-detail-body-html"><iframe class="em-detail-body-frame" sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" title="Email message"></iframe></div>`;
  } else if (showPlainBody) {
    detailHtml += `<div class="em-detail-body">${linkifyPlainText(plainBody)}</div>`;
  } else if (!attachments.length && !summary) {
    detailHtml += `<div class="em-detail-body em-detail-body-empty">(no body text)</div>`;
  }
  detail.innerHTML = detailHtml;
  const bodyFrame = detail.querySelector('.em-detail-body-frame');
  if (bodyFrame && bodyHtmlSource) bodyFrame.srcdoc = bodyHtmlSource;
  detail.querySelector('[data-otp-code]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    const code = btn?.getAttribute('data-code') || ev.verificationCode;
    void copyEmailVerificationCode(code, btn);
  });
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
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
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
  syncChatRunningPoll();
  syncFooterNav();
  syncProfileMenuActive();
  syncTopbarPanelContext();
  syncAdminSplitView(MAP?.type);
  scanPanelSidebars();
}

boot().catch(showBootError);

window.addEventListener('pageshow', () => {
  resumeEmailDeepLinkFromUrl();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(() => refreshInboxBadgeQuiet())
    .catch(() => undefined);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'reave-inbox-push') refreshInboxBadgeQuiet(true);
    if (event.data?.type === 'reave-notification-open') handleNotificationOpen(event.data.url);
    if (event.data?.type === 'reave-alert-dismiss' && event.data.alertId) {
      void dismissPushAlertById(event.data.alertId).catch(() => undefined);
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopHealth();
    stopEmailPoll();
    stopInboxBadgePoll();
    stopChatRunningPoll();
    stopDeployPoll();
  } else {
    syncHealthLifecycle();
    syncEmailPoll();
    syncInboxBadgePoll();
    syncChatRunningPoll();
    startDeployPoll();
    resumeEmailDeepLinkFromUrl();
  }
});
