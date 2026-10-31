/**
 * Clerk sign-in sheet boot — external module (Safari-safe; no inline define:vars + import).
 */
function readSignInSheetConfig() {
  const el = document.getElementById('sign-in-sheet-config');
  if (!el?.textContent?.trim()) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

const cfg = readSignInSheetConfig();
if (!cfg) {
  console.warn('[reave] sign-in-sheet-config missing — sheet disabled');
} else {
  void bootSignInSheet(cfg);
}

async function bootSignInSheet(cfg) {
  const autoOpenSignIn = cfg.autoOpenSignIn === true;
  const fallbackRedirectUrl = String(cfg.fallbackRedirectUrl || '/admin/');
  const authPath = String(cfg.authPath || '/sign-in');
  const allowSignUp = cfg.allowSignUp !== false;
  const startOnSignUp = cfg.startOnSignUp === true;
  const closeHref = String(cfg.closeHref || '');
  const assetVersion = String(cfg.assetVersion || '');

  await import(`/shared/pwa-refresh-debug.js?v=${assetVersion}`);
  const diagnosticMod = await import(`/shared/reave-diagnostic.js?v=${assetVersion}`);
  const clerkDiag = diagnosticMod.createTracer('clerk');
  const sharedMod = await import(`/admin/shared.js?v=${assetVersion}`);
  const bindClerkSsrSessionSync = sharedMod.bindClerkSsrSessionSync;
  const clerkHandshakeUrl = sharedMod.clerkHandshakeUrl;
  const adminHandshakeInCooldown = sharedMod.adminHandshakeInCooldown;
  const trySilentAdminSessionRefresh = sharedMod.trySilentAdminSessionRefresh;
  const tryClerkHandshakeFetch = sharedMod.tryClerkHandshakeFetch;
  const markAdminSessionHealed = sharedMod.markAdminSessionHealed;
  const performStaffSignOut = sharedMod.performStaffSignOut;

  const themeMod = await import(`./sign-in-clerk-theme.js?v=${assetVersion}`);
  const clerkAppearance = themeMod.clerkSheetAppearance(allowSignUp);

  const AUTH_MOUNT_KEY = '__reaveClerkAuthMounted';
  const SSR_SYNC_KEY = 'reave-clerk-ssr-sync-once';
  let halfSessionAutoClearAttempted = false;

  function onLoginPage() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === '/admin/login' || path === '/sign-in';
  }

  function serverHasStaffSession() {
    return Boolean(document.body?.dataset?.userId?.trim());
  }

  function postSignInTarget() {
    const requested = new URLSearchParams(window.location.search).get('redirect_url') || '';
    if (requested.startsWith('/') && !requested.startsWith('//')) return requested;
    if (fallbackRedirectUrl.startsWith('/') && !fallbackRedirectUrl.startsWith('//')) {
      return fallbackRedirectUrl;
    }
    return '/admin/';
  }

  function ssrSyncAlreadyTried() {
    try {
      return sessionStorage.getItem(SSR_SYNC_KEY) === '1';
    } catch {
      return false;
    }
  }

  function markSsrSyncTried() {
    try {
      sessionStorage.setItem(SSR_SYNC_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function clearSsrSyncMark() {
    try {
      sessionStorage.removeItem(SSR_SYNC_KEY);
    } catch {
      /* ignore */
    }
  }

  function syncSessionViaHandshake() {
    if (serverHasStaffSession()) {
      clearSsrSyncMark();
      return false;
    }
    if (ssrSyncAlreadyTried()) return false;
    if (adminHandshakeInCooldown()) return false;
    markSsrSyncTried();
    const target = postSignInTarget();
    clerkDiag.event('syncSessionViaHandshake', 'navigate', { target });
    window.__markPwaRefreshCause?.('sign-in-sheet-clerk-handshake', { target });
    window.location.assign(clerkHandshakeUrl(target));
    return true;
  }

  function installHalfSessionRedirectGuard() {
    if (window.__reaveHalfSessionGuard) return;
    window.__reaveHalfSessionGuard = true;

    const shouldHandshakeInstead = (url) => {
      if (!window.Clerk?.user || serverHasStaffSession()) return false;
      try {
        const next = new URL(String(url), window.location.origin);
        if (next.origin !== window.location.origin) return false;
        if (!next.pathname.startsWith('/admin')) return false;
        return !next.pathname.startsWith('/admin/__clerk');
      } catch {
        return false;
      }
    };

    const proto = window.Location?.prototype;
    if (!proto) return;
    for (const method of ['assign', 'replace']) {
      const original = proto[method];
      if (typeof original !== 'function') continue;
      proto[method] = function patchedLocationNav(url) {
        if (shouldHandshakeInstead(url)) {
          if (syncSessionViaHandshake()) return;
          console.warn('[reave] blocked half-session admin redirect loop', url);
          showStuckSession();
          return;
        }
        return original.call(this, url);
      };
    }
  }

  function bindStuckSessionActions() {
    const syncBtn = document.getElementById('sign-in-stuck-sync');
    if (syncBtn && !syncBtn.dataset.bound) {
      syncBtn.dataset.bound = '1';
      syncBtn.addEventListener('click', () => {
        syncBtn.disabled = true;
        void (async () => {
          const target = postSignInTarget();
          if (await trySilentAdminSessionRefresh()) {
            markAdminSessionHealed();
            window.IosSheet?.close?.('sign-in-sheet');
            syncBtn.disabled = false;
            return;
          }
          if (await tryClerkHandshakeFetch({ returnTo: target, force: true })) {
            markAdminSessionHealed();
            window.IosSheet?.close?.('sign-in-sheet');
            syncBtn.disabled = false;
            return;
          }
          if (syncSessionViaHandshake()) return;
          syncBtn.disabled = false;
        })();
      });
    }
    const btn = document.getElementById('sign-in-stuck-sign-out');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => void clearHalfSessionAndShowSignIn(true));
    }
  }

  function showStuckSession() {
    const root = document.getElementById('sign-in-clerk-root');
    const stuck = document.getElementById('sign-in-session-stuck');
    if (root) root.hidden = true;
    if (stuck) stuck.hidden = false;
    window.IosSheet?.open('sign-in-sheet');
    bindStuckSessionActions();
  }

  async function clearHalfSessionAndShowSignIn(fromUser = false) {
    if (!fromUser && halfSessionAutoClearAttempted) {
      showStuckSession();
      return;
    }
    if (!fromUser) halfSessionAutoClearAttempted = true;

    const btn = document.getElementById('sign-in-stuck-sign-out');
    if (btn) btn.disabled = true;

    if (fromUser) {
      await performStaffSignOut();
      return;
    }

    clearSsrSyncMark();
    const root = document.getElementById('sign-in-clerk-root');
    const stuck = document.getElementById('sign-in-session-stuck');
    if (stuck) stuck.hidden = true;
    if (root) root.hidden = false;
    window[AUTH_MOUNT_KEY] = false;
    const signOutLanding = new URL(authPath, window.location.origin).href;
    try {
      await window.Clerk?.signOut?.({ redirectUrl: signOutLanding });
    } catch (err) {
      console.warn('[reave] half-session signOut failed', err);
      window.location.assign(authPath);
      return;
    }
    if (btn) btn.disabled = false;
    if (window.Clerk?.user) {
      showStuckSession();
      return;
    }
    mountClerkAuth();
  }

  function mountClerkAuth() {
    if (window[AUTH_MOUNT_KEY]) return;
    const clerk = window.Clerk;
    const root = document.getElementById('sign-in-clerk-root');
    if (!clerk?.loaded || !root || !clerk.mountSignIn) return;

    installHalfSessionRedirectGuard();

    if (clerk.user && serverHasStaffSession()) {
      window[AUTH_MOUNT_KEY] = true;
      clearSsrSyncMark();
      return;
    }

    if (clerk.user && !serverHasStaffSession()) {
      window[AUTH_MOUNT_KEY] = true;
      if (syncSessionViaHandshake()) return;
      if (onLoginPage()) {
        void clearHalfSessionAndShowSignIn();
        return;
      }
      showStuckSession();
      return;
    }

    window[AUTH_MOUNT_KEY] = true;
    const stuck = document.getElementById('sign-in-session-stuck');
    if (stuck) stuck.hidden = true;
    root.hidden = false;

    const signUpPath = `${authPath}?mode=sign-up`;
    const showSignUp =
      allowSignUp &&
      (startOnSignUp ||
        new URLSearchParams(window.location.search).get('mode') === 'sign-up' ||
        /^#\/?sign-up(\/|$)/i.test(window.location.hash));
    const titleEl = document.getElementById('sign-in-sheet-title');
    if (titleEl) titleEl.textContent = showSignUp ? 'Sign up' : 'Sign in';

    const signInTarget = postSignInTarget();
    const handshakeUrl = clerkHandshakeUrl(signInTarget);
    const mountOpts = {
      routing: 'hash',
      signInUrl: authPath,
      signUpUrl: allowSignUp ? signUpPath : authPath,
      fallbackRedirectUrl: signInTarget,
      forceRedirectUrl: handshakeUrl,
      appearance: clerkAppearance,
    };

    if (showSignUp && clerk.mountSignUp) {
      clerk.mountSignUp(root, mountOpts);
    } else {
      clerk.mountSignIn(root, mountOpts);
    }

    clerk.addListener?.((payload) => {
      const user = payload?.user;
      if (user && !serverHasStaffSession()) syncSessionViaHandshake();
    });
  }

  function onClerkReady() {
    if (onLoginPage() && !serverHasStaffSession() && !window.Clerk?.user) clearSsrSyncMark();
    mountClerkAuth();
    bindClerkSsrSessionSync({ autoOpenSignIn });
  }

  if (closeHref) {
    document.getElementById('sign-in-sheet')?.addEventListener('ios-sheet-close', () => {
      if (serverHasStaffSession()) return;
      const next = String(closeHref);
      if (next.startsWith('/') && !next.startsWith('//')) window.location.assign(next);
    });
  }

  if (autoOpenSignIn) {
    const openSheet = () => window.IosSheet?.open('sign-in-sheet');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', openSheet);
    } else {
      openSheet();
    }
  }

  window.addEventListener('reave-admin-session-stale', (ev) => {
    void (async () => {
      if (!window.Clerk?.user) return;
      const quiet = ev.detail?.quiet === true;
      clerkDiag.event('reave-admin-session-stale', quiet ? 'handler-quiet' : 'handler');
      const target = postSignInTarget();
      if (await trySilentAdminSessionRefresh()) {
        markAdminSessionHealed();
        window.IosSheet?.close?.('sign-in-sheet');
        return;
      }
      if (await tryClerkHandshakeFetch({ returnTo: target })) {
        markAdminSessionHealed();
        window.IosSheet?.close?.('sign-in-sheet');
        return;
      }
      if (quiet) return;
      showStuckSession();
    })();
  });

  window.addEventListener('clerk-loaded', onClerkReady, true);
  if (window.Clerk?.loaded) onClerkReady();
  else {
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.Clerk?.loaded) {
        clearInterval(timer);
        onClerkReady();
      } else if (Date.now() - started > 20000) {
        clearInterval(timer);
      }
    }, 50);
  }
}
