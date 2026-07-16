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
  stopwatch:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  square: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  sparkles:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>',
  agent:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18a2 2 0 0 0-4 0"/><path d="m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11"/><path d="M2 11h20"/><circle cx="17" cy="18" r="3"/><circle cx="7" cy="18" r="3"/></svg>',
  archive:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  receipt:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>',
};

/** Branded agent control (Lucide hat-glasses / fedora + glasses, gradient background). */
export function createAgentBtn(opts = {}) {
  const { onClick, className = 'agent-btn', label = 'Agent' } = opts;
  return createIosIconBtn({
    iconKey: 'agent',
    label,
    className,
    onClick,
  });
}

/** Icon-only toolbar button (44pt touch target, iOS-style). */
export function createIosIconBtn(opts = {}) {
  const { iconKey, label, className = 'ios-icon-btn', onClick, confirmDelete = false, confirmTimeout } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = IOS_ICONS[iconKey] || '';
  if (confirmDelete) {
    bindConfirmDeleteButton(btn, () => onClick?.(btn), { timeout: confirmTimeout });
  } else {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick?.(btn);
    });
  }
  return btn;
}

// ---- Two-step delete confirm (trash → 3s timer ring → tap again) ----

const DELETE_CONFIRM_MS = 3000;
/** @type {WeakMap<HTMLElement, number>} */
const deleteConfirmTimeouts = new WeakMap();

function stopwatchIconMarkup(size = 18) {
  return (
    IOS_ICONS.stopwatch
      .replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
      .replace(
        'aria-hidden="true"',
        'class="delete-confirm-icon delete-confirm-stopwatch" aria-hidden="true"',
      ) ||
    ''
  );
}

function deleteConfirmRingMarkup(size = 36) {
  return (
    `<svg class="delete-confirm-ring" width="${size}" height="${size}" viewBox="0 0 44 44" fill="none" aria-hidden="true">` +
    `<circle class="delete-confirm-ring-circle" cx="22" cy="22" r="18" fill="none" stroke="currentColor" ` +
    `stroke-width="3" stroke-dasharray="113.1" stroke-dashoffset="113.1" transform="rotate(-90 22 22)"/>` +
    `</svg>`
  );
}

function clearDeleteConfirmTimeout(btn) {
  const id = deleteConfirmTimeouts.get(btn);
  if (id != null) {
    clearTimeout(id);
    deleteConfirmTimeouts.delete(btn);
  }
}

function ensureDeleteConfirmChrome(btn, ringSize = 36) {
  if (btn.dataset.deleteConfirmReady === '1') return;
  btn.dataset.deleteConfirmReady = '1';
  btn.classList.add('delete-confirm-btn');
  btn.dataset.state = 'trash';
  const icon = btn.querySelector('svg');
  if (icon) {
    icon.classList.add('delete-confirm-icon');
    btn.dataset.originalIconHtml = icon.outerHTML;
  }
  const holder = document.createElement('span');
  holder.className = 'delete-confirm-ring-holder';
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = deleteConfirmRingMarkup(ringSize);
  btn.appendChild(holder);
}

export function resetDeleteConfirmButton(btn) {
  if (!(btn instanceof HTMLElement)) return;
  clearDeleteConfirmTimeout(btn);
  if (btn.dataset.state !== 'confirm') return;
  btn.dataset.state = 'trash';
  const label = btn.dataset.originalTitle || btn.getAttribute('aria-label') || 'Delete';
  btn.title = label;
  if (btn.dataset.originalAriaLabel) {
    btn.setAttribute('aria-label', btn.dataset.originalAriaLabel);
  }
  const stopwatch = btn.querySelector('.delete-confirm-stopwatch');
  if (stopwatch && btn.dataset.originalIconHtml) {
    stopwatch.outerHTML = btn.dataset.originalIconHtml;
  }
  const circle = btn.querySelector('.delete-confirm-ring-circle');
  if (circle) {
    circle.style.animation = 'none';
    void circle.getBoundingClientRect();
    circle.style.removeProperty('animation');
  }
}

function armDeleteConfirm(btn, timeout) {
  btn.style.setProperty('--delete-confirm-ms', `${timeout}ms`);
  const circle = btn.querySelector('.delete-confirm-ring-circle');
  if (circle) {
    circle.style.animation = 'none';
    void circle.getBoundingClientRect();
    circle.style.removeProperty('animation');
  }
  if (!btn.dataset.originalAriaLabel) {
    btn.dataset.originalAriaLabel = btn.getAttribute('aria-label') || 'Delete';
  }
  btn.dataset.originalTitle = btn.title || btn.dataset.originalAriaLabel;
  btn.dataset.state = 'confirm';
  btn.removeAttribute('title');
  btn.setAttribute('aria-label', 'Tap again to confirm delete');

  const icon = btn.querySelector('.delete-confirm-icon');
  if (icon && !icon.classList.contains('delete-confirm-stopwatch')) {
    if (!btn.dataset.originalIconHtml) btn.dataset.originalIconHtml = icon.outerHTML;
    const size = icon.getAttribute('width') || '18';
    icon.outerHTML = stopwatchIconMarkup(size);
  }

  clearDeleteConfirmTimeout(btn);
  const id = window.setTimeout(() => {
    resetDeleteConfirmButton(btn);
  }, timeout);
  deleteConfirmTimeouts.set(btn, id);
}

/**
 * Trash → stopwatch + countdown ring; second tap within timeout runs onConfirm.
 * Port of DeleteConfirmButton from astro-supabase-main.
 */
export function bindConfirmDeleteButton(btn, onConfirm, opts = {}) {
  const timeout = opts.timeout ?? DELETE_CONFIRM_MS;
  const ringSize = opts.ringSize ?? (btn.classList.contains('swipe-act') ? 40 : 36);
  ensureDeleteConfirmChrome(btn, ringSize);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (btn.disabled) return;

    if ((btn.dataset.state || 'trash') === 'trash') {
      armDeleteConfirm(btn, timeout);
      return;
    }

    clearDeleteConfirmTimeout(btn);
    resetDeleteConfirmButton(btn);
    btn.disabled = true;
    try {
      await onConfirm?.(btn);
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  });
}

function resetDeleteConfirmsIn(el) {
  el?.querySelectorAll?.('.delete-confirm-btn[data-state="confirm"]').forEach(resetDeleteConfirmButton);
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

// ---- Swipe row actions (shared across inbox, chats, docs, etc.) ----

const SWIPE_ACTIONS = {
  agent: { iconKey: 'agent', className: 'swipe-act swipe-act-agent', label: 'Agent' },
  archive: { iconKey: 'archive', className: 'swipe-act swipe-act-archive', label: 'Archive' },
  delete: { iconKey: 'trash', className: 'swipe-act swipe-act-delete', label: 'Delete' },
  junk: { iconKey: 'trash', className: 'swipe-act swipe-act-junk', label: 'Junk' },
  receipt: { iconKey: 'receipt', className: 'swipe-act swipe-act-receipt', label: 'Receipt' },
  clear: { iconKey: 'square', className: 'swipe-act swipe-act-archive', label: 'Clear' },
};

function swipeIconMarkup(iconKey, size = 18) {
  const svg = IOS_ICONS[iconKey];
  if (!svg) {
    console.warn(`Swipe icon not found: ${iconKey}`);
    return '';
  }
  return svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
}

/** Build a swipe action descriptor — icon-only button with accessible label. */
export function swipeAction(kind, opts = {}) {
  const spec = SWIPE_ACTIONS[kind];
  if (!spec) throw new Error(`Unknown swipe action: ${kind}`);
  const { label = spec.label, onClick, confirmTimeout } = opts;
  if (typeof onClick !== 'function') throw new Error(`swipeAction(${kind}) requires onClick`);
  // Delete defaults to timer confirm; pass confirmDelete: false to keep a sheet/dialog.
  const confirmDelete =
    kind === 'delete' ? opts.confirmDelete !== false : !!opts.confirmDelete;
  return {
    label,
    iconKey: spec.iconKey,
    className: spec.className,
    onClick,
    confirmDelete,
    confirmTimeout,
  };
}

export const swipeAgentAction = (onClick) => swipeAction('agent', { onClick });
export const swipeArchiveAction = (opts) => swipeAction('archive', opts);
export const swipeDeleteAction = (opts) => swipeAction('delete', opts);
export const swipeJunkAction = (opts) => swipeAction('junk', opts);
export const swipeReceiptAction = (opts) => swipeAction('receipt', opts);
export const swipeClearAction = (opts) => swipeAction('clear', opts);

const SWIPE_AXIS_SLOP = 12;
const SWIPE_HORIZONTAL_MIN = 28;
const SWIPE_HORIZONTAL_RATIO = 3;
const SWIPE_VERTICAL_RATIO = 1.1;
const SWIPE_CLOSE_HORIZONTAL_MIN = 14;
const SWIPE_CLOSE_HORIZONTAL_RATIO = 2;

let openSwipeRow = null;

export function closeOpenSwipeRow() {
  if (openSwipeRow) {
    resetDeleteConfirmsIn(openSwipeRow.row);
    openSwipeRow.snap(false);
    openSwipeRow = null;
  }
}

export function bindSwipeListScroll(listEl) {
  listEl.addEventListener(
    'scroll',
    () => {
      closeOpenSwipeRow();
      closeContextMenu();
    },
    { passive: true },
  );
}

let openContextMenu = null;
let contextMenuDismissBound = false;
let contextMenuOpenedAt = 0;

export function closeContextMenu() {
  openContextMenu?.remove();
  openContextMenu = null;
}

function contextMenuWithinOpenGrace() {
  return Date.now() - contextMenuOpenedAt < 250;
}

function normalizeContextMenuItem(item) {
  const label = item.label || 'Action';
  const run = item.action || item.onClick;
  return {
    label,
    run: typeof run === 'function' ? run : null,
    confirmDelete: !!item.confirmDelete,
    confirmTimeout: item.confirmTimeout ?? DELETE_CONFIRM_MS,
  };
}

function armContextDeleteConfirm(btn, originalLabel, timeout) {
  clearTimeout(btn._confirmTimer);
  btn.dataset.confirmArmed = '1';
  btn.textContent = 'Confirm delete';
  btn.classList.add('ch-context-item--danger');
  btn._confirmTimer = setTimeout(() => {
    delete btn.dataset.confirmArmed;
    btn.textContent = originalLabel;
    btn.classList.remove('ch-context-item--danger');
  }, timeout);
}

/** Fixed-position menu for sidebar rows and other list items (right-click / long-press). */
export function showContextMenu(x, y, items) {
  const menuItems = (items || [])
    .map(normalizeContextMenuItem)
    .filter((item) => item.run);
  if (!menuItems.length) return;

  closeContextMenu();
  closeOpenSwipeRow();
  contextMenuOpenedAt = Date.now();

  const menu = document.createElement('div');
  menu.className = 'ch-context-menu';
  menu.setAttribute('role', 'menu');

  for (const item of menuItems) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ch-context-item';
    btn.textContent = item.label;
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (item.confirmDelete && btn.dataset.confirmArmed !== '1') {
        armContextDeleteConfirm(btn, item.label, item.confirmTimeout);
        return;
      }
      closeContextMenu();
      await item.run();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  openContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  const onKey = (ev) => {
    if (ev.key === 'Escape') close({ target: document.body });
  };
  const close = (ev) => {
    if (contextMenuWithinOpenGrace()) return;
    if (menu.contains(ev.target)) return;
    closeContextMenu();
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('contextmenu', close, true);
    document.removeEventListener('keydown', onKey, true);
  };
  window.setTimeout(() => {
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('contextmenu', close, true);
    document.addEventListener('keydown', onKey, true);
  }, 250);
}

function bindSwipeRowContextMenu(row, contentEl, actions) {
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, actions);
  };
  row.addEventListener('contextmenu', handler);
  contentEl.addEventListener('contextmenu', handler);
}

function attachSwipeRow(row, contentEl, revealPx) {
  let startX = 0;
  let swipeStartY = 0;
  let baseX = 0;
  let pending = false;
  let dragging = false;
  let moved = false;
  let open = false;
  /** @type {'horizontal' | 'vertical' | null} */
  let axis = null;

  function currentTx() {
    const m = contentEl.style.transform.match(/translate3d\(([-\d.]+)px/);
    return m ? parseFloat(m[1]) : 0;
  }

  function setTranslate(x, animate) {
    contentEl.style.transition = animate ? 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none';
    contentEl.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function snap(shouldOpen) {
    open = shouldOpen;
    row.classList.toggle('swipe-open', open);
    row.classList.remove('swipe-dragging');
    setTranslate(open ? -revealPx : 0, true);
    if (open) {
      if (openSwipeRow && openSwipeRow !== api) {
        resetDeleteConfirmsIn(openSwipeRow.row);
        openSwipeRow.snap(false);
      }
      openSwipeRow = api;
    } else {
      resetDeleteConfirmsIn(row);
      if (openSwipeRow === api) openSwipeRow = null;
    }
  }

  function resetGesture() {
    pending = false;
    dragging = false;
    axis = null;
    row.classList.remove('swipe-dragging');
  }

  function horizontalThresholds() {
    if (open) {
      return { min: SWIPE_CLOSE_HORIZONTAL_MIN, ratio: SWIPE_CLOSE_HORIZONTAL_RATIO };
    }
    return { min: SWIPE_HORIZONTAL_MIN, ratio: SWIPE_HORIZONTAL_RATIO };
  }

  function onStart(clientX, clientY) {
    if (openSwipeRow && openSwipeRow !== api) closeOpenSwipeRow();
    startX = clientX;
    swipeStartY = clientY;
    baseX = open ? -revealPx : 0;
    pending = true;
    dragging = false;
    axis = null;
    moved = false;
  }

  function onMove(clientX, clientY, prevent) {
    if (!pending && !dragging) return;
    const dx = clientX - startX;
    const dy = clientY - swipeStartY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    const listEl = row.closest('.ch-list, .de-list, .em-list');
    if (listEl && listEl.scrollTop <= 1 && dy > 0 && ady > adx * SWIPE_VERTICAL_RATIO) {
      resetGesture();
      setTranslate(open ? -revealPx : 0, false);
      return;
    }

    if (axis == null) {
      if (adx < SWIPE_AXIS_SLOP && ady < SWIPE_AXIS_SLOP) return;

      if (ady >= adx * SWIPE_VERTICAL_RATIO) {
        axis = 'vertical';
        pending = false;
        return;
      }

      const { min, ratio } = horizontalThresholds();
      if (adx >= min && adx >= ady * ratio) {
        axis = 'horizontal';
        dragging = true;
        pending = false;
        row.classList.add('swipe-dragging');
        contentEl.style.transition = 'none';
      } else if (ady > adx) {
        axis = 'vertical';
        pending = false;
        return;
      }
      return;
    }

    if (axis === 'vertical') return;

    if (axis === 'horizontal' && dragging) {
      if (adx > 8) moved = true;
      let next = baseX + dx;
      next = Math.min(0, Math.max(-revealPx, next));
      setTranslate(next, false);
      if (prevent) prevent();
    }
  }

  function onEnd() {
    if (!pending && !dragging) return;
    if (axis === 'vertical' || (axis == null && pending)) {
      resetGesture();
      return;
    }
    if (!dragging) {
      resetGesture();
      return;
    }
    dragging = false;
    pending = false;
    axis = null;
    row.classList.remove('swipe-dragging');
    const tx = currentTx();
    snap(tx <= -revealPx * 0.35);
  }

  contentEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );
  contentEl.addEventListener(
    'touchmove',
    (e) => onMove(e.touches[0].clientX, e.touches[0].clientY, () => e.preventDefault()),
    { passive: false },
  );
  contentEl.addEventListener('touchend', onEnd);
  contentEl.addEventListener('touchcancel', onEnd);

  contentEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY);
    const onMouseMove = (ev) => onMove(ev.clientX, null);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onEnd();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  contentEl.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );

  const api = { snap, row, moved: () => moved };
  return api;
}

/** iOS-style swipe row — pass content element + swipeAction() descriptors. */
export function createSwipeRow(contentEl, actions) {
  const row = document.createElement('div');
  row.className = 'swipe-row';
  if (contentEl.dataset?.id) row.dataset.id = contentEl.dataset.id;
  if (contentEl.dataset?.slug) row.dataset.slug = contentEl.dataset.slug;

  const actionsEl = document.createElement('div');
  actionsEl.className = 'swipe-actions';
  for (const act of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = act.className || 'swipe-act';
    const iconKey = act.iconKey || act.icon;
    const iconMarkup = swipeIconMarkup(iconKey, 18);
    if (iconMarkup) {
      btn.innerHTML = iconMarkup;
    } else {
      console.error(`Swipe action missing icon: ${act.label || 'Unknown'} (key: ${iconKey})`);
    }
    btn.setAttribute('aria-label', act.label || 'Action');
    btn.title = act.label || 'Action';
    if (act.confirmDelete) {
      bindConfirmDeleteButton(btn, () => act.onClick(), { timeout: act.confirmTimeout });
    } else {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        act.onClick();
      });
    }
    actionsEl.appendChild(btn);
  }

  const content = document.createElement('div');
  content.className = 'swipe-content';
  content.appendChild(contentEl);
  row.appendChild(actionsEl);
  row.appendChild(content);

  bindSwipeRowContextMenu(row, content, actions);

  requestAnimationFrame(() => {
    const revealPx = actionsEl.offsetWidth || Math.max(72 * actions.length, 72);
    attachSwipeRow(row, content, revealPx);
  });
  return row;
}

if (typeof document !== 'undefined' && !contextMenuDismissBound) {
  contextMenuDismissBound = true;
  document.addEventListener('click', (e) => {
    if (!openContextMenu) return;
    if (e.button && e.button !== 0) return;
    if (contextMenuWithinOpenGrace()) return;
    if (!openContextMenu.contains(e.target)) closeContextMenu();
  });
}

if (typeof document !== 'undefined' && !document.documentElement.dataset.swipeDismissBound) {
  document.documentElement.dataset.swipeDismissBound = '1';
  document.addEventListener('click', (e) => {
    if (!openSwipeRow) return;
    if (openSwipeRow.row.contains(e.target)) return;
    closeOpenSwipeRow();
  });
}
