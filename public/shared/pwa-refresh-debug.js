/**
 * PWA / full-page refresh diagnostics — persists cause across navigation, alerts on next load.
 *
 * Known automatic full-page navigations in Reave admin:
 * - Clerk __session handshake (401 recovery, deferred foreground, sign-in) — shared.js, SignInSheet
 * - Session expired → login sheet or /admin/login — shared.js
 * - Service worker skipWaiting on deploy (controllerchange; reload intentionally disabled in push-client)
 * - SW registration update check (~30 min) — push-client registerAdminServiceWorker
 * - Session keepalive probe (4 min) — shared.js installAdminSessionKeepalive (nav only if deferred handshake flushes)
 *
 * Explicit reload(): visit-plan save, digital-audit, ConversationalForm checkout complete.
 *
 * Disable: localStorage.setItem('reave-pwa-refresh-debug', '0')
 * Force enable in browser tab: ?pwaRefreshDebug=1
 */

const STORAGE_KEY = 'reave-pwa-refresh-debug-pending';
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

function showPendingRefreshAlert() {
  if (!pwaRefreshDebugEnabled()) return;
  let raw = '';
  try {
    raw = sessionStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return;
  }
  if (!raw) {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav?.type === 'reload') {
        alert(
          '[PWA refresh debug]\nCause: unknown full reload\n(No mark was stored — likely browser Reload, OS reclaim, or extension.)',
        );
      }
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    const payload = JSON.parse(raw);
    alert(formatPendingAlert(payload));
  } catch {
    alert(`[PWA refresh debug]\nCause: (corrupt pending mark)\n${raw}`);
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
      markPwaRefreshCause('location.reload', {
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
}
