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
 * @param {false|object} [opts.addNew=false] — `{ label, onClick }` or `false` for search-only
 * @param {Node|Node[]} [opts.below] — nodes rendered below the search row (e.g. inbox filter tabs)
 */
export function listSearchAddNew(opts = {}) {
  const addNew = opts.addNew === false ? null : opts.addNew;
  const newBtn = addNew ? createFabNewBtn(addNew.label || 'New', addNew.onClick) : null;
  const belowNodes = opts.below == null ? [] : [].concat(opts.below).filter(Boolean);

  if (opts.search) {
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

let _iosSheetEl = null;

function ensureIosSheetRoot() {
  if (_iosSheetEl) return _iosSheetEl;
  const root = document.createElement('div');
  root.id = 'ios-action-sheet-root';
  root.className = 'ios-action-sheet-root';
  root.hidden = true;
  root.innerHTML =
    '<div class="ios-action-sheet-backdrop" data-sheet-dismiss></div>' +
    '<div class="ios-action-sheet-wrap" role="dialog" aria-modal="true">' +
    '<div class="ios-action-sheet-title" id="ios-action-sheet-title"></div>' +
    '<div class="ios-action-sheet-message" id="ios-action-sheet-message"></div>' +
    '<div class="ios-action-sheet-group" id="ios-action-sheet-actions"></div>' +
    '<div class="ios-action-sheet-group ios-action-sheet-cancel-group">' +
    '<button type="button" class="ios-action-sheet-btn ios-action-sheet-cancel" data-sheet-dismiss>Cancel</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(root);
  _iosSheetEl = root;
  return root;
}

function closeIosActionSheet() {
  const root = ensureIosSheetRoot();
  root.classList.remove('ios-action-sheet-visible');
  root.hidden = true;
  document.body.classList.remove('ios-action-sheet-open');
}

/**
 * iOS-style bottom action sheet. actions: { label, onClick?, disabled?, destructive? }[]
 */
export function showIosActionSheet(opts = {}) {
  const { title, message, actions = [] } = opts;
  const root = ensureIosSheetRoot();
  const titleEl = root.querySelector('#ios-action-sheet-title');
  const messageEl = root.querySelector('#ios-action-sheet-message');
  const actionsEl = root.querySelector('#ios-action-sheet-actions');

  titleEl.textContent = title || '';
  titleEl.hidden = !title;
  messageEl.textContent = message || '';
  messageEl.hidden = !message;
  actionsEl.innerHTML = '';

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ios-action-sheet-btn';
    if (action.destructive) btn.classList.add('ios-action-sheet-destructive');
    btn.textContent = action.label || '';
    btn.disabled = !!action.disabled;
    if (!action.disabled && action.onClick) {
      btn.addEventListener('click', async () => {
        closeIosActionSheet();
        try {
          await action.onClick(btn);
        } catch (e) {
          console.error(e);
        }
      });
    }
    actionsEl.appendChild(btn);
  }

  root.querySelectorAll('[data-sheet-dismiss]').forEach((el) => {
    el.onclick = closeIosActionSheet;
  });

  root.hidden = false;
  requestAnimationFrame(() => {
    root.classList.add('ios-action-sheet-visible');
    document.body.classList.add('ios-action-sheet-open');
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeIosActionSheet();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

/**
 * Portal send sheet — carrier picker + text/email/copy actions.
 */
export function showPortalSendSheet(opts = {}) {
  const {
    title,
    message,
    phone,
    phoneLabel,
    email,
    carriers = [],
    defaultCarrier = '',
    onText,
    onEmail,
    onCopy,
    onMore,
  } = opts;

  const root = ensureIosSheetRoot();
  const titleEl = root.querySelector('#ios-action-sheet-title');
  const messageEl = root.querySelector('#ios-action-sheet-message');
  const actionsEl = root.querySelector('#ios-action-sheet-actions');

  titleEl.textContent = title || '';
  titleEl.hidden = !title;
  messageEl.textContent = message || '';
  messageEl.hidden = !message;
  actionsEl.innerHTML = '';

  let carrierSelect = null;

  if (phone && carriers.length) {
    const carrierRow = document.createElement('div');
    carrierRow.className = 'ios-action-sheet-field';
    const carrierLabel = document.createElement('label');
    carrierLabel.className = 'ios-action-sheet-field-label';
    carrierLabel.textContent = 'Mobile carrier';
    carrierLabel.setAttribute('for', 'ios-portal-carrier');
    carrierSelect = document.createElement('select');
    carrierSelect.id = 'ios-portal-carrier';
    carrierSelect.className = 'ios-action-sheet-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select carrier…';
    carrierSelect.appendChild(placeholder);
    for (const c of carriers) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === defaultCarrier) opt.selected = true;
      carrierSelect.appendChild(opt);
    }
    carrierRow.appendChild(carrierLabel);
    carrierRow.appendChild(carrierSelect);
    actionsEl.appendChild(carrierRow);

    const textBtn = document.createElement('button');
    textBtn.type = 'button';
    textBtn.className = 'ios-action-sheet-btn';
    textBtn.textContent = `Text ${phoneLabel || phone}`;
    textBtn.addEventListener('click', async () => {
      const carrier = carrierSelect?.value?.trim() || '';
      if (!carrier) {
        carrierSelect?.focus();
        carrierSelect?.classList.add('ios-action-sheet-select-invalid');
        return;
      }
      closeIosActionSheet();
      try {
        await onText?.({ carrier, phone });
      } catch (e) {
        console.error(e);
      }
    });
    carrierSelect.addEventListener('change', () => {
      carrierSelect.classList.remove('ios-action-sheet-select-invalid');
    });
    actionsEl.appendChild(textBtn);
  }

  if (email) {
    const emailBtn = document.createElement('button');
    emailBtn.type = 'button';
    emailBtn.className = 'ios-action-sheet-btn';
    emailBtn.textContent = `Email ${email}`;
    emailBtn.addEventListener('click', async () => {
      closeIosActionSheet();
      try {
        await onEmail?.({ email });
      } catch (e) {
        console.error(e);
      }
    });
    actionsEl.appendChild(emailBtn);
  }

  if (!phone && !email) {
    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'ios-action-sheet-btn';
    emptyBtn.textContent = 'Add phone or email to send';
    emptyBtn.disabled = true;
    actionsEl.appendChild(emptyBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'ios-action-sheet-btn';
  copyBtn.textContent = 'Copy link';
  copyBtn.addEventListener('click', async () => {
    closeIosActionSheet();
    try {
      await onCopy?.();
    } catch (e) {
      console.error(e);
    }
  });
  actionsEl.appendChild(copyBtn);

  if (onMore) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'ios-action-sheet-btn';
    moreBtn.textContent = 'More options…';
    moreBtn.addEventListener('click', async () => {
      closeIosActionSheet();
      try {
        await onMore?.();
      } catch (e) {
        console.error(e);
      }
    });
    actionsEl.appendChild(moreBtn);
  }

  root.querySelectorAll('[data-sheet-dismiss]').forEach((el) => {
    el.onclick = closeIosActionSheet;
  });

  root.hidden = false;
  requestAnimationFrame(() => {
    root.classList.add('ios-action-sheet-visible');
    document.body.classList.add('ios-action-sheet-open');
    if (phone && carriers.length && !defaultCarrier) carrierSelect?.focus();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeIosActionSheet();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}
