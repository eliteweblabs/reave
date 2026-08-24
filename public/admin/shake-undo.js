/**
 * Shake-to-undo for reversible admin actions (deletes, notification dismiss).
 *
 * Flow: optimistic UI → short undo window → commit. Shake (when motion is available)
 * or tapping Undo cancels the commit and runs the undo callback.
 *
 * Use queueUndoableDelete() for every user-initiated delete so the same Undo
 * toast + shake path covers chats, email, and the other admin lists.
 *
 * iOS 13+ requires DeviceMotionEvent.requestPermission() from a user gesture; call
 * ensureShakePermission() from the dismiss tap/swipe before queueing.
 */

import { createTimingRing, restartTimingRing, stopTimingRing } from './admin-ui.js?v=20260820a';

const UNDO_WINDOW_MS = 5000;
const SHAKE_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 900;
const MOTION_PREF_KEY = 'reave-motion-permission';
/** Ignore momentary hides (desktop PWA titlebar / permission dialogs). */
const VISIBILITY_COMMIT_MS = 400;

/** @type {{ key: string, commit: () => (void|Promise<void>), undo: () => (void|Promise<void>), timer: ReturnType<typeof setTimeout> } | null} */
let pending = null;
let shakeListening = false;
let lastShakeAt = 0;
let lastAcc = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let visibilityCommitTimer = null;

function motionPermissionCached() {
  try {
    return sessionStorage.getItem(MOTION_PREF_KEY) || '';
  } catch {
    return '';
  }
}

function cacheMotionPermission(value) {
  try {
    sessionStorage.setItem(MOTION_PREF_KEY, value);
  } catch {
    /* ignore */
  }
}

export function shakeMotionSupported() {
  return typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined';
}

/** Handhelds only — desktop still exposes DeviceMotionEvent and may prompt. */
function isShakeDevice() {
  if (typeof window === 'undefined') return false;
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')) return true;
  return Boolean(window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches);
}

/** True when we can (or already may) listen for shakes. */
export function shakeUndoLikelyAvailable() {
  if (!isShakeDevice() || !shakeMotionSupported()) return false;
  const cached = motionPermissionCached();
  if (cached === 'denied') return false;
  return true;
}

/**
 * Request motion permission if needed. Safe to call from a click/touch handler.
 * @returns {Promise<boolean>}
 */
export async function ensureShakePermission() {
  if (!isShakeDevice() || !shakeMotionSupported()) return false;
  const cached = motionPermissionCached();
  if (cached === 'granted') {
    startShakeListening();
    return true;
  }
  if (cached === 'denied') return false;

  const request = window.DeviceMotionEvent?.requestPermission;
  if (typeof request === 'function') {
    try {
      const state = await request.call(window.DeviceMotionEvent);
      const granted = state === 'granted';
      cacheMotionPermission(granted ? 'granted' : 'denied');
      if (granted) startShakeListening();
      return granted;
    } catch {
      cacheMotionPermission('denied');
      return false;
    }
  }

  cacheMotionPermission('granted');
  startShakeListening();
  return true;
}

function onDeviceMotion(event) {
  if (!pending) return;
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

  if (lastAcc) {
    const delta =
      Math.abs(acc.x - lastAcc.x) + Math.abs(acc.y - lastAcc.y) + Math.abs(acc.z - lastAcc.z);
    if (delta >= SHAKE_THRESHOLD) {
      const now = Date.now();
      if (now - lastShakeAt >= SHAKE_COOLDOWN_MS) {
        lastShakeAt = now;
        void performPendingUndo();
      }
    }
  }
  lastAcc = { x: acc.x, y: acc.y, z: acc.z };
}

function startShakeListening() {
  if (shakeListening || !shakeMotionSupported()) return;
  if (motionPermissionCached() === 'denied') return;
  window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
  shakeListening = true;
}

function stopShakeListeningIfIdle() {
  if (!shakeListening || pending) return;
  window.removeEventListener('devicemotion', onDeviceMotion);
  shakeListening = false;
  lastAcc = null;
}

function hideUndoToast() {
  const toast = document.getElementById('ch-undo-toast');
  if (!toast) return;
  stopTimingRing(toast);
  toast.classList.remove('ch-toast-visible');
  toast.setAttribute('aria-hidden', 'true');
  toast.inert = true;
  toast.onclick = null;
  if (document.activeElement === toast) toast.blur();
  clearTimeout(toastTimer);
  /* Drop the node after the fade so an invisible pill cannot sit over the header. */
  toastTimer = setTimeout(() => {
    toastTimer = null;
    if (toast.isConnected && !toast.classList.contains('ch-toast-visible')) {
      toast.remove();
    }
  }, 220);
}

function showUndoToast(onUndo) {
  let toast = document.getElementById('ch-undo-toast');
  if (!toast) {
    toast = document.createElement('button');
    toast.type = 'button';
    toast.id = 'ch-undo-toast';
    toast.className = 'ch-toast ch-undo-toast';
    toast.setAttribute('aria-hidden', 'true');
    toast.inert = true;
    document.body.appendChild(toast);
  }

  stopTimingRing(toast);
  toast.replaceChildren();
  toast.setAttribute('aria-label', 'Undo');
  toast.removeAttribute('aria-hidden');
  toast.inert = false;

  const ring = createTimingRing({ size: 26, durationMs: UNDO_WINDOW_MS, autoplay: false });
  const label = document.createElement('span');
  label.className = 'ch-undo-label';
  label.textContent = 'Undo';
  toast.append(ring, label);
  toast.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onUndo();
  };
  toast.classList.remove('ch-toast-anchored');
  toast.style.left = '';
  toast.style.top = '';

  toast.classList.add('ch-toast-visible');
  restartTimingRing(ring);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    hideUndoToast();
  }, UNDO_WINDOW_MS);
}

async function flushPendingCommit() {
  if (!pending) return;
  const { commit, timer } = pending;
  clearTimeout(timer);
  pending = null;
  hideUndoToast();
  stopShakeListeningIfIdle();
  try {
    await commit();
  } catch {
    /* commit errors surface via their own handlers when possible */
  }
}

async function performPendingUndo() {
  if (!pending) return;
  const { undo, timer } = pending;
  clearTimeout(timer);
  pending = null;
  hideUndoToast();
  stopShakeListeningIfIdle();
  try {
    await undo();
  } catch {
    /* ignore */
  }
}

/**
 * Queue a single undoable action. A new queue call commits any previous pending action first.
 * @param {{ key: string, commit: () => (void|Promise<void>), undo: () => (void|Promise<void>) }} opts
 */
export async function queueShakeUndo(opts) {
  const key = String(opts?.key || '').trim();
  const commit = opts?.commit;
  const undo = opts?.undo;
  if (!key || typeof commit !== 'function' || typeof undo !== 'function') return;

  if (pending) await flushPendingCommit();

  startShakeListening();

  const timer = setTimeout(() => {
    void flushPendingCommit();
  }, UNDO_WINDOW_MS);

  pending = { key, commit, undo, timer };
  showUndoToast(() => {
    void performPendingUndo();
  });
}

/** Keys currently waiting to commit (so dashboard refresh can hide them). */
export function pendingShakeUndoKey() {
  return pending?.key || '';
}

export function isShakeUndoPendingKey(key) {
  return Boolean(key && pending?.key === key);
}

/** Commit immediately if something is pending (page hide / navigation). */
export function flushShakeUndoCommit() {
  return flushPendingCommit();
}

/** Ids hidden during the undo window so a list refresh cannot resurrect them. */
const hiddenUntilCommit = new Set();

export function isHiddenUntilCommit(id) {
  return hiddenUntilCommit.has(String(id || ''));
}

export function filterHiddenUntilCommit(items, getId) {
  if (!hiddenUntilCommit.size || !Array.isArray(items)) return items;
  return items.filter((item) => !hiddenUntilCommit.has(String(getId(item))));
}

function rememberHiddenIds(ids) {
  for (const id of ids) hiddenUntilCommit.add(id);
}

function forgetHiddenIds(ids) {
  for (const id of ids) hiddenUntilCommit.delete(id);
}

/**
 * Optimistic delete: hide now, commit after the undo window, restore on Undo/shake.
 * A new queue call commits any previous pending action first.
 *
 * @param {{
 *   key: string,
 *   ids?: Array<string|number>,
 *   hide: () => void,
 *   restore: () => (void|Promise<void>),
 *   commit: () => (void|Promise<void>),
 *   onCommitError?: (err: Error) => (void|Promise<void>),
 * }} opts
 */
export async function queueUndoableDelete(opts) {
  const key = String(opts?.key || '').trim();
  const hide = opts?.hide;
  const restore = opts?.restore;
  const commit = opts?.commit;
  const onCommitError = opts?.onCommitError;
  if (!key || typeof hide !== 'function' || typeof restore !== 'function' || typeof commit !== 'function') {
    return;
  }
  const ids = (Array.isArray(opts.ids) ? opts.ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  rememberHiddenIds(ids);
  try {
    hide();
  } catch (e) {
    forgetHiddenIds(ids);
    throw e;
  }

  void ensureShakePermission();

  await queueShakeUndo({
    key,
    commit: async () => {
      try {
        await commit();
      } catch (e) {
        forgetHiddenIds(ids);
        await restore();
        if (typeof onCommitError === 'function') await onCommitError(e);
        return;
      }
      forgetHiddenIds(ids);
    },
    undo: () => {
      forgetHiddenIds(ids);
      return restore();
    },
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushPendingCommit();
  });
  document.addEventListener('visibilitychange', () => {
    if (visibilityCommitTimer) {
      clearTimeout(visibilityCommitTimer);
      visibilityCommitTimer = null;
    }
    if (!document.hidden) return;
    visibilityCommitTimer = setTimeout(() => {
      visibilityCommitTimer = null;
      if (document.hidden) void flushPendingCommit();
    }, VISIBILITY_COMMIT_MS);
  });
}
