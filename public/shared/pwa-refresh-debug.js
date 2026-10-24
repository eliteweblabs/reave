/**
 * PWA / full-page refresh diagnostics — persists cause across navigation, alerts on next load.
 *
 * Disable: localStorage.setItem('reave-pwa-refresh-debug', '0')
 * Force enable in browser tab: ?pwaRefreshDebug=1
 */

const STORAGE_KEY = 'reave-pwa-refresh-debug-pending';
const HAND_REFRESH_INTENT_KEY = 'reave-pwa-hand-refresh-intent';
const FORCE_KEY = 'reave-pwa-refresh-debug-force';

function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function isAdminSpaPath() {
  if (typeof location === 'undefined') return false;
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

export function pwaRefreshDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem('reave-pwa-refresh-debug') === '0') return false;
  } catch {
    /* ignore */
  }
  try {
    if (sessionStorage.getItem(FORCE_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('pwaRefreshDebug') === '1') {
      sessionStorage.setItem(FORCE_KEY, '1');
      return true;
    }
  } catch {
    /* ignore */
  }
  return isStandaloneDisplayMode();
}

/** @param {string} source @param {Record<string, unknown>} [detail] */
function stashHandRefreshIntent(source, detail = {}) {
  try {
    sessionStorage.setItem(
      HAND_REFRESH_INTENT_KEY,
      JSON.stringify({
        source,
        detail,
        at: new Date().toISOString(),
        fromUrl: location.href,
      }),
    );
  } catch {
    /* ignore */
  }
}

/** @param {string} cause @param {Record<string, unknown>} [detail] */
export function markPwaRefreshCause(cause, detail = {}) {
  if (!pwaRefreshDebugEnabled()) return;
  let stack = '';
  try {
    stack = new Error().stack?.split('\n').slice(2, 6).join('\n') || '';
  } catch {
    /* ignore */
  }
  const payload = {
    cause,
    detail,
    at: new Date().toISOString(),
    fromUrl: location.href,
    standalone: isStandaloneDisplayMode(),
    stack,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function readHandRefreshIntent() {
  try {
    const raw = sessionStorage.getItem(HAND_REFRESH_INTENT_KEY) || '';
    if (!raw) return null;
    sessionStorage.removeItem(HAND_REFRESH_INTENT_KEY);
    return JSON.parse(raw);
  } catch {
    try {
      sessionStorage.removeItem(HAND_REFRESH_INTENT_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function formatPendingAlert(payload) {
  const lines = [
    '[PWA refresh debug]',
    `Cause: ${payload.cause}`,
    `When (previous page): ${payload.at}`,
    `From: ${payload.fromUrl}`,
    `Standalone: ${payload.standalone ? 'yes' : 'no'}`,
  ];
  if (payload.detail && Object.keys(payload.detail).length) {
    lines.push(`Detail: ${JSON.stringify(payload.detail)}`);
  }
  if (payload.stack) lines.push(`Stack:\n${payload.stack}`);
  return lines.join('\n');
}

function formatHandRefreshAlert(intent, navType) {
  const lines = [
    '[PWA refresh debug]',
    'Cause: user-hand-refresh (manual)',
    'This was a hand refresh — not an automatic app reload.',
    `Navigation type: ${navType || 'unknown'}`,
  ];
  if (intent?.source) lines.push(`Source: ${intent.source}`);
  if (intent?.fromUrl) lines.push(`From: ${intent.fromUrl}`);
  if (intent?.at) lines.push(`When (previous page): ${intent.at}`);
  if (intent?.detail && Object.keys(intent.detail).length) {
    lines.push(`Detail: ${JSON.stringify(intent.detail)}`);
  }
  return lines.join('\n');
}

function navigationEntry() {
  try {
    return performance.getEntriesByType('navigation')[0];
  } catch {
    return null;
  }
}

function isUserHandRefreshCause(cause) {
  return (
    cause === 'user-hand-refresh' ||
    cause === 'location.reload' ||
    (typeof cause === 'string' && cause.startsWith('user-hand-refresh'))
  );
}

function showPendingRefreshAlert() {
  if (!pwaRefreshDebugEnabled()) return;
  let raw = '';
  try {
    raw = sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return;
  }

  const nav = navigationEntry();
  const navType = nav?.type || 'unknown';

  if (raw) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    try {
      const payload = JSON.parse(raw);
      if (isUserHandRefreshCause(payload.cause)) {
        alert(formatHandRefreshAlert({ source: payload.cause, detail: payload.detail, fromUrl: payload.fromUrl, at: payload.at }, navType));
      } else {
        alert(formatPendingAlert(payload));
      }
    } catch {
      alert(`[PWA refresh debug]\nCause: (corrupt pending mark)\n${raw}`);
    }
    return;
  }

  const intent = readHandRefreshIntent();
  if (intent && navType === 'reload') {
    alert(formatHandRefreshAlert(intent, navType));
    return;
  }

  if (navType === 'reload') {
    alert(
      '[PWA refresh debug]\nCause: unknown full reload\n' +
        '(No mark was stored. If you used pull-to-refresh: the admin shell blocks native document PTR — try again after deploy; standalone pull-reload may apply.)',
    );
  }
}

function inferCauseFromUrl(url) {
  const s = String(url);
  if (s.includes('/__clerk/') && s.includes('handshake')) return 'clerk-handshake-url (location API)';
  if (s.includes('/admin/login') || s.includes('/sign-in')) return 'admin-login-redirect';
  if (s.includes('/sign-out')) return 'sign-out-redirect';
  return 'location-navigation';
}

function patchLocationNavigation() {
  if (typeof window === 'undefined' || window.__reavePwaRefreshDebugPatched) return;
  window.__reavePwaRefreshDebugPatched = true;

  const proto = window.Location?.prototype;
  if (!proto) return;

  for (const method of ['assign', 'replace']) {
    const original = proto[method];
    if (typeof original !== 'function') continue;
    proto[method] = function patchedAssignReplace(url) {
      if (pwaRefreshDebugEnabled()) {
        const cause = inferCauseFromUrl(url);
        if (cause === 'location-navigation') {
          markPwaRefreshCause('location.' + method, { url: String(url) });
        } else {
          markPwaRefreshCause(cause, { via: 'location.' + method, url: String(url) });
        }
      }
      return original.call(this, url);
    };
  }

  const originalReload = proto.reload;
  if (typeof originalReload === 'function') {
    proto.reload = function patchedReload(forcedReload) {
      stashHandRefreshIntent('location.reload', { forcedReload: forcedReload === true });
      markPwaRefreshCause('user-hand-refresh', {
        method: 'location.reload',
        forcedReload: forcedReload === true,
      });
      return originalReload.call(this, forcedReload);
    };
  }

  try {
    const hrefDesc =
      Object.getOwnPropertyDescriptor(proto, 'href') ||
      Object.getOwnPropertyDescriptor(window.location, 'href');
    if (hrefDesc?.set && hrefDesc?.get) {
      Object.defineProperty(proto, 'href', {
        configurable: true,
        enumerable: hrefDesc.enumerable,
        get() {
          return hrefDesc.get.call(this);
        },
        set(value) {
          if (pwaRefreshDebugEnabled()) {
            const cause = inferCauseFromUrl(value);
            markPwaRefreshCause(
              cause === 'location-navigation' ? 'location.href' : cause,
              { url: String(value) },
            );
          }
          hrefDesc.set.call(this, value);
        },
      });
    }
  } catch (e) {
    console.warn('[pwa-refresh-debug] href patch skipped', e);
  }
}

/** True when nested list PTR or an inner scroller can absorb vertical overscroll. */
function touchInsideActivePullRefresh(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('.ios-ptr-host.ios-ptr-active, .ios-ptr-host.ios-ptr-refreshing')) return true;
  const scrollHost = target.closest(
    '.ch-list, .em-list, .de-list, .home-dashboard-scroll, .profile-panel-scroll, .schedule-panel-scroll, .ios-ptr-host',
  );
  if (scrollHost instanceof Element && scrollHost.scrollTop > 1) return true;
  return false;
}

/**
 * Admin uses overscroll-behavior:none on html/body — native document pull-to-refresh
 * often fails ("can't refresh"). In standalone, a deliberate top pull runs reload().
 */
function installStandaloneHandRefreshReload() {
  if (!isStandaloneDisplayMode() || !isAdminSpaPath()) return;
  if (window.__reavePwaHandRefreshReload) return;
  window.__reavePwaHandRefreshReload = true;

  let startY = 0;
  let startX = 0;
  let tracking = false;
  let fired = false;

  const PULL_MIN_DY = 120;
  const PULL_MAX_DX = 48;

  window.addEventListener(
    'touchstart',
    (e) => {
      if (fired || e.touches.length !== 1) return;
      if (touchInsideActivePullRefresh(e.target)) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
    },
    { passive: true, capture: true },
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking || fired || e.touches.length !== 1) return;
      if (touchInsideActivePullRefresh(e.target)) {
        tracking = false;
        return;
      }
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dx > PULL_MAX_DX && dx > Math.abs(dy)) {
        tracking = false;
        return;
      }
      if (dy < PULL_MIN_DY) return;
      fired = true;
      tracking = false;
      stashHandRefreshIntent('standalone-pull-reload', { dy: Math.round(dy) });
      markPwaRefreshCause('user-hand-refresh', { method: 'standalone-pull-reload', dy: Math.round(dy) });
      window.location.reload();
    },
    { passive: true, capture: true },
  );

  window.addEventListener(
    'touchend',
    () => {
      tracking = false;
    },
    { passive: true, capture: true },
  );
}

function bindUserHandRefreshDetection() {
  if (typeof window === 'undefined' || window.__reavePwaHandRefreshDetect) return;
  window.__reavePwaHandRefreshDetect = true;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r')) {
      stashHandRefreshIntent('keyboard-shortcut', {
        key: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
      });
    }
  });

  window.addEventListener('pagehide', () => {
    try {
      if (sessionStorage.getItem(HAND_REFRESH_INTENT_KEY)) return;
      const nav = navigationEntry();
      if (nav?.type === 'reload') {
        stashHandRefreshIntent('pagehide-reload', { note: 'reload without prior intent mark' });
      }
    } catch {
      /* ignore */
    }
  });
}

function bindLifecycleHints() {
  if (typeof window === 'undefined') return;

  window.addEventListener('pageshow', (ev) => {
    if (!pwaRefreshDebugEnabled() || !ev.persisted) return;
    alert(
      '[PWA refresh debug]\nCause: bfcache-restore (pageshow persisted)\n' +
        'The page was restored from back-forward cache — not a new network load.',
    );
  });

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (!pwaRefreshDebugEnabled()) return;
    alert(
      '[PWA refresh debug]\nCause: service-worker-controllerchange\n' +
        'A new service worker took control (usually after deploy). Admin SPA does not auto-reload on this event.',
    );
  });
}

export function installPwaRefreshDebug() {
  if (typeof window === 'undefined') return;
  patchLocationNavigation();
  bindUserHandRefreshDetection();
  installStandaloneHandRefreshReload();
  bindLifecycleHints();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showPendingRefreshAlert, { once: true });
  } else {
    showPendingRefreshAlert();
  }
}

installPwaRefreshDebug();

if (typeof window !== 'undefined') {
  window.__markPwaRefreshCause = markPwaRefreshCause;
  window.__pwaRefreshDebugEnabled = pwaRefreshDebugEnabled;
  window.__reaveHandRefresh = () => {
    stashHandRefreshIntent('reaveHandRefresh-api', {});
    markPwaRefreshCause('user-hand-refresh', { method: 'reaveHandRefresh-api' });
    window.location.reload();
  };
}
