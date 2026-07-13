/**
 * Shared admin panel UI primitives (back chevrons, icon toolbar buttons).
 * Import from os-map-loader.js and any future admin client modules.
 */

export const IOS_ICONS = {
  'chevron-left':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  'chevron-right':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
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

/**
 * Shared z-index scale for dropdowns, tooltips, and popovers.
 * Keep in sync with `--z-*` tokens in admin/index.astro and Header.astro.
 * Pass a higher `zIndex` to positionFloatingEl when a specific overlay must sit above others.
 */
export const UI_Z = {
  panel: 10,
  topbar: 20,
  footer: 2000,
  overlay: 5000,
  floating: 10000,
  toast: 10000,
  critical: 99999,
};

/** Read a `--z-*` custom property from :root. */
export function readUiZ(token = 'floating', fallback) {
  const key = token.startsWith('--') ? token : `--z-${token}`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n)) return n;
  return fallback ?? UI_Z[token] ?? UI_Z.floating;
}

const FLOAT_STYLE_PROPS = ['position', 'top', 'left', 'right', 'bottom', 'width', 'zIndex'];

/** Clear inline geometry from a floating overlay. */
export function resetFloatingEl(el) {
  if (!el) return;
  for (const prop of FLOAT_STYLE_PROPS) {
    el.style[prop] = '';
  }
}

/**
 * Pin a menu/popover to a trigger with `position: fixed` so it escapes panel stacking contexts.
 *
 * @param {HTMLElement} el
 * @param {HTMLElement} trigger
 * @param {object} [opts]
 * @param {'start'|'end'} [opts.align='start'] — anchor to trigger's left or right edge
 * @param {number} [opts.gap=4]
 * @param {number} [opts.inset=8]
 * @param {number} [opts.zIndex] — defaults to `--z-floating`
 * @param {boolean} [opts.matchWidth=false]
 */
export function positionFloatingEl(el, trigger, opts = {}) {
  const {
    align = 'start',
    gap = 4,
    inset = 8,
    zIndex = readUiZ('floating'),
    matchWidth = false,
  } = opts;
  if (!el || !trigger) return;

  requestAnimationFrame(() => {
    const rect = trigger.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.top = `${rect.bottom + gap}px`;
    if (align === 'end') {
      el.style.left = 'auto';
      el.style.right = `${Math.max(inset, window.innerWidth - rect.right)}px`;
    } else {
      el.style.left = `${Math.max(inset, Math.min(rect.left, window.innerWidth - el.offsetWidth - inset))}px`;
      el.style.right = 'auto';
    }
    if (matchWidth) el.style.width = `${rect.width}px`;
    el.style.zIndex = String(zIndex);
  });
}

/** Pin a floating overlay at viewport coordinates (context menus, caret popovers). */
export function positionFloatingAt(el, x, y, opts = {}) {
  const { inset = 8, zIndex = readUiZ('floating') } = opts;
  if (!el) return;

  requestAnimationFrame(() => {
    el.style.position = 'fixed';
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(inset, window.innerWidth - rect.width - inset);
    const maxTop = Math.max(inset, window.innerHeight - rect.height - inset);
    el.style.left = `${Math.min(Math.max(x, inset), maxLeft)}px`;
    el.style.top = `${Math.min(Math.max(y, inset), maxTop)}px`;
    el.style.zIndex = String(zIndex);
  });
}

let _floatReposition = null;

/** Keep a trigger-anchored floating overlay aligned on scroll/resize. */
export function bindFloatingReposition(el, trigger, opts = {}) {
  unbindFloatingReposition();
  const handler = () => positionFloatingEl(el, trigger, opts);
  _floatReposition = { handler };
  window.addEventListener('resize', handler);
  window.addEventListener('scroll', handler, true);
  window.visualViewport?.addEventListener('resize', handler);
  window.visualViewport?.addEventListener('scroll', handler);
}

export function unbindFloatingReposition() {
  if (!_floatReposition) return;
  const { handler } = _floatReposition;
  window.removeEventListener('resize', handler);
  window.removeEventListener('scroll', handler, true);
  window.visualViewport?.removeEventListener('resize', handler);
  window.visualViewport?.removeEventListener('scroll', handler);
  _floatReposition = null;
}

/**
 * Open a trigger-anchored floating menu. Returns a close function.
 * @param {{ menu: HTMLElement, trigger: HTMLElement } & object} opts
 */
export function mountFloatingMenu(opts) {
  const { menu, trigger } = opts;
  positionFloatingEl(menu, trigger, opts);
  bindFloatingReposition(menu, trigger, opts);
  return () => {
    resetFloatingEl(menu);
    unbindFloatingReposition();
  };
}

let _openDropdown = null;
let _tooltipEl = null;
let _tooltipTarget = null;

/**
 * Dropdown controller — open/close, fixed positioning, optional z-index override.
 * Use this instead of hand-rolling positionFloatingEl at each call site.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.trigger
 * @param {HTMLElement} opts.menu
 * @param {'start'|'end'} [opts.align='start']
 * @param {number} [opts.zIndex]
 * @param {() => void} [opts.onOpen]
 * @param {() => void} [opts.onClose]
 * @returns {{ open: () => void, close: () => void, toggle: (e?: Event) => void, destroy: () => void }}
 */
export function bindFloatingDropdown(opts = {}) {
  const { trigger, menu, align = 'start', zIndex, onOpen, onClose } = opts;
  if (!trigger || !menu) {
    return { open() {}, close() {}, toggle() {}, destroy() {} };
  }

  const floatOpts = { align, zIndex };

  function close() {
    menu.classList.remove('open');
    resetFloatingEl(menu);
    if (_openDropdown?.close === close) {
      unbindFloatingReposition();
      _openDropdown = null;
    }
    trigger.setAttribute('aria-expanded', 'false');
    onClose?.();
  }

  function open() {
    if (_openDropdown && _openDropdown.close !== close) _openDropdown.close();
    menu.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    positionFloatingEl(menu, trigger, floatOpts);
    bindFloatingReposition(menu, trigger, floatOpts);
    _openDropdown = { close };
    onOpen?.();
  }

  function toggle(e) {
    e?.stopPropagation();
    if (menu.classList.contains('open')) close();
    else open();
  }

  const onTriggerClick = (e) => toggle(e);
  trigger.addEventListener('click', onTriggerClick);

  return {
    open,
    close,
    toggle,
    destroy: () => {
      close();
      trigger.removeEventListener('click', onTriggerClick);
    },
  };
}

/** Close whichever dropdown was opened via bindFloatingDropdown. */
export function closeOpenFloatingDropdown() {
  _openDropdown?.close();
}

function ensureTooltipEl() {
  if (_tooltipEl) return _tooltipEl;
  const el = document.createElement('div');
  el.className = 'ui-float-tooltip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.appendChild(el);
  _tooltipEl = el;
  return el;
}

function positionTooltipEl(tip, target, opts = {}) {
  const { gap = 6, inset = 8, zIndex = readUiZ('tooltip'), alignEnd = false } = opts;
  if (!tip || !target) return;

  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    tip.style.position = 'fixed';
    tip.style.zIndex = String(zIndex);
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    let left = alignEnd
      ? rect.right - tipW
      : rect.left + rect.width / 2 - tipW / 2;
    left = Math.min(Math.max(left, inset), window.innerWidth - tipW - inset);
    let top = rect.top - tipH - gap;
    if (top < inset) top = rect.bottom + gap;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.right = 'auto';
    tip.style.bottom = 'auto';
  });
}

function hideTooltip() {
  if (!_tooltipEl) return;
  _tooltipEl.hidden = true;
  _tooltipTarget = null;
}

function showTooltipFor(target) {
  const text = target?.dataset?.tooltip?.trim();
  if (!target || !text) {
    hideTooltip();
    return;
  }
  const tip = ensureTooltipEl();
  tip.textContent = text;
  tip.hidden = false;
  _tooltipTarget = target;
  positionTooltipEl(tip, target, {
    alignEnd: target.classList.contains('tt-left'),
    zIndex: target.dataset.tooltipZ ? parseInt(target.dataset.tooltipZ, 10) : undefined,
  });
}

function bindDataTooltip(target) {
  if (!target || target.dataset.tooltipBound === '1') return;
  target.dataset.tooltipBound = '1';

  const show = () => showTooltipFor(target);
  const hide = () => {
    if (_tooltipTarget === target) hideTooltip();
  };

  target.addEventListener('mouseenter', show);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('focus', show);
  target.addEventListener('blur', hide);
}

/** Wire `[data-tooltip]` elements to the shared portaled tooltip (call after dynamic updates). */
export function initDataTooltips(root = document) {
  const scope = root instanceof Document ? root : root?.ownerDocument || document;
  const container = root instanceof Document ? root : root;
  container.querySelectorAll('[data-tooltip]').forEach(bindDataTooltip);

  if (!scope.documentElement.dataset.uiTooltipGlobalBound) {
    scope.documentElement.dataset.uiTooltipGlobalBound = '1';
    window.addEventListener(
      'scroll',
      () => {
        if (_tooltipTarget && !_tooltipEl?.hidden) {
          positionTooltipEl(_tooltipEl, _tooltipTarget, {
            alignEnd: _tooltipTarget.classList.contains('tt-left'),
            zIndex: _tooltipTarget.dataset.tooltipZ
              ? parseInt(_tooltipTarget.dataset.tooltipZ, 10)
              : undefined,
          });
        }
      },
      true,
    );
  }
}

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
 * Segmented control with a sliding indicator (status, priority, etc.).
 *
 * @param {object} opts
 * @param {string} [opts.label] — optional field label above the pill
 * @param {string} opts.value — initial selected value
 * @param {{ value: string, label: string }[]} opts.options
 * @param {string} [opts.ariaLabel]
 * @param {(value: string) => void} [opts.onChange]
 * @param {string} [opts.className] — extra class on the pill track
 * @returns {{ el: HTMLElement, getValue: () => string, setValue: (value: string) => void }}
 */
export function createSlidingPillSelect(opts = {}) {
  const {
    label = '',
    value,
    options = [],
    ariaLabel = '',
    onChange,
    className = '',
  } = opts;

  const wrap = document.createElement('div');
  wrap.className = 'sliding-pill-select';

  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'de-label';
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
  }

  const pill = document.createElement('div');
  pill.className = `sliding-pill${className ? ` ${className}` : ''}`.trim();
  pill.setAttribute('role', 'tablist');
  if (ariaLabel) pill.setAttribute('aria-label', ariaLabel);

  const indicator = document.createElement('span');
  indicator.className = 'sliding-pill-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  pill.appendChild(indicator);

  let currentValue = value ?? options[0]?.value ?? '';

  function syncIndicator(animate) {
    const activeBtn = pill.querySelector(`.sliding-pill-btn[data-value="${CSS.escape(currentValue)}"]`);
    if (!(activeBtn instanceof HTMLElement)) {
      indicator.hidden = true;
      return;
    }
    indicator.hidden = false;
    indicator.classList.toggle('sliding-pill-indicator--static', !animate);
    const pillRect = pill.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.transform = `translateX(${btnRect.left - pillRect.left}px)`;
  }

  function syncActive() {
    pill.querySelectorAll('.sliding-pill-btn').forEach((btn) => {
      const active = btn instanceof HTMLElement && btn.dataset.value === currentValue;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sliding-pill-btn';
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', opt.value === currentValue ? 'true' : 'false');
    if (opt.value === currentValue) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      if (currentValue === opt.value) return;
      currentValue = opt.value;
      syncActive();
      syncIndicator(true);
      onChange?.(currentValue);
    });
    pill.appendChild(btn);
  }

  wrap.appendChild(pill);

  const onResize = () => syncIndicator(false);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(onResize);
    ro.observe(pill);
  }
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => syncIndicator(false));

  return {
    el: wrap,
    getValue: () => currentValue,
    setValue: (next) => {
      if (!options.some((o) => o.value === next)) return;
      currentValue = next;
      syncActive();
      syncIndicator(true);
    },
  };
}

/**
 * Sidebar list subheader — search field with optional create FAB (mobile only via CSS).
 *
 * @param {object} opts
 * @param {object} [opts.search] — `{ value, placeholder, ariaLabel?, onInput(value) }`
 * @param {number} [opts.itemCount] — used for placeholders only
 * @param {false|object} [opts.addNew=false] — `{ label, onClick }` or `false` for search-only
 * @param {Node|Node[]} [opts.below] — nodes rendered below the search row (e.g. inbox filter tabs)
 */
function shouldShowListSearch(search) {
  return !!search;
}

export function listSearchAddNew(opts = {}) {
  const addNew = opts.addNew === false ? null : opts.addNew;
  const newBtn = addNew ? createFabNewBtn(addNew.label || 'New', addNew.onClick) : null;
  const belowNodes = opts.below == null ? [] : [].concat(opts.below).filter(Boolean);
  const showSearch = shouldShowListSearch(opts.search);

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

const IOS_PTR_THRESHOLD = 70;
const IOS_PTR_MAX = 120;
const IOS_PTR_AXIS_SLOP = 8;
const IOS_PTR_VERTICAL_RATIO = 1.1;
const IOS_PTR_HORIZONTAL_RATIO = 3;
const IOS_PTR_HORIZONTAL_MIN = 28;

/** iOS-style pull-to-refresh on a scroll container (touch only). Call after list children exist. */
export function attachIosPullToRefresh(scrollEl, onRefresh) {
  if (!scrollEl || scrollEl.dataset.ptrBound) return;
  scrollEl.dataset.ptrBound = '1';
  scrollEl.classList.add('ios-ptr-host');

  const indicator = document.createElement('div');
  indicator.className = 'ios-ptr-indicator';
  indicator.innerHTML = '<span class="ios-ptr-spinner" aria-hidden="true"></span>';

  const content = document.createElement('div');
  content.className = 'ios-ptr-content';
  while (scrollEl.firstChild) content.appendChild(scrollEl.firstChild);

  scrollEl.appendChild(indicator);
  scrollEl.appendChild(content);

  const spinner = indicator.querySelector('.ios-ptr-spinner');
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let refreshing = false;
  /** @type {'vertical' | 'horizontal' | null} */
  let axis = null;

  function pullOffset() {
    return parseFloat(scrollEl.style.getPropertyValue('--ptr-y')) || 0;
  }

  function setPull(offset) {
    const y = Math.max(0, Math.min(offset, IOS_PTR_MAX));
    const progress = Math.min(1, y / IOS_PTR_THRESHOLD);
    scrollEl.style.setProperty('--ptr-y', `${y}px`);
    scrollEl.style.setProperty('--ptr-icon-opacity', String(Math.min(1, y / 32)));
    scrollEl.classList.toggle('ios-ptr-active', y > 0 && !refreshing);
    scrollEl.classList.toggle('ios-ptr-release', y >= IOS_PTR_THRESHOLD && !refreshing);
    if (spinner) {
      spinner.style.setProperty('--ptr-rot', `${progress * 300}deg`);
    }
  }

  function resetPull() {
    axis = null;
    scrollEl.classList.remove('ios-ptr-active', 'ios-ptr-release', 'ios-ptr-refreshing');
    scrollEl.style.removeProperty('--ptr-y');
    scrollEl.style.removeProperty('--ptr-icon-opacity');
    if (spinner) spinner.style.removeProperty('--ptr-rot');
  }

  function finishRefresh() {
    refreshing = false;
    resetPull();
  }

  function startRefresh() {
    refreshing = true;
    tracking = false;
    axis = null;
    scrollEl.classList.add('ios-ptr-refreshing');
    scrollEl.classList.remove('ios-ptr-active', 'ios-ptr-release');
    setPull(52);
    scrollEl.style.setProperty('--ptr-icon-opacity', '1');
    Promise.resolve(onRefresh?.()).finally(finishRefresh);
  }

  function dampedPull(rawDy) {
    const y = rawDy * 0.52;
    if (y <= IOS_PTR_MAX) return y;
    return IOS_PTR_MAX + (y - IOS_PTR_MAX) * 0.15;
  }

  scrollEl.addEventListener(
    'touchstart',
    (e) => {
      if (refreshing || scrollEl.scrollTop > 1 || e.touches.length !== 1) return;
      tracking = true;
      axis = null;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true, capture: true },
  );

  scrollEl.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking || refreshing || e.touches.length !== 1) return;
      if (scrollEl.scrollTop > 1) {
        tracking = false;
        resetPull();
        return;
      }

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (axis == null) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx < IOS_PTR_AXIS_SLOP && ady < IOS_PTR_AXIS_SLOP) return;
        if (ady >= adx * IOS_PTR_VERTICAL_RATIO && dy > 0) {
          axis = 'vertical';
        } else if (adx >= IOS_PTR_HORIZONTAL_MIN && adx >= ady * IOS_PTR_HORIZONTAL_RATIO) {
          tracking = false;
          return;
        } else if (ady > adx && dy > 0) {
          axis = 'vertical';
        } else {
          return;
        }
      }

      if (axis !== 'vertical' || dy <= 0) return;

      setPull(dampedPull(dy));
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false, capture: true },
  );

  scrollEl.addEventListener(
    'touchend',
    () => {
      if (!tracking || refreshing) return;
      tracking = false;
      if (axis === 'vertical' && pullOffset() >= IOS_PTR_THRESHOLD) startRefresh();
      else resetPull();
    },
    { passive: true, capture: true },
  );

  scrollEl.addEventListener(
    'touchcancel',
    () => {
      tracking = false;
      if (!refreshing) resetPull();
    },
    { passive: true, capture: true },
  );
}

/** Scroll list body used by pull-to-refresh (content wrapper if present). */
export function pullRefreshContentRoot(scrollEl) {
  if (!scrollEl) return scrollEl;
  return scrollEl.querySelector(':scope > .ios-ptr-content') || scrollEl;
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
    panel.querySelectorAll('.ch-sidebar, .de-sidebar').forEach(mountSidebarResizer);
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
