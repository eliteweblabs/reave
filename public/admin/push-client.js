/**
 * Register admin PWA service worker, Web Push subscriptions, and setup alerts.
 */

import {
  openOsDialogBackdrop,
  closeOsDialogBackdrop,
  bindOsDialogKeyboardLayout,
  releaseOsDialogKeyboardLayout,
} from './os-dialog.js?v=20260728j';

const DISMISS_PREFIX = 'reave-setup-alert-dismiss:';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Set when the admin PWA has run in standalone (Dock / home screen). */
const PWA_INSTALLED_KEY = 'reave-pwa-installed';

let setupAlertResizeObs = null;
/** Stashed Chromium install event from `beforeinstallprompt`. */
let deferredInstallPrompt = null;

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

const PWA_NAV_GUARD_KEY = 'reave-pwa-nav-guard';
const PWA_WHEEL_SLOP_PX = 8;
let pwaNavGuardCleanup = null;

function isHorizontalScrollContainer(el) {
  if (!(el instanceof Element)) return false;
  const ox = getComputedStyle(el).overflowX;
  return ox === 'auto' || ox === 'scroll' || ox === 'overlay';
}

/** True when a nested overflow-x region can still absorb this horizontal wheel delta. */
function canConsumeHorizontalWheel(target, deltaX) {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.documentElement) {
    if (isHorizontalScrollContainer(node)) {
      const max = node.scrollWidth - node.clientWidth;
      if (max > 1) {
        const sl = node.scrollLeft;
        if (deltaX > 0 && sl < max - 1) return true;
        if (deltaX < 0 && sl > 1) return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Block OS/browser back-forward gestures in an installed PWA (trackpad swipe,
 * mouse back button, etc.) so navigation stays inside the admin app shell.
 *
 * Call once after the admin shell has synced tab params into the URL (boot).
 * No-op in a normal browser tab. Safe to call repeatedly — installs at most once.
 */
export function installPwaNavGuard() {
  if (typeof window === 'undefined' || !isStandalonePwa() || !isAdminSpa()) return () => {};
  if (pwaNavGuardCleanup) return pwaNavGuardCleanup;

  document.documentElement.classList.add('pwa-standalone');
  document.documentElement.style.overscrollBehaviorX = 'none';

  let trapping = false;

  const pushTrap = () => {
    if (trapping) return;
    trapping = true;
    try {
      history.pushState({ [PWA_NAV_GUARD_KEY]: true }, '', location.href);
    } catch {
      /* ignore quota / security errors */
    } finally {
      trapping = false;
    }
  };

  const onPopState = () => pushTrap();
  window.addEventListener('popstate', onPopState);
  pushTrap();

  const nav = window.navigation;
  const onNavigate = (event) => {
    if (event.navigationType !== 'traverse' || !event.canIntercept) return;
    event.intercept({ handler() {} });
  };
  nav?.addEventListener?.('navigate', onNavigate);

  const onWheel = (event) => {
    const dx = event.deltaX;
    const dy = event.deltaY;
    if (Math.abs(dx) < PWA_WHEEL_SLOP_PX) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    if (event.target instanceof Element && event.target.closest('#wrap')) return;
    if (canConsumeHorizontalWheel(event.target, dx)) return;
    event.preventDefault();
  };
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });

  pwaNavGuardCleanup = () => {
    window.removeEventListener('popstate', onPopState);
    nav?.removeEventListener?.('navigate', onNavigate);
    window.removeEventListener('wheel', onWheel, { capture: true });
    document.documentElement.classList.remove('pwa-standalone');
    pwaNavGuardCleanup = null;
  };

  return pwaNavGuardCleanup;
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Unlike iOS Safari (push only works for a home-screen-installed app),
 * Android Chrome (and other Chromium browsers there) can subscribe to and
 * receive Web Push from a normal browser tab — no install required.
 */
function canEnablePushWithoutInstall() {
  return isAndroid();
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

function markAdminPwaInstalled() {
  try {
    localStorage.setItem(PWA_INSTALLED_KEY, '1');
  } catch {
    /* ignore */
  }
}

function hasAdminPwaInstalledMarker() {
  try {
    return localStorage.getItem(PWA_INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function needsPwaInstall() {
  if (isStandalonePwa()) return false;
  if (!isAdminSpa()) return false;
  if (hasAdminPwaInstalledMarker()) return false;
  // iOS requires home-screen install for push; mobile + Chromium desktop
  // (install prompt) too — though on Android this doesn't block push itself,
  // see canEnablePushWithoutInstall().
  if (isIos() || isMobileViewport()) return true;
  if (deferredInstallPrompt) return true;
  return false;
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
    const reg = await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
    void reg.update();
    return reg;
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
  if (needsPwaInstall() && !canEnablePushWithoutInstall()) return false;
  if (await isAdminPushEnabled()) return false;
  return true;
}

function pwaInstallHint() {
  if (isIos()) {
    return 'Tap Share, then Add to Home Screen. Open the app from your home screen for push alerts and icon badges.';
  }
  if (deferredInstallPrompt) {
    return 'Install to your Dock or taskbar for a standalone window, push alerts, and icon badges.';
  }
  return 'Install this app from the address-bar install icon, or your browser menu → Install app / Add to Home screen.';
}

async function promptPwaInstall() {
  if (!deferredInstallPrompt) return false;
  const evt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try {
    await evt.prompt();
    await evt.userChoice;
  } catch (e) {
    console.warn('[pwa] install prompt failed', e);
  }
  void syncAdminSetupAlerts();
  void syncAdminPushButton();
  return true;
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
      ? '<strong>Notifications are blocked</strong><p>Enable notifications in your browser or device settings to get inbox alerts, bookings, and website monitoring.</p>'
      : '<strong>Enable notifications</strong><p>Get inbox alerts, booking updates, and website monitoring even when the app is in the background.</p>';
  }

  const actions = document.createElement('div');
  actions.className = 'admin-setup-alert-actions';

  if (kind === 'pwa' && deferredInstallPrompt) {
    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'admin-setup-alert-btn admin-setup-alert-btn--primary';
    installBtn.textContent = 'Install app';
    installBtn.addEventListener('click', async () => {
      installBtn.disabled = true;
      await promptPwaInstall();
    });
    actions.appendChild(installBtn);
  }

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

  alert.append(copy);
  if (actions.childNodes.length) alert.appendChild(actions);
  alert.appendChild(dismissBtn);
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
  const root = document.getElementById('admin-setup-alerts');
  if (root?.dataset.actionBanner === '1') return 'action';

  clearSetupAlerts();

  // Platforms that can receive push without installing first (Android) get
  // the push-enable offer even while an unrelated install nag is pending —
  // installing isn't a prerequisite there like it is on iOS.
  const pushCanLeadInstall = canEnablePushWithoutInstall();

  if (!pushCanLeadInstall && needsPwaInstall() && !isDismissed('pwa')) {
    renderSetupAlert('pwa');
    return 'pwa';
  }

  if ((await needsPushEnable()) && !isDismissed('push')) {
    renderSetupAlert('push');
    return 'push';
  }

  if (pushCanLeadInstall && needsPwaInstall() && !isDismissed('pwa')) {
    renderSetupAlert('pwa');
    return 'pwa';
  }

  return null;
}

let activeActionBannerFinish = null;

export function clearAdminActionBanner(restoreSetup = true) {
  const root = document.getElementById('admin-setup-alerts');
  if (root?.dataset.actionBanner === '1') {
    root.hidden = true;
    root.replaceChildren();
    delete root.dataset.actionBanner;
  }
  activeActionBannerFinish = null;
  syncSetupAlertInset();
  if (restoreSetup) void syncAdminSetupAlerts();
}

/** Header notification banner with confirm/cancel — same chrome as setup alerts. */
export function showAdminConfirmBanner(opts = {}) {
  return new Promise((resolve) => {
    clearAdminActionBanner(false);

    const root = document.getElementById('admin-setup-alerts');
    if (!root) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      activeActionBannerFinish = null;
      clearAdminActionBanner(true);
      resolve(value);
    };
    activeActionBannerFinish = finish;

    root.hidden = false;
    root.replaceChildren();
    root.dataset.actionBanner = '1';

    const alert = document.createElement('div');
    alert.className = 'admin-setup-alert admin-setup-alert--confirm';
    alert.setAttribute('role', 'alertdialog');
    alert.setAttribute('aria-modal', 'false');
    alert.setAttribute('aria-labelledby', 'admin-action-banner-title');

    const copy = document.createElement('div');
    copy.className = 'admin-setup-alert-copy';
    const title = opts.title ? `<strong id="admin-action-banner-title">${opts.title}</strong>` : '';
    copy.innerHTML = `${title}${opts.bodyHtml || ''}`;

    const actions = document.createElement('div');
    actions.className = 'admin-setup-alert-actions';

    if (opts.showCancel !== false) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'admin-setup-alert-btn';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';
      cancelBtn.addEventListener('click', () => finish(false));
      actions.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `admin-setup-alert-btn ${
      opts.danger ? 'admin-setup-alert-btn--danger' : 'admin-setup-alert-btn--primary'
    }`.trim();
    confirmBtn.textContent = opts.confirmLabel || 'OK';
    confirmBtn.addEventListener('click', () => finish(true));
    actions.appendChild(confirmBtn);

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'admin-setup-alert-dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    dismissBtn.addEventListener('click', () => finish(false));

    alert.append(copy);
    if (actions.childNodes.length) alert.appendChild(actions);
    alert.appendChild(dismissBtn);
    root.appendChild(alert);
    bindSetupAlertResize();
    requestAnimationFrame(() => syncSetupAlertInset());
    confirmBtn.focus();
  });
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
    if (enabled) ensureTestPushMenuItem();
    else removeTestPushMenuItem();
    // Keep the compact bell as a fallback when the inline alert was dismissed.
    btn.hidden = enabled || activeAlert === 'push' || activeAlert === 'pwa';
  } catch {
    removeTestPushMenuItem();
    btn.hidden = activeAlert === 'push' || activeAlert === 'pwa';
  }
}

export async function sendTestPushNotification(opts = {}) {
  const res = await fetch('/api/admin/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: opts.title,
      message: opts.message,
      url: opts.url,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Test notification failed');
  }
  return data;
}

let sleepModeCache = null;

async function fetchSleepModeSettings() {
  const res = await fetch('/api/push/settings', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Could not load sleep mode');
  sleepModeCache = data;
  return data;
}

function formatSleepMenuLabel(data) {
  const active = data?.active ? ' · on now' : '';
  const label = data?.label || '11 PM – 7 AM';
  return data?.settings?.sleepModeEnabled ? `Sleep mode (${label})${active}` : 'Sleep mode (off)';
}

async function openSleepModeDialog() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    alert('Sleep mode settings are only available on the admin dashboard.');
    return;
  }

  let data;
  try {
    data = await fetchSleepModeSettings();
  } catch (e) {
    alert(e.message || String(e));
    return;
  }

  const s = data.settings || {};
  const tz =
    s.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'America/New_York';

  titleEl.textContent = 'Sleep mode';
  bodyEl.innerHTML =
    '<p class="em-hint">During quiet hours, inbound mail is held without AI triage, phone push is paused, and all Claude API calls are blocked until the window ends. Messages received overnight appear in the Email tab with status <strong>Sleep deferred</strong>.</p>' +
    '<label class="re-check" style="display:flex;gap:8px;margin:12px 0 8px">' +
    `<input type="checkbox" id="sleep-mode-enabled" ${s.sleepModeEnabled !== false ? 'checked' : ''} />` +
    '<span>Enable sleep mode</span></label>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0">' +
    '<label style="flex:1;min-width:120px">From<br><input type="time" id="sleep-mode-start" value="' +
    (s.quietStart || '23:00') +
    '" style="width:100%"></label>' +
    '<label style="flex:1;min-width:120px">Until<br><input type="time" id="sleep-mode-end" value="' +
    (s.quietEnd || '07:00') +
    '" style="width:100%"></label></div>' +
    '<label style="display:block;margin:8px 0">Timezone<br>' +
    `<input type="text" id="sleep-mode-tz" value="${tz.replace(/"/g, '&quot;')}" style="width:100%" placeholder="America/New_York"></label>`;

  actionsEl.innerHTML = '';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'os-dialog-btn os-dialog-btn--ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    releaseOsDialogKeyboardLayout();
    closeOsDialogBackdrop();
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'os-dialog-btn os-dialog-btn--primary';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const saved = await patchSleepModeSettings({
        sleepModeEnabled: document.getElementById('sleep-mode-enabled')?.checked ?? true,
        quietStart: document.getElementById('sleep-mode-start')?.value || '23:00',
        quietEnd: document.getElementById('sleep-mode-end')?.value || '07:00',
        timezone: document.getElementById('sleep-mode-tz')?.value?.trim() || tz,
      });
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  actionsEl.append(cancelBtn, saveBtn);
  openOsDialogBackdrop();
  bindOsDialogKeyboardLayout();
  saveBtn.focus();
}

function updateSleepModeMenuItem(data) {
  const btn = document.getElementById('topbar-sleep-mode-link');
  if (!btn) return;
  btn.textContent = formatSleepMenuLabel(data || sleepModeCache);
  btn.classList.toggle('topbar-dropdown-item--active', Boolean(data?.active));
}

async function patchSleepModeSettings(patch) {
  const res = await fetch('/api/push/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const saved = await res.json().catch(() => ({}));
  if (!res.ok || !saved.ok) throw new Error(saved.error || `HTTP ${res.status}`);
  sleepModeCache = saved;
  updateSleepModeMenuItem(saved);
  syncTopbarSleepToggle(saved);
  return saved;
}

function formatTopbarSleepLabel(data, enabled) {
  const until = data?.quietEndLabel || '7:00 AM';
  if (enabled) return `Sleeping until ${until}`;
  const since = data?.awakeSinceLabel || until;
  return `Awake since ${since}`;
}

function syncTopbarSleepToggle(data = sleepModeCache) {
  const wrap = document.getElementById('topbar-sleep-toggle');
  const btn = document.getElementById('topbar-sleep-toggle-btn');
  const label = document.getElementById('topbar-sleep-toggle-label');
  const topbar = document.getElementById('topbar');
  if (!wrap || !btn) return;

  const inWindow = Boolean(data?.inQuietWindow);
  wrap.hidden = !inWindow;
  topbar?.classList.toggle('topbar-has-sleep-toggle', inWindow);
  if (!inWindow) return;

  const enabled = data?.settings?.sleepModeEnabled !== false;
  if (label) label.textContent = formatTopbarSleepLabel(data, enabled);
  btn.setAttribute('aria-checked', enabled ? 'true' : 'false');
  btn.setAttribute(
    'aria-label',
    enabled
      ? `Sleep mode on until ${data?.quietEndLabel || 'quiet hours end'} — tap to allow AI and alerts tonight`
      : `Sleep mode off since ${data?.awakeSinceLabel || 'you opted out'} — tap to pause AI and alerts again`,
  );
}

async function refreshTopbarSleepToggle() {
  if (!document.body?.dataset?.userId?.trim()) return;
  try {
    const data = await fetchSleepModeSettings();
    syncTopbarSleepToggle(data);
  } catch {
    /* ignore — menu item fetch already logs via dialog path */
  }
}

function initTopbarSleepToggle() {
  const btn = document.getElementById('topbar-sleep-toggle-btn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const nextEnabled = btn.getAttribute('aria-checked') !== 'true';
    btn.disabled = true;
    try {
      await patchSleepModeSettings({ sleepModeEnabled: nextEnabled });
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  });

  void refreshTopbarSleepToggle();
  if (!window.__topbarSleepToggleTimer) {
    window.__topbarSleepToggleTimer = setInterval(() => {
      void refreshTopbarSleepToggle();
    }, 60_000);
  }
}

function ensureSleepModeMenuItem() {
  const menu = document.getElementById('topbar-profile-menu');
  if (!menu || document.getElementById('topbar-sleep-mode-link')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'topbar-sleep-mode-link';
  btn.className = 'topbar-dropdown-item';
  btn.setAttribute('role', 'menuitem');
  btn.textContent = 'Sleep mode';
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void openSleepModeDialog();
  });

  const testBtn = document.getElementById('topbar-test-push-link');
  if (testBtn) testBtn.insertAdjacentElement('afterend', btn);
  else {
    const divider = menu.querySelector('.topbar-dropdown-divider');
    if (divider) menu.insertBefore(btn, divider);
    else menu.appendChild(btn);
  }

  void fetchSleepModeSettings()
    .then((data) => {
      updateSleepModeMenuItem(data);
      syncTopbarSleepToggle(data);
    })
    .catch(() => {});
}

function removeSleepModeMenuItem() {
  document.getElementById('topbar-sleep-mode-link')?.remove();
  sleepModeCache = null;
}

function ensureTestPushMenuItem() {
  const menu = document.getElementById('topbar-profile-menu');
  if (!menu || document.getElementById('topbar-test-push-link')) return;

  const divider = menu.querySelector('.topbar-dropdown-divider');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'topbar-test-push-link';
  btn.className = 'topbar-dropdown-item';
  btn.setAttribute('role', 'menuitem');
  btn.textContent = 'Test notification';
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    btn.disabled = true;
    try {
      await sendTestPushNotification();
      btn.textContent = 'Test sent';
      setTimeout(() => {
        btn.textContent = 'Test notification';
        btn.disabled = false;
      }, 2500);
    } catch (e) {
      btn.disabled = false;
      alert(e.message || String(e));
    }
  });

  if (divider) menu.insertBefore(btn, divider);
  else menu.appendChild(btn);
  ensureSleepModeMenuItem();
}

function removeTestPushMenuItem() {
  document.getElementById('topbar-test-push-link')?.remove();
  removeSleepModeMenuItem();
}

async function maybeOfferTestPushAfterSubscribe() {
  try {
    const ok = await showAdminConfirmBanner({
      title: 'Notifications enabled',
      bodyHtml:
        '<p>Send a test notification now? Lock your phone or switch apps to see it arrive like a real alert.</p>',
      confirmLabel: 'Send test',
      cancelLabel: 'Not now',
    });
    if (!ok) return;
    await sendTestPushNotification();
  } catch (e) {
    console.warn('[push] test offer failed', e);
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
  ensureTestPushMenuItem();
  void maybeOfferTestPushAfterSubscribe();
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
  if (isStandalonePwa()) markAdminPwaInstalled();
  void registerAdminServiceWorker();

  let reloadedForSwUpdate = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloadedForSwUpdate) return;
    reloadedForSwUpdate = true;
    window.location.reload();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    void syncAdminSetupAlerts();
    void syncAdminPushButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    markAdminPwaInstalled();
    dismissAlert('pwa');
    void syncAdminSetupAlerts();
    void syncAdminPushButton();
  });

  document.addEventListener('DOMContentLoaded', () => {
    initAdminPushButton();
    initTopbarSleepToggle();
  });
  window.addEventListener('pageshow', () => syncAdminPushButton());
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => syncAdminPushButton());
}
