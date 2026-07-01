/**
 * Shared admin panel UI primitives (back chevrons, icon toolbar buttons).
 * Import from os-map-loader.js and any future admin client modules.
 */

export const IOS_ICONS = {
  'chevron-left':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  share:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  square: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  sparkles:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>',
};

/** Icon-only toolbar button (44pt touch target, iOS-style). */
export function createIosIconBtn(opts = {}) {
  const { iconKey, label, className = 'ios-icon-btn', onClick } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS[iconKey] || '';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick?.(btn);
  });
  return btn;
}

/** Chevron-only back control for mobile panel subheaders (.de-header). */
export function createPanelBackBtn(opts = {}) {
  const { label = 'Back', onClick } = opts;
  return createIosIconBtn({
    iconKey: 'chevron-left',
    label,
    className: 'ios-icon-btn de-back-btn',
    onClick,
  });
}

/** Circular create FAB used in sidebar list subheaders. */
export function createFabNewBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'de-new-btn ch-new-btn';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS.plus || '';
  btn.addEventListener('click', onClick);
  return btn;
}

/** Case-insensitive filter helper for client-side list search. */
export function matchesListSearch(query, ...parts) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const hay = parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

const SEARCH_CLEAR_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function syncSearchClearBtn(input, clearBtn) {
  if (!input || !clearBtn) return;
  clearBtn.hidden = !input.value.length;
}

function createSearchClearBtn(input, onClear) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'panel-list-search-clear search-overlay-clear';
  btn.setAttribute('aria-label', 'Clear search');
  btn.innerHTML = SEARCH_CLEAR_ICON;
  btn.hidden = !input.value.length;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    input.value = '';
    syncSearchClearBtn(input, btn);
    onClear?.('');
    input.focus();
  });
  return btn;
}

const LIST_EMPTY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>';

/** Centered list empty state — icon + message, flex-filled in scroll lists. */
export function createCenteredListEmpty(opts = {}) {
  const { text, innerHtml } = opts;
  const el = document.createElement('div');
  el.className = 'list-empty-state';
  const body = innerHtml != null ? innerHtml : (text || 'Nothing here yet.');
  el.innerHTML =
    `<div class="list-empty-state-icon">${LIST_EMPTY_ICON}</div>` +
    `<div class="list-empty-state-body">${body}</div>`;
  return el;
}

/** Sidebar list empty row — tappable to create when `onAction` is set and not a search miss. */
export function createListEmptyState(opts = {}) {
  const { text, filtered = false, onAction, actionText } = opts;

  if (filtered || !onAction) {
    const el = document.createElement('div');
    el.className = 'de-empty';
    el.textContent = text || (filtered ? 'No matches.' : 'Nothing here yet.');
    return el;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'de-empty de-empty-action';
  btn.textContent = actionText || text || 'Create new';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAction(btn);
  });
  return btn;
}

/** Detail-pane placeholder — optional tap-to-create for the whole block. */
export function createPanePlaceholder(opts = {}) {
  const { innerHtml, onAction, ariaLabel } = opts;
  const el = document.createElement(onAction ? 'button' : 'div');
  if (onAction) {
    el.type = 'button';
    el.className = 'de-placeholder de-placeholder-action';
    el.setAttribute('aria-label', ariaLabel || 'Create new');
    el.addEventListener('click', onAction);
  } else {
    el.className = 'de-placeholder';
  }
  el.innerHTML = innerHtml;
  return el;
}

/**
 * Sidebar list subheader — search field with optional create FAB (mobile only via CSS).
 *
 * @param {object} opts
 * @param {object} [opts.search] — `{ value, placeholder, ariaLabel?, onInput(value) }`
 * @param {number} [opts.itemCount] — hide search when below LIST_SEARCH_MIN_ITEMS (unless query active)
 * @param {false|object} [opts.addNew=false] — `{ label, onClick }` or `false` for search-only
 * @param {Node|Node[]} [opts.below] — nodes rendered below the search row (e.g. inbox filter tabs)
 */
export const LIST_SEARCH_MIN_ITEMS = 8;

function shouldShowListSearch(search, itemCount) {
  if (!search) return false;
  if (String(search.value ?? '').trim()) return true;
  if (itemCount == null) return true;
  return itemCount >= LIST_SEARCH_MIN_ITEMS;
}

export function listSearchAddNew(opts = {}) {
  const addNew = opts.addNew === false ? null : opts.addNew;
  const newBtn = addNew ? createFabNewBtn(addNew.label || 'New', addNew.onClick) : null;
  const belowNodes = opts.below == null ? [] : [].concat(opts.below).filter(Boolean);
  const showSearch = shouldShowListSearch(opts.search, opts.itemCount);

  if (showSearch) {
    const wrap = document.createElement('div');
    const stacked = belowNodes.length > 0;
    wrap.className =
      'panel-list-subheader' +
      (newBtn ? '' : ' panel-list-subheader--search-only') +
      (stacked ? ' panel-list-subheader--stacked' : '');
    const field = document.createElement('div');
    field.className = 'panel-list-search-field control-field';
    const input = document.createElement('input');
    input.className = 'panel-list-search';
    input.type = 'search';
    input.placeholder = opts.search.placeholder || 'Search…';
    input.value = opts.search.value ?? '';
    input.setAttribute('aria-label', opts.search.ariaLabel || opts.search.placeholder || 'Search');
    const clearBtn = createSearchClearBtn(input, (value) => opts.search.onInput?.(value));
    input.addEventListener('input', (e) => {
      syncSearchClearBtn(input, clearBtn);
      opts.search.onInput?.(e.target.value, e);
    });
    field.appendChild(input);
    field.appendChild(clearBtn);
    if (newBtn) field.appendChild(newBtn);
    wrap.appendChild(field);
    for (const node of belowNodes) wrap.appendChild(node);
    return { el: wrap, input };
  }

  if (belowNodes.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'panel-list-subheader panel-list-subheader--stacked';
    if (newBtn) wrap.appendChild(newBtn);
    for (const node of belowNodes) wrap.appendChild(node);
    return { el: wrap, input: null };
  }

  if (newBtn) {
    const toolbar = document.createElement('div');
    toolbar.className = 'panel-list-subheader panel-list-subheader--fab-only';
    toolbar.appendChild(newBtn);
    return { el: toolbar, input: null };
  }

  return null;
}

/** Standard sidebar search row — no inline create FAB (footer nav handles create). */
export function listSearchSubheader(opts = {}) {
  return listSearchAddNew({ ...opts, addNew: false });
}

/**
 * Detail-pane subheader (.de-header): optional back chevron + title/subtitle/actions.
 */
export function createPanelHeader(opts = {}) {
  const header = document.createElement('div');
  header.className = 'de-header';
  if (opts.back) {
    header.appendChild(createPanelBackBtn(opts.back));
  }
  if (opts.title != null && opts.title !== '') {
    const titleEl = document.createElement('span');
    titleEl.className = 'de-doc-name';
    titleEl.textContent = opts.title;
    header.appendChild(titleEl);
  }
  if (opts.subtitle != null && opts.subtitle !== '') {
    const subEl = document.createElement('span');
    subEl.className = 'de-doc-slug';
    subEl.textContent = opts.subtitle;
    header.appendChild(subEl);
  }
  for (const node of opts.nodes || []) {
    if (node) header.appendChild(node);
  }
  if (opts.actions) {
    const actions = document.createElement('div');
    actions.className = 'de-header-actions';
    actions.appendChild(opts.actions);
    header.appendChild(actions);
  }
  return header;
}

const SIDEBAR_W_STORE = 'reave-sidebar-w';
const SIDEBAR_DEFAULT_W = 260;
const SIDEBAR_MIN_W = 200;
const SIDEBAR_MAX_W = 520;
const SPLIT_VIEW_TYPES = new Set([
  'email',
  'chats',
  'clients',
  'work',
  'knowledge',
  'documents',
  'rules',
  'schedule',
]);
const SIDEBAR_PANEL_IDS = [
  'email-panel',
  'chat-panel',
  'clients-editor',
  'work-editor',
  'knowledge-editor',
  'doc-editor',
  'rule-editor',
  'schedule-panel',
];
const SIDEBAR_MQ = window.matchMedia('(min-width: 640px)');

let _sidebarDrag = null;

function readSidebarWidthVar() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : SIDEBAR_DEFAULT_W;
}

function applySidebarWidth(px) {
  const w = Math.round(Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, px)));
  document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  return w;
}

/** Desktop split-view panels: sidebar + main pane both visible. */
export function syncAdminSplitView(mapType) {
  const use = SIDEBAR_MQ.matches && SPLIT_VIEW_TYPES.has(mapType);
  document.body.classList.toggle('admin-split-view', use);
}

export function mountSidebarResizer(sidebar) {
  if (!sidebar || sidebar.dataset.resizerMounted === '1') return;
  if (!SIDEBAR_MQ.matches) return;
  sidebar.dataset.resizerMounted = '1';
  const handle = document.createElement('div');
  handle.className = 'ch-sidebar-resizer';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize sidebar');
  sidebar.appendChild(handle);
}

export function scanPanelSidebars() {
  if (!SIDEBAR_MQ.matches) return;
  for (const id of SIDEBAR_PANEL_IDS) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    panel.querySelectorAll('.ch-sidebar, .de-sidebar, .schedule-sidebar').forEach(mountSidebarResizer);
  }
}

function bindSidebarResizeDrag() {
  if (document.documentElement.dataset.sidebarResizeBound === '1') return;
  document.documentElement.dataset.sidebarResizeBound = '1';

  document.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest?.('.ch-sidebar-resizer');
    if (!handle) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    document.body.classList.add('sidebar-resize-active');
    _sidebarDrag = { startX: e.clientX, startW: readSidebarWidthVar() };
  });

  document.addEventListener('pointermove', (e) => {
    if (!_sidebarDrag) return;
    applySidebarWidth(_sidebarDrag.startW + (e.clientX - _sidebarDrag.startX));
  });

  const finishDrag = (e) => {
    if (!_sidebarDrag) return;
    document.querySelectorAll('.ch-sidebar-resizer.dragging').forEach((el) => {
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.classList.remove('dragging');
    });
    document.body.classList.remove('sidebar-resize-active');
    try {
      localStorage.setItem(SIDEBAR_W_STORE, String(readSidebarWidthVar()));
    } catch {
      /* ignore */
    }
    _sidebarDrag = null;
  };

  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);
}

function observePanelSidebars() {
  if (document.documentElement.dataset.sidebarObserverBound === '1') return;
  document.documentElement.dataset.sidebarObserverBound = '1';
  const observer = new MutationObserver(() => scanPanelSidebars());
  for (const id of SIDEBAR_PANEL_IDS) {
    const panel = document.getElementById(id);
    if (panel) observer.observe(panel, { childList: true, subtree: true });
  }
}

export function initSidebarLayout() {
  let saved = SIDEBAR_DEFAULT_W;
  try {
    const n = parseInt(localStorage.getItem(SIDEBAR_W_STORE), 10);
    if (Number.isFinite(n)) saved = n;
  } catch {
    /* ignore */
  }
  applySidebarWidth(saved);
  bindSidebarResizeDrag();
  observePanelSidebars();
  scanPanelSidebars();
}
