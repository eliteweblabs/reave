/**
 * knowledge panel — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  createSlidingPillSelect,
  createPanelBackBtn,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  exitListMultiSelect,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  paneDeleteIcon,
  paneShareIcon,
  createAgentBtn,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
} from './admin-ui.js?v=20260825h';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, sidebarAuthorIconHtml, mountPanelSkeleton, skeletonHtml } from './shared.js?v=20260810a';
// Drag-to-reorder disabled — see todo-panel.js attachSidebarListReorder.
// import { attachSidebarListReorder, persistKnowledgeOrder } from './todo-panel.js?v=20260728l';
import { confirmDiscardChanges } from './clients-panel.js?v=20260826a';
import { destroyCourtsGateMap, mountCourtsGateMap } from './courts-gate-map.js?v=20260820a';
import { queueUndoableDelete } from './shake-undo.js?v=20260824a';

/** Injected by os-map-loader via initKnowledgePanel(). */
let shell = {};

export function initKnowledgePanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:10558-11068 ----
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
  const newTitle = shell.titleFromKnowledgeMarkdown(content, slug);
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
  }, shell.AUTOSAVE_DEBOUNCE_MS);
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
    if (ta) shell.setFormFieldState(ta, 'invalid');
    return false;
  }
  if (content === knowledgeState.content) {
    knowledgeState.dirty = false;
    return true;
  }
  if (ta) shell.setFormFieldState(ta, 'saving');
  try {
    const res = await adminFetch(`${shell.KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: shell.titleFromKnowledgeMarkdown(content, slug),
        content,
        source: 'manual',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    knowledgeState.content = content;
    knowledgeState.dirty = false;
    syncKnowledgeSidebarTitle(slug, content);
    if (ta) shell.flashFormFieldSaved(ta);
    return true;
  } catch (e) {
    console.warn('[knowledge] autosave failed', e);
    if (ta) shell.setFormFieldState(ta, 'invalid');
    return false;
  }
}

function getKnowledgeEditor() { return document.getElementById('knowledge-editor'); }

async function loadKnowledgeTab() {
  const root = getKnowledgeEditor();
  if (!root) return;
  if (!shell.userId) {
    root.innerHTML = '<div class="de-loading de-error">Sign in required to view knowledge.</div>';
    return;
  }
  mountPanelSkeleton(root, 'list', 'Loading knowledge…', { contentSelector: '.ch-sidebar' });
  try {
    const res = await adminFetch(shell.KNOWLEDGE_API);
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
  shell.clearEditorFooterSave();
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
  exitListMultiSelect(list);
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
  }
  // Drag-to-reorder disabled — re-enable via attachSidebarListReorder in todo-panel.js.
  // else if (!knowledgeState.search.trim()) {
  //   attachSidebarListReorder(list, visibleEntries.map((e) => e.slug), persistKnowledgeOrder);
  // }
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
    searchInput.placeholder = `Search ${count} ${count === 1 ? 'Doc' : 'Docs'}`;
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
    const activeEl = list.querySelector('.ch-list-item.active, .em-list-item.active');
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
    shell.mountCreateDrawerChrome(pane);
  } else if (activeSlug) {
    renderEditKnowledgeForm(pane);
  } else {
    shell.clearEditorFooterSave();
    pane.innerHTML = '';
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'knowledge',
      iconName: 'book-open',
      bodyHtml: '<p>Select a doc to edit, or create a new one.</p>',
      onCreate: () => startNewKnowledge(),
    });
    root.classList.remove('de-pane-active');
  }
  flushTitleFocus('knowledge');
}

function renderKnowledgeEditor() {
  const root = getKnowledgeEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const { entries, search } = knowledgeState;
  destroyCourtsGateMap();
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const subheader = listSearchSubheader({
    itemCount: entries.length,
    search: {
      value: search,
      placeholder: `Search ${entries.length} ${entries.length === 1 ? 'Doc' : 'Docs'}`,
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
  hint.textContent = 'Module playbooks read from plugin files · custom docs live in the DB';
  sidebar.appendChild(hint);

  const gateHost = document.createElement('div');
  gateHost.className = 'kn-courts-gate';
  sidebar.appendChild(gateHost);
  mountCourtsGateMap(gateHost);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeleteKnowledge });
  fillKnowledgeSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderKnowledgePane();
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

function startNewKnowledge() {
  armTitleFocus('knowledge');
  shell.beginCreateDrawer({
    key: 'knowledge',
    title: 'New Knowledge Doc',
    submitLabel: 'Add',
    onSubmit: async () => {
      const pane = shell.getCreateDrawerPane();
      const slugInput = pane?.querySelector('.de-header-title-input');
      const ta = pane?.querySelector('.de-textarea');
      if (!slugInput?.value.trim()) {
        shell.flagCreateDrawerTitleMissing();
        return;
      }
      await createKnowledge(slugInput.value.trim(), ta?.value || '');
    },
    onDismiss: () => {
      knowledgeState.activeSlug = null;
      knowledgeState.dirty = false;
      getKnowledgeEditor()?.classList.remove('de-pane-active');
      syncKnowledgeSidebarActiveState();
      renderKnowledgePane();
    },
  });
  knowledgeState.activeSlug = '__new__';
  knowledgeState.dirty = false;
  syncKnowledgeSidebarActiveState();
  renderKnowledgePane();
}

function renderNewKnowledgeForm(pane) {
  pane.innerHTML = '';
  const inDrawer = shell.isCreateDrawerOpen('knowledge');
  const { root, titleInput: slugInput } = createPaneHeader({
    back: inDrawer
      ? null
      : {
          label: 'Back to knowledge',
          onClick: () => {
            knowledgeState.activeSlug = null;
            getKnowledgeEditor()?.classList.remove('de-pane-active');
            syncKnowledgeSidebarActiveState();
            renderKnowledgePane();
          },
        },
    editableTitle: {
      value: '',
      placeholder: 'e.g. billing-notes',
      ariaLabel: 'Slug (filename)',
    },
  });
  pane.appendChild(root);
  requestTitleFocus('knowledge', slugInput);

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll';

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.spellcheck = false;
  ta.placeholder = '# Title\n\nMarkdown content for the admin agent…';
  scroll.appendChild(ta);
  pane.appendChild(scroll);

  shell.clearEditorFooterSave();
  if (!inDrawer) {
    shell.setEditorFooterSave(() => createKnowledge(slugInput.value.trim(), ta.value));
    getKnowledgeEditor()?.classList.add('de-pane-active');
  }
}

function renderEditKnowledgeForm(pane) {
  const slug = knowledgeState.activeSlug;
  const entry = knowledgeState.entries.find((e) => e.slug === slug);
  pane.innerHTML = skeletonHtml('list', 'Loading…');

  adminFetch(`${shell.KNOWLEDGE_API}/${encodeURIComponent(slug)}`)
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      knowledgeState.content = data.content;
      knowledgeState.dirty = false;
      pane.innerHTML = '';

      const agentBtn = createAgentBtn({
        label: 'Agent',
        onClick: () => askAgentAboutKnowledge(entry || { slug, title: data.title }),
      });

      pane.appendChild(
        createPaneHeader({
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
          icons: data.editable === false
            ? []
            : [
                paneDeleteIcon({
                  label: 'Delete knowledge doc',
                  onClick: () => deleteKnowledge(slug),
                }),
              ],
        }).root,
      );

      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.spellcheck = false;
      ta.value = data.content;
      if (data.editable === false) {
        ta.readOnly = true;
        ta.setAttribute('aria-readonly', 'true');
      } else {
        ta.addEventListener('input', () => {
          knowledgeState.dirty = ta.value !== knowledgeState.content;
          scheduleKnowledgeAutosave(slug, ta);
        });
        ta.addEventListener('blur', () => {
          knowledgeAutosaveFlush = () => autosaveKnowledgeQuiet(slug, ta.value, ta);
          void autosaveKnowledgeQuiet(slug, ta.value, ta);
        });
      }
      pane.appendChild(ta);

      shell.clearEditorFooterSave();
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
    const res = await adminFetch(shell.KNOWLEDGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        title: shell.titleFromKnowledgeMarkdown(content, slug),
        content,
        source: 'manual',
      }),
    });
    const data = await res.json();
    if (res.status === 409) { alert('That slug already exists.'); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    shell.finishCreateDrawer();
    await loadKnowledgeTab();
    knowledgeState.activeSlug = slug;
    getKnowledgeEditor()?.classList.add('de-pane-active');
    syncKnowledgeSidebarActiveState({ scroll: true });
    renderKnowledgePane();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveKnowledge(slug, content) {
  if (!content.trim()) { alert('Content cannot be empty.'); return; }
  try {
    const res = await adminFetch(`${shell.KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: shell.titleFromKnowledgeMarkdown(content, slug),
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

function removeKnowledgeLocally(slugs) {
  const slugSet = new Set(slugs);
  knowledgeState.entries = knowledgeState.entries.filter((e) => !slugSet.has(e.slug));
  if (knowledgeState.activeSlug && slugSet.has(knowledgeState.activeSlug)) {
    knowledgeState.activeSlug = null;
    knowledgeState.dirty = false;
  }
  renderKnowledgeEditor();
}

function restoreKnowledgeLocally(snapshots, { restoreSlug = null } = {}) {
  const have = new Set(knowledgeState.entries.map((e) => e.slug));
  const next = knowledgeState.entries.slice();
  for (const snap of snapshots) {
    if (have.has(snap.entry.slug)) continue;
    next.splice(Math.min(snap.idx, next.length), 0, snap.entry);
    have.add(snap.entry.slug);
  }
  knowledgeState.entries = next;
  renderKnowledgeEditor();
  if (restoreSlug) void openKnowledge(restoreSlug);
}

async function bulkDeleteKnowledge(slugs) {
  if (!slugs.length) return;
  closeOpenSwipeRow();
  const unique = [...new Set(slugs.filter(Boolean))];
  const snapshots = unique
    .map((slug) => {
      const idx = knowledgeState.entries.findIndex((e) => e.slug === slug);
      return idx === -1 ? null : { idx, entry: knowledgeState.entries[idx] };
    })
    .filter(Boolean);
  if (!snapshots.length) return;
  await queueUndoableDelete({
    key: `delete:knowledge:${unique.join(',')}`,
    ids: unique.map((slug) => `knowledge:${slug}`),
    hide: () => removeKnowledgeLocally(unique),
    restore: () => restoreKnowledgeLocally(snapshots),
    commit: async () => {
      for (const slug of unique) {
        try {
          const res = await adminFetch(`${shell.KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          if (!res.ok) continue;
        } catch {
          /* continue */
        }
      }
    },
  });
}

async function deleteKnowledge(slug) {
  closeOpenSwipeRow();
  const idx = knowledgeState.entries.findIndex((e) => e.slug === slug);
  const entry = idx === -1 ? null : knowledgeState.entries[idx];
  if (!entry) return;
  const wasActive = knowledgeState.activeSlug === slug;
  await queueUndoableDelete({
    key: `delete:knowledge:${slug}`,
    ids: [`knowledge:${slug}`],
    hide: () => removeKnowledgeLocally([slug]),
    restore: () => restoreKnowledgeLocally([{ idx, entry }], { restoreSlug: wasActive ? slug : null }),
    commit: async () => {
      const res = await adminFetch(`${shell.KNOWLEDGE_API}/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    },
    onCommitError: (e) => {
      alert(`Failed to delete: ${e.message}`);
    },
  });
}


// ---- extracted from os-map-loader.js:17239-17252 ----
async function askAgentAboutKnowledge(entry) {
  try {
    const res = await adminFetch(`${shell.KNOWLEDGE_API}/${encodeURIComponent(entry.slug)}`);
    const data = await readApiJson(res);
    const prompt = shell.buildAgentContentPrompt(
      'Help me work with this knowledge doc:',
      [`Title: ${entry.title}`, `Slug: ${entry.slug}`],
      data.content,
    );
    await shell.askAgentWithPrompt(prompt);
  } catch (e) {
    shell.osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

// ---- extracted from os-map-loader.js:17324-17352 ----
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
    sidebarAuthorIconHtml() +
    `<span class="ch-list-content">` +
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(entry.title)}</span>${typeBadge}${sourceBadge}</span>` +
    `<span class="ch-item-sub ch-item-slug">${escHtml(entry.slug)}</span>` +
    `</span>`;
  item.addEventListener('click', () => openKnowledge(entry.slug));
  return item;
}

function createKnowledgeSwipeRow(entry) {
  const actions = [swipeAgentAction(() => askAgentAboutKnowledge(entry))];
  if (entry.editable !== false) {
    actions.push(swipeDeleteAction({
      onClick: () => deleteKnowledge(entry.slug),
    }));
  }
  return createSwipeRow(createKnowledgeListItem(entry), actions);
}
export {
  knowledgeState,
  loadKnowledgeTab,
  createKnowledgeListItem,
  createKnowledgeSwipeRow,
  askAgentAboutKnowledge,
  refreshKnowledgeSidebarList,
};
