/**
 * Shake-to-undo for reversible admin actions (e.g. dismissing a dashboard notification).
 *
 * Flow: optimistic UI → short undo window → commit. Shake (when motion is available)
 * or tapping Undo cancels the commit and runs the undo callback.
 *
 * iOS 13+ requires DeviceMotionEvent.requestPermission() from a user gesture; call
 * ensureShakePermission() from the dismiss tap/swipe before queueing.
 */

const UNDO_WINDOW_MS = 5000;
const SHAKE_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 900;
const MOTION_PREF_KEY = 'reave-motion-permission';

/** @type {{ key: string, commit: () => (void|Promise<void>), undo: () => (void|Promise<void>), timer: ReturnType<typeof setTimeout> } | null} */
let pending = null;
let shakeListening = false;
let lastShakeAt = 0;
let lastAcc = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;

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

/** True when we can (or already may) listen for shakes. */
export function shakeUndoLikelyAvailable() {
  if (!shakeMotionSupported()) return false;
  const cached = motionPermissionCached();
  if (cached === 'denied') return false;
  return true;
}

/**
 * Request motion permission if needed. Safe to call from a click/touch handler.
 * @returns {Promise<boolean>}
 */
export async function ensureShakePermission() {
  if (!shakeMotionSupported()) return false;
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
  toast.classList.remove('ch-toast-visible');
  clearTimeout(toastTimer);
  toastTimer = null;
}

function showUndoToast(message, onUndo) {
  let toast = document.getElementById('ch-undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ch-undo-toast';
    toast.className = 'ch-toast ch-undo-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }

  toast.replaceChildren();

  const label = document.createElement('span');
  label.className = 'ch-undo-toast-label';
  label.textContent = message;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ch-undo-toast-btn';
  btn.textContent = 'Undo';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onUndo();
  });

  toast.append(label, btn);
  toast.classList.remove('ch-toast-anchored');
  toast.style.left = '';
  toast.style.top = '';
  toast.classList.add('ch-toast-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('ch-toast-visible');
    toastTimer = null;
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
 * @param {{ key: string, commit: () => (void|Promise<void>), undo: () => (void|Promise<void>), message?: string }} opts
 */
export async function queueShakeUndo(opts) {
  const key = String(opts?.key || '').trim();
  const commit = opts?.commit;
  const undo = opts?.undo;
  if (!key || typeof commit !== 'function' || typeof undo !== 'function') return;

  if (pending) await flushPendingCommit();

  startShakeListening();

  const shakeHint = shakeUndoLikelyAvailable() && motionPermissionCached() !== 'denied';
  const message =
    opts.message ||
    (shakeHint ? 'Dismissed — Shake to Undo' : 'Notification dismissed');

  const timer = setTimeout(() => {
    void flushPendingCommit();
  }, UNDO_WINDOW_MS);

  pending = { key, commit, undo, timer };
  showUndoToast(message, () => {
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

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushPendingCommit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushPendingCommit();
  });
}
