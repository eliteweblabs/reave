/**
 * create drawer — extracted from os-map-loader.js
 */
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
} from './admin-ui.js?v=20260810a';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=20260808k';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260728q';
import { confirmDiscardChanges } from './clients-panel.js?v=20260810b';

/** Injected by os-map-loader via initCreateDrawer(). */
let shell = {};

export function initCreateDrawer(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:6428-6759 ----
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
  shell.setFormFieldState(field, 'invalid');
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
export {
  beginCreateDrawer,
  finishCreateDrawer,
  flagCreateDrawerTitleMissing,
  isCreateDrawerOpen,
  getCreateDrawerPane,
  mountCreateDrawerChrome,
  setCreateDrawerSubmit,
};
