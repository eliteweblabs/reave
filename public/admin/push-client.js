/**
 * Register admin PWA service worker, Web Push subscriptions, and setup alerts.
 */

const DISMISS_PREFIX = 'reave-setup-alert-dismiss:';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let setupAlertResizeObs = null;

function syncSetupAlertInset() {
  const root = document.getElementById('admin-setup-alerts');
  const h = root && !root.hidden ? root.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--setup-alert-h', `${Math.ceil(h)}px`);
}

function bindSetupAlertResize() {
  const root = document.getElementById('admin-setup-alerts');
  if (!root || setupAlertResizeObs) return;
  setupAlertResizeObs = new ResizeObserver(() => syncSetupAlertInset());
  setupAlertResizeObs.observe(root);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

export function isAdminSpa() {
  if (typeof location === 'undefined') return false;
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

export function needsPwaInstall() {
  if (isStandalonePwa()) return false;
  if (!isAdminSpa()) return false;
  // iOS requires home-screen install for push; other mobile users benefit too.
  return isIos() || isMobileViewport();
}

function isDismissed(key) {
  try {
    const raw = localStorage.getItem(`${DISMISS_PREFIX}${key}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function dismissAlert(key) {
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${key}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export async function registerAdminServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
  } catch (e) {
    console.warn('[push] SW register failed', e);
    return null;
  }
}

async function getExistingPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/admin/');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function isAdminPushEnabled() {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const sub = await getExistingPushSubscription();
  return !!sub;
}

export async function needsPushEnable() {
  if (!('Notification' in window) || !('PushManager' in window)) return false;
  if (!isAdminSpa()) return false;
  if (needsPwaInstall()) return false;
  if (await isAdminPushEnabled()) return false;
  return true;
}

function pwaInstallHint() {
  if (isIos()) {
    return 'Tap Share, then Add to Home Screen. Open the app from your home screen for push alerts and icon badges.';
  }
  return 'Install this app to your home screen for push alerts and icon badges. Use your browser menu → Install app or Add to Home screen.';
}

function renderSetupAlert(kind) {
  const root = document.getElementById('admin-setup-alerts');
  if (!root) return null;

  root.hidden = false;
  root.replaceChildren();

  const alert = document.createElement('div');
  alert.className = `admin-setup-alert admin-setup-alert--${kind}`;
  alert.setAttribute('role', 'status');

  const copy = document.createElement('div');
  copy.className = 'admin-setup-alert-copy';

  if (kind === 'pwa') {
    copy.innerHTML =
      '<strong>Install the admin app</strong>' +
      `<p>${pwaInstallHint()}</p>`;
  } else {
    const denied = Notification.permission === 'denied';
    copy.innerHTML = denied
      ? '<strong>Notifications are blocked</strong><p>Enable notifications in your browser or device settings to get inbox alerts, bookings, and site monitoring.</p>'
      : '<strong>Enable notifications</strong><p>Get inbox alerts, booking updates, and site monitoring even when the app is in the background.</p>';
  }

  const actions = document.createElement('div');
  actions.className = 'admin-setup-alert-actions';

  if (kind === 'push' && Notification.permission !== 'denied') {
    const enableBtn = document.createElement('button');
    enableBtn.type = 'button';
    enableBtn.className = 'admin-setup-alert-btn admin-setup-alert-btn--primary';
    enableBtn.textContent = 'Enable notifications';
    enableBtn.addEventListener('click', async () => {
      enableBtn.disabled = true;
      try {
        await subscribeAdminPush();
        syncAdminSetupAlerts();
        syncAdminPushButton();
      } catch (e) {
        enableBtn.disabled = false;
        const err = document.createElement('p');
        err.className = 'admin-setup-alert-error';
        err.textContent = e.message || String(e);
        copy.appendChild(err);
      }
    });
    actions.appendChild(enableBtn);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'admin-setup-alert-dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss setup alert');
  dismissBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  dismissBtn.addEventListener('click', () => {
    dismissAlert(kind);
    syncAdminSetupAlerts();
    syncAdminPushButton();
  });
  actions.appendChild(dismissBtn);

  alert.append(copy, actions);
  root.appendChild(alert);
  bindSetupAlertResize();
  requestAnimationFrame(() => syncSetupAlertInset());
  return alert;
}

function clearSetupAlerts() {
  const root = document.getElementById('admin-setup-alerts');
  if (root) {
    root.hidden = true;
    root.replaceChildren();
  }
  syncSetupAlertInset();
}

export async function syncAdminSetupAlerts() {
  clearSetupAlerts();

  if (needsPwaInstall() && !isDismissed('pwa')) {
    renderSetupAlert('pwa');
    return 'pwa';
  }

  if ((await needsPushEnable()) && !isDismissed('push')) {
    renderSetupAlert('push');
    return 'push';
  }

  return null;
}

export async function syncAdminPushButton(buttonId = 'push-enable-btn') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.classList.remove('push-on');
  btn.disabled = false;

  if (!('Notification' in window) || !('PushManager' in window)) {
    btn.hidden = true;
    return;
  }

  await registerAdminServiceWorker();

  const activeAlert = await syncAdminSetupAlerts();

  try {
    const enabled = await isAdminPushEnabled();
    // Keep the compact bell as a fallback when the inline alert was dismissed.
    btn.hidden = enabled || activeAlert === 'push' || activeAlert === 'pwa';
  } catch {
    btn.hidden = activeAlert === 'push' || activeAlert === 'pwa';
  }
}

export async function subscribeAdminPush() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Push not supported in this browser');
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied');

  const reg = await registerAdminServiceWorker();
  if (!reg) throw new Error('Service worker unavailable');

  const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
  const keyData = await keyRes.json();
  if (!keyRes.ok || !keyData.publicKey) {
    throw new Error(keyData.error || 'Push not configured on server');
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Subscribe failed');
  return sub;
}

export function initAdminPushButton(buttonId = 'push-enable-btn') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  void syncAdminPushButton(buttonId);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await subscribeAdminPush();
      await syncAdminPushButton(buttonId);
    } catch (e) {
      alert(e.message || String(e));
      btn.disabled = false;
    }
  });
}

// Auto-init when loaded as module from admin page
if (typeof document !== 'undefined') {
  void registerAdminServiceWorker();
  document.addEventListener('DOMContentLoaded', () => initAdminPushButton());
  window.addEventListener('pageshow', () => syncAdminPushButton());
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => syncAdminPushButton());
}
