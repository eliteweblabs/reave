/**
 * Shared Punch list — same admin section on official reave and client installs.
 */
import {
  createCenteredListEmpty,
  createSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  exitListMultiSelect,
  swipeArchiveAction,
  swipeDeleteAction,
  paneDeleteIcon,
  matchesListSearch,
  listSearchAddNew,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
} from './admin-ui.js?v=20260826a';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, readApiJson, mountPanelSkeleton } from './shared.js?v=20260810a';
import { mountListFilterTabs } from './filter-tabs.js?v=20260813a';
import { queueUndoableDelete } from './shake-undo.js?v=20260824a';

let shell = {};

export function initPunchlistPanel(deps) {
  shell = deps;
}

const punchlistState = {
  items: [],
  configured: false,
  host: false,
  error: '',
  company: '',
  search: '',
  filter: 'open',
  activeId: null,
  dirty: false,
  draft: null,
};

let pendingPunchlistDeepLinkId = null;
let punchlistSaveTimer = null;

function isCanonicalReave() {
  return window.__installConfig?.isCanonicalReave === true;
}

function canAddPunchlistItem() {
  return !isCanonicalReave() && punchlistState.configured;
}

function getPunchlistEditor() {
  return document.getElementById('punchlist-editor');
}

function normalizeItem(item) {
  const id = Number(item.id);
  return {
    id,
    title: item.title || '',
    status: item.status === 'done' ? 'done' : 'open',
    company: item.company || item.contact_name || '',
    install_slug: item.install_slug || '',
    created_by: item.created_by || 'install',
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function itemSubline(item) {
  const bits = [];
  if (item.company) bits.push(item.company);
  else if (item.install_slug) bits.push(item.install_slug);
  else if (isCanonicalReave()) bits.push('Install request');
  else bits.push(punchlistState.company || 'Shared with reave');
  return bits.join(' · ');
}

function matchesFilter(item, filter) {
  return item.status === filter;
}

function filterItems(items) {
  const q = punchlistState.search.trim().toLowerCase();
  return (items || punchlistState.items).filter((item) => {
    if (!matchesFilter(item, punchlistState.filter)) return false;
    if (!q) return true;
    return matchesListSearch(q, item.title, item.company, item.install_slug);
  });
}

function searchPlaceholder() {
  const count = punchlistState.items.filter((item) => matchesFilter(item, punchlistState.filter)).length;
  const label = count === 1 ? 'Request' : 'Requests';
  return `Search ${count} ${label}`;
}

function sharedBannerText() {
  return isCanonicalReave() ? 'Shared with install owners' : 'Shared with reave';
}

export async function loadPunchlistTab(opts = {}) {
  const root = getPunchlistEditor();
  if (!root) return;
  const preserveNew = punchlistState.activeId === '__new__' && punchlistState.draft;
  if (!preserveNew) {
    mountPanelSkeleton(root, 'list', 'Loading punch list…', { contentSelector: '.ch-sidebar' });
  }
  try {
    const res = await adminFetch('/api/admin/punchlist');
    const data = await readAdminJson(res, 'Punch list');
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    punchlistState.configured = data.configured !== false;
    punchlistState.host = data.host === true || isCanonicalReave();
    punchlistState.error = '';
    punchlistState.company = data.company || '';
    punchlistState.items = (data.items || []).map(normalizeItem);
  } catch (e) {
    if (e.message === 'Session expired') return;
    punchlistState.configured = false;
    punchlistState.error = e.message || 'Punch list unavailable';
    punchlistState.items = [];
    if (!preserveNew) {
      root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
      return;
    }
  }

  const deepId = opts.itemId ?? pendingPunchlistDeepLinkId;
  pendingPunchlistDeepLinkId = null;

  if (preserveNew && !shell.isCreateDrawerOpen?.('punchlist')) {
    getPunchlistEditor()?.classList.add('de-pane-active');
    renderPunchlistEditor();
    return;
  }

  if (deepId === '__new__') {
    startNewPunchlistItem();
    return;
  }

  if (deepId) {
    await openPunchlistItem(Number(deepId));
    return;
  }

  if (
    punchlistState.activeId &&
    punchlistState.activeId !== '__new__' &&
    !punchlistState.items.some((item) => item.id === punchlistState.activeId)
  ) {
    punchlistState.activeId = null;
    punchlistState.draft = null;
    getPunchlistEditor()?.classList.remove('de-pane-active');
  }
  renderPunchlistEditor();
}

export function navigateToPunchlist(id) {
  if (id == null || id === '') {
    shell.setActiveMap('punchlist', { force: true });
    return;
  }
  pendingPunchlistDeepLinkId = id;
  shell.setActiveMap('punchlist', { force: true, itemId: id });
}

function beginNewPunchlistDrawer() {
  shell.beginCreateDrawer({
    key: 'punchlist',
    title: 'New request',
    submitLabel: 'Add',
    onSubmit: async () => {
      if (!punchlistState.draft?.title?.trim()) {
        shell.flagCreateDrawerTitleMissing();
        return;
      }
      if (!(await saveActivePunchlistDraft())) return;
      shell.finishCreateDrawer();
      getPunchlistEditor()?.classList.add('de-pane-active');
      syncPunchlistSidebarActiveState({ scroll: true });
      renderPunchlistPane();
    },
    onDismiss: () => {
      punchlistState.activeId = null;
      punchlistState.draft = null;
      punchlistState.dirty = false;
      getPunchlistEditor()?.classList.remove('de-pane-active');
      syncPunchlistSidebarActiveState();
      renderPunchlistPane();
    },
  });
}

function startNewPunchlistItem() {
  if (!canAddPunchlistItem()) return;
  beginNewPunchlistDrawer();
  punchlistState.activeId = '__new__';
  punchlistState.dirty = false;
  punchlistState.draft = { title: '', status: 'open' };
  syncPunchlistSidebarActiveState();
  renderPunchlistPane();
}

function applyItemToState(item) {
  const normalized = normalizeItem(item);
  const idx = punchlistState.items.findIndex((row) => row.id === normalized.id);
  if (idx === -1) punchlistState.items.unshift(normalized);
  else punchlistState.items[idx] = normalized;
  return normalized;
}

function renderPunchlistFilterTabs() {
  const openCount = punchlistState.items.filter((item) => item.status === 'open').length;
  const doneCount = punchlistState.items.filter((item) => item.status === 'done').length;
  return mountListFilterTabs({
    tabs: [
      { id: 'open', label: 'Open', count: openCount },
      { id: 'done', label: 'Done', count: doneCount },
    ],
    activeId: punchlistState.filter,
    ariaLabel: 'Punch list filters',
    scroll: false,
    onSelect(tabId) {
      if (punchlistState.filter === tabId) return;
      punchlistState.filter = tabId;
      const visible = filterItems();
      let cleared = false;
      if (
        punchlistState.activeId &&
        punchlistState.activeId !== '__new__' &&
        !visible.some((item) => item.id === punchlistState.activeId)
      ) {
        punchlistState.activeId = null;
        punchlistState.draft = null;
        punchlistState.dirty = false;
        getPunchlistEditor()?.classList.remove('de-pane-active');
        cleared = true;
      }
      refreshPunchlistSidebarList();
      if (cleared) renderPunchlistPane();
    },
  });
}

function emptyListText() {
  if (punchlistState.search.trim()) return 'No matches.';
  if (punchlistState.filter === 'done') return 'No completed requests yet.';
  if (!punchlistState.configured) {
    return punchlistState.error || 'Punch list isn’t connected. Set REAVE_HUB_KEY to share requests with reave.';
  }
  if (isCanonicalReave()) return 'No install requests yet.';
  return 'No requests yet. Add one to share it with reave.';
}

function fillPunchlistSidebarList(list) {
  exitListMultiSelect(list);
  const visible = filterItems();
  list.innerHTML = '';
  for (const item of visible) {
    list.appendChild(createPunchlistSwipeRow(item));
  }
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = emptyListText();
    list.appendChild(empty);
  }
}

function refreshPunchlistSidebarList() {
  const root = getPunchlistEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderPunchlistEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) searchInput.placeholder = searchPlaceholder();
  const tabs = root.querySelector('.em-filter-tabs');
  if (tabs) tabs.replaceWith(renderPunchlistFilterTabs());
  fillPunchlistSidebarList(list);
  syncPunchlistSidebarActiveState();
}

function syncPunchlistSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getPunchlistEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.id === String(punchlistState.activeId);
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
      requestAnimationFrame(() => shell.scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function createPunchlistListItem(item) {
  const isActive = item.id === punchlistState.activeId;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'ch-list-item' + (isActive ? ' active' : '') + (item.status === 'done' ? ' ch-list-item--done' : '');
  btn.dataset.id = String(item.id);
  if (isActive) btn.setAttribute('aria-current', 'page');
  btn.innerHTML =
    `<span class="ch-list-content">` +
    `<span class="td-list-row">` +
    `<span class="td-list-body">` +
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(item.title)}</span></span>` +
    `<span class="de-item-slug">${escHtml(itemSubline(item))}</span>` +
    `</span></span></span>`;
  btn.addEventListener('click', () => openPunchlistItem(item.id));
  return btn;
}

function createPunchlistSwipeRow(item) {
  const actions =
    item.status === 'open'
      ? [
          swipeArchiveAction({ label: 'Done', onClick: () => markPunchlistDone(item.id) }),
          swipeDeleteAction({ onClick: () => deletePunchlistItem(item.id) }),
        ]
      : [
          swipeArchiveAction({ label: 'Reopen', onClick: () => reopenPunchlistItem(item.id) }),
          swipeDeleteAction({ onClick: () => deletePunchlistItem(item.id) }),
        ];
  return createSwipeRow(createPunchlistListItem(item), actions);
}

function renderPunchlistEditor() {
  const root = getPunchlistEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const banner = document.createElement('p');
  banner.className = 'de-item-slug';
  banner.style.padding = '10px 16px 0';
  banner.textContent = sharedBannerText();

  const subheader = listSearchAddNew({
    itemCount: punchlistState.items.filter((item) => item.status === 'open').length,
    search: {
      value: punchlistState.search,
      placeholder: searchPlaceholder(),
      onInput: (value) => {
        punchlistState.search = value;
        refreshPunchlistSidebarList();
      },
    },
    addNew: canAddPunchlistItem()
      ? { label: 'New request', onClick: () => startNewPunchlistItem() }
      : false,
    below: [banner, renderPunchlistFilterTabs()],
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeletePunchlistItems });
  fillPunchlistSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderPunchlistPane();
  shell.finishSidebarListScroll(root, savedSidebarScroll);
  attachIosPullToRefresh(pullRefreshContentRoot(root) || list, () => loadPunchlistTab());
}

function renderPunchlistPane() {
  const root = getPunchlistEditor();
  if (!root) return;
  let pane = root.querySelector('.de-pane');
  if (!pane) {
    renderPunchlistEditor();
    return;
  }
  const { activeId } = punchlistState;
  if (activeId === '__new__') {
    pane.innerHTML = '';
    renderPunchlistEditPane(pane, true);
    shell.mountCreateDrawerChrome(pane);
  } else if (activeId) {
    pane.innerHTML = '';
    renderPunchlistEditPane(pane, false);
  } else {
    pane.innerHTML = '';
    if (canAddPunchlistItem()) {
      shell.appendEmptyDetailPane(pane, {
        mapKey: 'punchlist',
        iconName: 'list-checks',
        bodyHtml: '<p>Select a request, or add one to share it with reave.</p>',
        btnLabel: 'New request',
        onCreate: () => startNewPunchlistItem(),
      });
    } else {
      pane.appendChild(createPaneHeader({ title: 'Punch list' }).root);
      const body = document.createElement('div');
      body.className = 'de-pane-empty-body';
      body.appendChild(
        createCenteredListEmpty({
          innerHtml: isCanonicalReave()
            ? '<p>Select a request, or wait for an install owner to add one.</p>'
            : `<p>${escHtml(punchlistState.error || 'Punch list isn’t connected yet.')}</p>`,
        }),
      );
      pane.appendChild(body);
    }
  }
}

function renderPunchlistEditPane(pane, isNew) {
  const draft = punchlistState.draft;
  if (!draft) return;
  const inDrawer = isNew && shell.isCreateDrawerOpen?.('punchlist');
  const icons = [];
  if (!isNew) {
    icons.push(
      paneDeleteIcon({
        label: 'Delete request',
        onClick: () => deletePunchlistItem(punchlistState.activeId),
      }),
    );
  }
  const { root, titleInput } = createPaneHeader({
    back: inDrawer
      ? null
      : {
          label: 'Back to punch list',
          onClick: () => closePunchlistEditor(),
        },
    editableTitle: {
      value: draft.title,
      placeholder: 'Request title',
      ariaLabel: 'Request title',
    },
    icons,
  });
  pane.appendChild(root);

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll';
  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const note = document.createElement('p');
  note.className = 'de-item-slug';
  note.textContent = isNew
    ? 'This is added to Punch list on official reave and their to-do.'
    : itemSubline({
        company: punchlistState.items.find((row) => row.id === punchlistState.activeId)?.company,
        install_slug: punchlistState.items.find((row) => row.id === punchlistState.activeId)?.install_slug,
      }) || sharedBannerText();
  fields.appendChild(note);
  scroll.appendChild(fields);
  pane.appendChild(scroll);

  titleInput.addEventListener('input', () => {
    draft.title = titleInput.value;
    punchlistState.dirty = true;
    if (inDrawer) return;
    schedulePunchlistAutosave(() => saveActivePunchlistDraft(true));
  });
  titleInput.addEventListener('blur', () => {
    if (inDrawer) return;
    void saveActivePunchlistDraft(true);
  });
}

async function openPunchlistItem(id) {
  if (id === punchlistState.activeId) {
    syncPunchlistSidebarActiveState({ scroll: true });
    getPunchlistEditor()?.classList.add('de-pane-active');
    return;
  }
  await flushPunchlistAutosave();
  const item = punchlistState.items.find((row) => row.id === id || String(row.id) === String(id));
  if (!item) {
    shell.osAlert({ title: 'Request not found', bodyHtml: 'That item is no longer on the punch list.' });
    return;
  }
  punchlistState.activeId = item.id;
  punchlistState.dirty = false;
  punchlistState.draft = { title: item.title, status: item.status };
  punchlistState.filter = item.status;
  getPunchlistEditor()?.classList.add('de-pane-active');
  syncPunchlistSidebarActiveState({ scroll: true });
  renderPunchlistPane();
}

async function closePunchlistEditor() {
  await flushPunchlistAutosave();
  punchlistState.activeId = null;
  punchlistState.draft = null;
  punchlistState.dirty = false;
  getPunchlistEditor()?.classList.remove('de-pane-active');
  syncPunchlistSidebarActiveState();
  renderPunchlistPane();
}

function schedulePunchlistAutosave(saveFn) {
  if (punchlistSaveTimer) clearTimeout(punchlistSaveTimer);
  punchlistSaveTimer = setTimeout(() => {
    punchlistSaveTimer = null;
    void saveFn();
  }, 450);
}

async function flushPunchlistAutosave() {
  if (punchlistSaveTimer) {
    clearTimeout(punchlistSaveTimer);
    punchlistSaveTimer = null;
    await saveActivePunchlistDraft(true);
  }
}

async function saveActivePunchlistDraft(silent = false) {
  if (!punchlistState.draft) return true;
  const title = punchlistState.draft.title.trim();
  if (!title) return false;
  const isNew = punchlistState.activeId === '__new__';
  try {
    const res = await fetch(isNew ? '/api/admin/punchlist' : `/api/admin/punchlist/${punchlistState.activeId}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isNew ? { title } : { title, status: punchlistState.draft.status }),
    });
    const data = await readApiJson(res);
    const saved = applyItemToState(data.item || data);
    punchlistState.activeId = saved.id;
    punchlistState.dirty = false;
    punchlistState.draft = { title: saved.title, status: saved.status };
    refreshPunchlistSidebarList();
    return true;
  } catch (e) {
    if (!silent) shell.osAlert({ title: 'Save failed', bodyHtml: escHtml(e.message) });
    return false;
  }
}

async function markPunchlistDone(id) {
  try {
    const res = await fetch(`/api/admin/punchlist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    const data = await readApiJson(res);
    const saved = applyItemToState(data.item || data);
    if (punchlistState.activeId === id) {
      punchlistState.draft = { ...punchlistState.draft, status: saved.status };
    }
    refreshPunchlistSidebarList();
  } catch (e) {
    shell.osAlert({ title: 'Could not complete', bodyHtml: escHtml(e.message) });
  }
}

async function reopenPunchlistItem(id) {
  try {
    const res = await fetch(`/api/admin/punchlist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    const data = await readApiJson(res);
    applyItemToState(data.item || data);
    punchlistState.filter = 'open';
    refreshPunchlistSidebarList();
  } catch (e) {
    shell.osAlert({ title: 'Could not reopen', bodyHtml: escHtml(e.message) });
  }
}

function removeItemsLocally(ids) {
  const idSet = new Set(ids.map(String));
  punchlistState.items = punchlistState.items.filter((item) => !idSet.has(String(item.id)));
  if (punchlistState.activeId != null && idSet.has(String(punchlistState.activeId))) {
    punchlistState.activeId = null;
    punchlistState.draft = null;
    getPunchlistEditor()?.classList.remove('de-pane-active');
  }
  renderPunchlistEditor();
}

function restoreItemsLocally(snapshots, { restoreActiveId = null } = {}) {
  for (const snap of snapshots) {
    const have = new Set(punchlistState.items.map((item) => String(item.id)));
    if (have.has(String(snap.item.id))) continue;
    punchlistState.items.splice(Math.min(snap.idx, punchlistState.items.length), 0, snap.item);
  }
  renderPunchlistEditor();
  if (restoreActiveId != null) void openPunchlistItem(restoreActiveId);
}

async function bulkDeletePunchlistItems(ids) {
  if (!ids.length) return;
  const unique = [...new Set(ids.filter((id) => id != null))];
  const snapshots = unique
    .map((id) => {
      const idx = punchlistState.items.findIndex((item) => String(item.id) === String(id));
      return idx === -1 ? null : { idx, item: punchlistState.items[idx] };
    })
    .filter(Boolean);
  if (!snapshots.length) return;
  await queueUndoableDelete({
    key: `delete:punchlist:${unique.join(',')}`,
    ids: unique.map((id) => `punchlist:${id}`),
    hide: () => removeItemsLocally(unique),
    restore: () => restoreItemsLocally(snapshots),
    commit: async () => {
      for (const id of unique) {
        try {
          const res = await fetch(`/api/admin/punchlist/${id}`, { method: 'DELETE' });
          await readApiJson(res);
        } catch {
          /* continue */
        }
      }
    },
  });
}

async function deletePunchlistItem(id) {
  if (id == null) return;
  const idx = punchlistState.items.findIndex((item) => item.id === id || String(item.id) === String(id));
  const item = idx === -1 ? null : punchlistState.items[idx];
  if (!item) return;
  const wasActive = punchlistState.activeId === id || String(punchlistState.activeId) === String(id);
  await queueUndoableDelete({
    key: `delete:punchlist:${id}`,
    ids: [`punchlist:${id}`],
    hide: () => removeItemsLocally([id]),
    restore: () => restoreItemsLocally([{ idx, item }], { restoreActiveId: wasActive ? id : null }),
    commit: async () => {
      const res = await fetch(`/api/admin/punchlist/${id}`, { method: 'DELETE' });
      await readApiJson(res);
    },
    onCommitError: (e) => {
      shell.osAlert({ title: 'Delete failed', bodyHtml: escHtml(e.message) });
    },
  });
}

export { punchlistState };
