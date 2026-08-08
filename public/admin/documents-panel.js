/**
 * documents panel — extracted from os-map-loader.js
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
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  paneDeleteIcon,
  paneShareIcon,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  showCopyButtonFeedback,
} from './admin-ui.js?v=20260808c';
import { createPaneHeader } from './pane-header.js?v=20260808d';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, mountPanelSkeleton, skeletonHtml } from './shared.js?v=20260808k';
import { openDocumentShareSheet } from './chat-panel.js?v=20260807c';
import { confirmDiscardChanges } from './clients-panel.js?v=20260728p';

/** Injected by os-map-loader via initDocumentsPanel(). */
let shell = {};

export function initDocumentsPanel(deps) {
  shell = deps;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- extracted from os-map-loader.js:9840-10537 ----
// ---- documents tab ----

let docState = {
  templates: [],    // [{ slug, title }]
  shortcodes: [],   // [{ code, token, label, description, category }]
  search: '',
  activeSlug: null,
  dirty: false,
  savedContent: '',
  autosaveGetHtml: null,
  paneMode: 'edit', // 'edit' | 'view'
};
let docAutosaveTimer = null;

const DOC_TEXTAREA_FONT_MIN = 8;
const DOC_TEXTAREA_FONT_MAX = 18;
const DOC_TEXTAREA_FONT_DEFAULT = 16;
const DOC_TEXTAREA_FONT_STORE = 'reave:doc-editor-font-size';

function clampDocTextareaFontSize(px) {
  return clamp(Math.round(px), DOC_TEXTAREA_FONT_MIN, DOC_TEXTAREA_FONT_MAX);
}

function readDocTextareaFontSize() {
  const n = parseFloat(localStorage.getItem(DOC_TEXTAREA_FONT_STORE));
  return Number.isFinite(n) ? clampDocTextareaFontSize(n) : DOC_TEXTAREA_FONT_DEFAULT;
}

function applyDocTextareaFontSize(ta, px) {
  const size = clampDocTextareaFontSize(px);
  ta.style.setProperty('--de-textarea-font-size', `${size}px`);
  ta.dataset.docFontSize = String(size);
  return size;
}

function refreshDocTextareaLayout(ta) {
  if (!ta?.isConnected) return;
  const value = ta.value;
  const start = ta.selectionStart ?? value.length;
  const end = ta.selectionEnd ?? start;
  const scrollTop = ta.scrollTop;

  // WebKit keeps stale wrapped line boxes until the field is nudged.
  ta.value = `${value}\u200b`;
  ta.value = value;

  requestAnimationFrame(() => {
    if (!ta.isConnected) return;
    const len = ta.value.length;
    ta.setSelectionRange(Math.min(start, len), Math.min(end, len));
    ta.scrollTop = Math.min(scrollTop, Math.max(0, ta.scrollHeight - ta.clientHeight));
  });
}

let docTextareaRefreshTimer = null;
function scheduleDocTextareaLayoutRefresh(ta) {
  clearTimeout(docTextareaRefreshTimer);
  docTextareaRefreshTimer = setTimeout(() => {
    docTextareaRefreshTimer = null;
    refreshDocTextareaLayout(ta);
  }, 60);
}

function attachDocTextareaPinchZoom(ta) {
  ta.classList.add('de-textarea--zoomable');
  let fontSize = applyDocTextareaFontSize(ta, readDocTextareaFontSize());
  const ptrs = new Map();
  let pinchDist = null;
  let pinchStartFontSize = fontSize;
  let pinchActive = false;

  const pointerPos = (ev) => ({ x: ev.clientX, y: ev.clientY });
  const pointerDistance = () => {
    const pts = [...ptrs.values()];
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  };

  const finishPinch = () => {
    if (!pinchActive) return;
    pinchActive = false;
    pinchDist = null;
    localStorage.setItem(DOC_TEXTAREA_FONT_STORE, String(fontSize));
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerEnd);
    window.removeEventListener('pointercancel', onWindowPointerEnd);
    requestAnimationFrame(() => refreshDocTextareaLayout(ta));
  };

  const onWindowPointerMove = (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.set(ev.pointerId, pointerPos(ev));
    if (ptrs.size < 2 || !pinchDist) return;
    const ratio = clamp(pointerDistance() / pinchDist, 0.5, 2);
    fontSize = applyDocTextareaFontSize(ta, pinchStartFontSize * ratio);
    ev.preventDefault();
  };

  const onWindowPointerEnd = (ev) => {
    ptrs.delete(ev.pointerId);
    if (ptrs.size < 2) finishPinch();
  };

  ta.addEventListener('pointerdown', (ev) => {
    ptrs.set(ev.pointerId, pointerPos(ev));
    if (ptrs.size === 2) {
      pinchDist = pointerDistance();
      pinchStartFontSize = fontSize;
      pinchActive = true;
      window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
      window.addEventListener('pointerup', onWindowPointerEnd);
      window.addEventListener('pointercancel', onWindowPointerEnd);
    }
  });

  ta.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    fontSize = applyDocTextareaFontSize(ta, fontSize + (ev.deltaY < 0 ? 1 : -1));
    localStorage.setItem(DOC_TEXTAREA_FONT_STORE, String(fontSize));
    scheduleDocTextareaLayoutRefresh(ta);
  }, { passive: false });
}

function titleFromDocumentMarkdown(content, slug) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const titleLine = fm[1].match(/^title:\s*(.+)$/im);
    if (titleLine) return titleLine[1].trim().replace(/^["']|["']$/g, '');
  }
  const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const fromHeading = first.replace(/^#+\s*/, '').trim();
  if (fromHeading) return fromHeading.slice(0, 200);
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function renderDocumentPreview(content) {
  const res = await fetch('/api/documents/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.html || '';
}

function getDocEditor() { return document.getElementById('doc-editor'); }

async function loadDocumentsTab() {
  const root = getDocEditor();
  if (!root) return;
  mountPanelSkeleton(root, 'list', 'Loading templates…', { contentSelector: '.ch-sidebar' });
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
  shell.clearEditorFooterSave();
  getDocEditor()?.classList.remove('de-pane-active');
  renderDocEditor();
}

function fillDocumentsSidebarList(list) {
  const { templates, search } = docState;
  const visibleTemplates = templates.filter((tpl) =>
    matchesListSearch(search, tpl.title, tpl.slug),
  );
  list.replaceChildren();
  for (const tpl of visibleTemplates) {
    list.appendChild(createDocumentSwipeRow(tpl));
  }
  if (visibleTemplates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = search.trim() ? 'No matches.' : 'No templates yet.';
    list.appendChild(empty);
  }
}

function refreshDocumentsSidebarList() {
  const root = getDocEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderDocEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput instanceof HTMLInputElement) {
    const n = docState.templates.length;
    searchInput.placeholder = `Search ${n} ${n === 1 ? 'Document' : 'Documents'}`;
  }
  fillDocumentsSidebarList(list);
  syncDocumentsSidebarActiveState();
}

function syncDocumentsSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getDocEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.slug === docState.activeSlug;
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

function renderDocumentsPane() {
  const root = getDocEditor();
  if (!root) return;
  let pane = root.querySelector('.de-pane');
  if (!pane) {
    renderDocEditor();
    return;
  }
  const { activeSlug } = docState;

  if (activeSlug === '__new__') {
    renderNewForm(pane);
    shell.mountCreateDrawerChrome(pane);
  } else if (activeSlug) {
    renderEditForm(pane);
  } else {
    shell.clearEditorFooterSave();
    pane.innerHTML = '';
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'documents',
      iconName: 'file-text',
      bodyHtml: '<p>Select a template to edit, or create a new one.</p>',
      onCreate: () => void startNewDocument(),
    });
  }
  flushTitleFocus('documents');
}

function renderDocEditor() {
  const root = getDocEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const { templates, search } = docState;

  root.innerHTML = '';

  // ── Sidebar ──
  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const subheader = listSearchSubheader({
    itemCount: templates.length,
    search: {
      value: search,
      placeholder: `Search ${templates.length} ${templates.length === 1 ? 'Document' : 'Documents'}`,
      onInput: (value) => {
        docState.search = value;
        refreshDocumentsSidebarList();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeleteDocuments });
  fillDocumentsSidebarList(list);
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
        item.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(sc.token);
            showCopyButtonFeedback(item.querySelector('.de-sc-token') || item);
          } catch {}
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
  root.appendChild(pane);
  renderDocumentsPane();
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

function renderNewForm(pane) {
  pane.innerHTML = '';
  const inDrawer = shell.isCreateDrawerOpen('documents');
  const { root, titleInput: slugInput } = createPaneHeader({
    back: inDrawer ? null : { label: 'Back to documents', onClick: () => backToList() },
    editableTitle: {
      value: '',
      placeholder: 'e.g. service-agreement',
      ariaLabel: 'Filename (slug)',
    },
  });
  pane.appendChild(root);
  requestTitleFocus('documents', slugInput);

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll';

  const ta = document.createElement('textarea');
  ta.className = 'de-textarea';
  ta.id = 'de-new-content';
  ta.spellcheck = false;
  ta.placeholder = '---\ntitle: My Document\n---\n\n# Title\n\nBody…';
  attachShortcodePopover(ta);
  attachDocTextareaPinchZoom(ta);
  scroll.appendChild(ta);
  pane.appendChild(scroll);

  shell.clearEditorFooterSave();
  if (!inDrawer) {
    shell.setEditorFooterSave(() => createDocument(slugInput.value.trim(), ta.value));
    getDocEditor()?.classList.add('de-pane-active');
  }
}

function renderEditForm(pane) {
  const slug = docState.activeSlug;
  const tpl = docState.templates.find((t) => t.slug === slug);
  pane.innerHTML = skeletonHtml('list', 'Loading…');

  fetch(`/api/documents/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ content }) => {
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

      pane.appendChild(
        createPaneHeader({
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
        }).root,
      );

      docState.savedContent = content;
      docState.dirty = false;

      // ── Textarea (edit mode) ──
      const ta = document.createElement('textarea');
      ta.className = 'de-textarea';
      ta.id = `de-edit-${slug}`;
      ta.spellcheck = false;
      ta.value = content;
      docState.autosaveGetHtml = () => ta.value;
      ta.addEventListener('input', () => {
        docState.dirty = ta.value !== docState.savedContent;
        scheduleDocAutosave(slug);
      });
      attachShortcodePopover(ta);
      attachDocTextareaPinchZoom(ta);

      // ── Preview iframe (view mode, sandboxed — no scripts) ──
      const preview = document.createElement('iframe');
      preview.className = 'de-preview';
      preview.setAttribute('sandbox', 'allow-same-origin');
      preview.title = 'Document preview';

      if (docState.paneMode === 'view') {
        ta.style.display = 'none';
        renderDocumentPreview(content)
          .then((html) => { preview.srcdoc = html; })
          .catch(() => { preview.srcdoc = '<p>Preview failed.</p>'; });
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
        try {
          preview.srcdoc = await renderDocumentPreview(ta.value);
        } catch {
          preview.srcdoc = '<p>Preview failed.</p>';
        }
        ta.style.display = 'none';
        preview.style.display = '';
      });
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">Failed to load: ${e.message}</div>`;
    });
}

function syncDocSidebarTitle(slug, content) {
  const newTitle = titleFromDocumentMarkdown(content, slug);
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

async function autosaveDocument(slug, content) {
  if (content === docState.savedContent) {
    docState.dirty = false;
    return;
  }
  if (!content.trim()) return;
  const ta = document.getElementById(`de-edit-${slug}`);
  if (ta) shell.setFormFieldState(ta, 'saving');
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.savedContent = content;
    docState.dirty = false;
    syncDocSidebarTitle(slug, content);
    if (ta) shell.flashFormFieldSaved(ta);
  } catch (e) {
    console.warn('[documents] autosave failed', e);
    if (ta) shell.setFormFieldState(ta, 'invalid');
  }
}

async function openDocument(slug) {
  if (slug === docState.activeSlug) {
    syncDocumentsSidebarActiveState({ scroll: true });
    getDocEditor()?.classList.add('de-pane-active');
    return;
  }
  await flushDocAutosave();
  if (docState.dirty && !(await confirmDiscardChanges())) return;
  docState.activeSlug = slug;
  docState.dirty = false;
  docState.savedContent = '';
  docState.autosaveGetHtml = null;
  docState.paneMode = 'edit';
  syncDocumentsSidebarActiveState({ scroll: true });
  renderDocumentsPane();
  getDocEditor()?.classList.add('de-pane-active');
}

async function startNewDocument() {
  armTitleFocus('documents');
  await flushDocAutosave();
  if (docState.dirty && !(await confirmDiscardChanges())) {
    cancelTitleFocus();
    return;
  }
  shell.beginCreateDrawer({
    key: 'documents',
    title: 'New Document',
    submitLabel: 'Add',
    onSubmit: async () => {
      const pane = shell.getCreateDrawerPane();
      const slugInput = pane?.querySelector('.de-header-title-input');
      const ta = pane?.querySelector('.de-textarea');
      if (!slugInput?.value.trim()) {
        shell.flagCreateDrawerTitleMissing();
        return;
      }
      await createDocument(slugInput.value.trim(), ta?.value || '');
    },
    onDismiss: () => {
      docState.activeSlug = null;
      docState.dirty = false;
      getDocEditor()?.classList.remove('de-pane-active');
      syncDocumentsSidebarActiveState();
      renderDocumentsPane();
    },
  });
  docState.activeSlug = '__new__';
  docState.dirty = false;
  docState.savedContent = '';
  docState.autosaveGetHtml = null;
  syncDocumentsSidebarActiveState();
  renderDocumentsPane();
}

async function backToList() {
  await flushDocAutosave();
  if (docState.dirty && !(await confirmDiscardChanges())) return;
  docState.activeSlug = null;
  docState.dirty = false;
  docState.savedContent = '';
  docState.autosaveGetHtml = null;
  shell.clearEditorFooterSave();
  getDocEditor()?.classList.remove('de-pane-active');
  syncDocumentsSidebarActiveState();
  renderDocumentsPane();
}

async function createDocument(slug, content) {
  if (!slug) { alert('Please enter a filename (slug).'); return; }
  if (!/^[a-z0-9_-]+$/i.test(slug)) { alert('Slug may only contain letters, numbers, hyphens, and underscores.'); return; }
  if (!content.trim()) { alert('Markdown content cannot be empty.'); return; }
  try {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, content }),
    });
    if (res.status === 409) { alert('A template with that slug already exists.'); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    docState.dirty = false;
    shell.finishCreateDrawer();
    await loadDocumentsTab();
    docState.activeSlug = slug;
    getDocEditor()?.classList.add('de-pane-active');
    syncDocumentsSidebarActiveState({ scroll: true });
    renderDocumentsPane();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function bulkDeleteDocuments(slugs) {
  if (!slugs.length) return;
  closeOpenSwipeRow();
  if (docAutosaveTimer) {
    clearTimeout(docAutosaveTimer);
    docAutosaveTimer = null;
  }
  const slugSet = new Set(slugs);
  for (const slug of slugs) {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) continue;
    } catch {
      /* continue */
    }
  }
  if (docState.activeSlug && slugSet.has(docState.activeSlug)) {
    docState.activeSlug = null;
    docState.dirty = false;
    docState.savedContent = '';
    docState.autosaveGetHtml = null;
    getDocEditor()?.classList.remove('de-pane-active');
  }
  await loadDocumentsTab();
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
    docState.savedContent = '';
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


// ---- extracted from os-map-loader.js:17287-17322 ----
async function askAgentAboutDocument(tpl) {
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(tpl.slug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const prompt = shell.buildAgentContentPrompt(
      'Help me work with this document template:',
      [`Title: ${tpl.title}`, `Slug: ${tpl.slug}`],
      data.content,
    );
    await shell.askAgentWithPrompt(prompt);
  } catch (e) {
    shell.osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}


function createDocumentListItem(tpl) {
  const isActive = tpl.slug === docState.activeSlug;
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (isActive ? ' active' : '');
  item.dataset.slug = tpl.slug;
  if (isActive) item.setAttribute('aria-current', 'page');
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
export {
  docState,
  loadDocumentsTab,
  createDocumentListItem,
  createDocumentSwipeRow,
  askAgentAboutDocument,
};
