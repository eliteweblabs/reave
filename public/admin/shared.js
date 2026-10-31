/**
 * Shared admin client utilities — imported by os-map-loader.js and panel modules.
 */

import { escHtml } from '../shared/htmlEscape.js';
import { markPwaRefreshCause, pwaRefreshDebugEnabled } from '../shared/pwa-refresh-debug.js';
import { getAuthDebugLog } from '../shared/reave-debug-log.js';
import { createTracer, installDiagnosticFetchTrace } from '../shared/reave-diagnostic.js';
import { buildAdminNotice } from './admin-notice.js';

const authDiag = createTracer('auth');
const sessionDiag = createTracer('session');

export { escHtml };

const AUTH_SYNC_KEY = 'reave-clerk-ssr-sync';
/** One Clerk handshake navigation per tab when SSR session cookie goes stale. */
const ADMIN_API_RECOVER_KEY = 'reave-admin-401-recover';
/** Min gap between full-page handshake navigations (avoids refresh storms). */
const ADMIN_HANDSHAKE_AT_KEY = 'reave-admin-handshake-at';
const ADMIN_HANDSHAKE_PENDING_KEY = 'reave-admin-handshake-pending';
/** One fetch-based handshake attempt per stale stretch (avoids storms). */
const ADMIN_HANDSHAKE_FETCH_TRIED_KEY = 'reave-admin-handshake-fetch-tried';
const ADMIN_HANDSHAKE_COOLDOWN_MS = 120_000;
const ADMIN_SESSION_KEEPALIVE_MS = 4 * 60_000;

/**
 * Clerk handshake sets the HttpOnly __session cookie SSR needs. A plain reload on
 * `/` or `/sign-in` never runs it — only visiting this URL (or forceRedirectUrl).
 */
export function clerkHandshakeUrl(redirectPath, origin = window.location.origin) {
  let path = redirectPath;
  const normalized = String(path).replace(/\/$/, '') || '/';
  if (normalized === '/card' || normalized === '/nfc') path = '/admin/';
  const redirect = new URL(path, origin).toString();
  const proxyBase = String(path).startsWith('/admin') ? '/admin/__clerk' : '/__clerk';
  return `${proxyBase}/v1/client/handshake?redirect_url=${encodeURIComponent(redirect)}`;
}

/** Strip sign-in redirect params so return URLs cannot loop on auth=sign-in. */
export function cleanAdminReturnUrl(pathname, search = '') {
  try {
    const url = new URL(pathname + search, window.location.origin);
    url.searchParams.delete('auth');
    url.searchParams.delete('returnTo');
    return url.pathname + url.search + url.hash;
  } catch {
    return '/admin/';
  }
}


function serverHasStaffSession() {
  return Boolean(document.body?.dataset?.userId?.trim());
}

/** SSR userId marker survives after __session expires — drop it on 401. */
export function markAdminServerSessionStale() {
  try {
    if (document.body?.dataset?.userId) delete document.body.dataset.userId;
  } catch {
    /* ignore */
  }
}

/** Clerk JS signed in but SSR/API cookie missing — common after __session TTL. */
function clerkHalfSessionOnClient() {
  return Boolean(window.Clerk?.user?.id) && !serverHasStaffSession();
}

/** After a successful badge probe, restore the SSR marker cleared on 401. */
function restoreAdminStaffUserIdFromClerk() {
  const id = window.Clerk?.user?.id?.trim();
  if (!id || serverHasStaffSession()) return;
  try {
    if (document.body) document.body.dataset.userId = id;
  } catch {
    /* ignore */
  }
}

function handshakeFetchRecentlyTried() {
  try {
    const raw = sessionStorage.getItem(ADMIN_HANDSHAKE_FETCH_TRIED_KEY);
    if (!raw || raw === '1') return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < ADMIN_HANDSHAKE_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markHandshakeFetchAttempt() {
  try {
    sessionStorage.setItem(ADMIN_HANDSHAKE_FETCH_TRIED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

const SSR_SYNC_ONCE_KEY = 'reave-clerk-ssr-sync-once';

/** Post sign-out landing — never `/` from admin (login-template `/` bounces to /admin/). */
export function staffSignOutLandingPath() {
  if (typeof window === 'undefined') return '/admin/login';
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return '/admin/login';
  const root = path.replace(/\/$/, '') || '/';
  if (root === '/') return '/';
  return '/sign-in';
}

function waitForClerkLoaded(timeoutMs = 20000) {
  if (window.Clerk?.loaded) return Promise.resolve(window.Clerk);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const onReady = () => {
      window.removeEventListener('clerk-loaded', onReady, true);
      resolve(window.Clerk);
    };
    window.addEventListener('clerk-loaded', onReady, true);
    const poll = setInterval(() => {
      if (window.Clerk?.loaded) {
        clearInterval(poll);
        onReady();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        window.removeEventListener('clerk-loaded', onReady, true);
        reject(new Error('Clerk load timeout'));
      }
    }, 50);
  });
}

function clearStaffSignOutClientState() {
  markAdminServerSessionStale();
  staleRecoverySheetOpen = false;
  dismissAdminSessionSyncBanner();
  pauseAdminAuthPolls(5 * 60_000);
  clearAdminSessionRecoverMark();
  try {
    sessionStorage.removeItem(AUTH_SYNC_KEY);
    sessionStorage.removeItem(SSR_SYNC_ONCE_KEY);
    sessionStorage.removeItem(ADMIN_HANDSHAKE_PENDING_KEY);
    sessionStorage.removeItem(ADMIN_HANDSHAKE_AT_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.__reaveClerkAuthMounted = false;
  } catch {
    /* ignore */
  }
}

/**
 * End the Clerk session and land on a login page without the login-template `/` bounce.
 * Used by account menu, marketing menu, and /sign-out.
 */
export async function performStaffSignOut(opts = {}) {
  clearStaffSignOutClientState();
  markPwaRefreshCause('staff-sign-out', { dedicated: opts.fromDedicatedPage === true });

  const landingPath = staffSignOutLandingPath();
  const landingUrl = new URL(landingPath, window.location.origin).toString();

  let clerk;
  try {
    clerk = await waitForClerkLoaded(opts.fromDedicatedPage ? 25000 : 15000);
  } catch {
    clerk = window.Clerk;
  }

  if (!clerk?.signOut) {
    window.location.assign('/sign-out');
    return;
  }

  try {
    await clerk.signOut({ redirectUrl: landingUrl });
  } catch (err) {
    authLog().warn('clerk.signOut failed', { err: String(err?.message || err) });
    window.location.assign('/sign-out');
    return;
  }

  if (window.Clerk?.user) {
    window.location.assign('/sign-out');
    return;
  }
  if (window.location.pathname.replace(/\/$/, '') !== landingPath.replace(/\/$/, '')) {
    window.location.assign(landingUrl);
  }
}

function clearAdminSessionRecoverMark() {
  try {
    sessionStorage.removeItem(ADMIN_API_RECOVER_KEY);
    sessionStorage.removeItem(ADMIN_HANDSHAKE_FETCH_TRIED_KEY);
  } catch {
    /* ignore */
  }
}

function recordHandshakeNavigation() {
  try {
    sessionStorage.setItem(ADMIN_HANDSHAKE_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** True when a full-page Clerk handshake ran recently — blocks duplicate navigations. */
export function adminHandshakeInCooldown() {
  try {
    const at = Number(sessionStorage.getItem(ADMIN_HANDSHAKE_AT_KEY) || 0);
    return Number.isFinite(at) && Date.now() - at < ADMIN_HANDSHAKE_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function scheduleDeferredHandshake(returnTo) {
  try {
    sessionStorage.setItem(ADMIN_HANDSHAKE_PENDING_KEY, returnTo);
  } catch {
    /* ignore */
  }
}

/**
 * Run a deferred handshake after the app returns to the foreground.
 * Tries silent token + __session probe first — full navigation only if that fails.
 */
async function flushDeferredAdminHandshakeImpl() {
  if (adminHandshakeInCooldown()) return false;
  let pending = '';
  try {
    pending = sessionStorage.getItem(ADMIN_HANDSHAKE_PENDING_KEY) || '';
  } catch {
    /* ignore */
  }
  if (!pending) return false;

  if (await trySilentAdminSessionRefresh()) {
    try {
      sessionStorage.removeItem(ADMIN_HANDSHAKE_PENDING_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }

  try {
    sessionStorage.removeItem(ADMIN_HANDSHAKE_PENDING_KEY);
  } catch {
    /* ignore */
  }
  markPwaRefreshCause('deferred-clerk-handshake-on-foreground', { returnTo: pending });
  openAdminStaleSessionRecovery({ returnTo: pending, source: 'deferred-foreground' });
  return false;
}

export const flushDeferredAdminHandshake = authDiag.wrapAsync(
  'flushDeferredAdminHandshake',
  flushDeferredAdminHandshakeImpl,
);

/**
 * Refresh Clerk client token and probe an authenticated API — often restores __session
 * without a full-page handshake (common when the HttpOnly cookie lagged behind Clerk JS).
 */
function nativeAdminFetch() {
  return window.__reaveNativeFetch || window.fetch.bind(window);
}

async function probeAdminSessionCookie() {
  const session = window.Clerk?.session;
  if (!session?.getToken) return false;
  await session.getToken({ skipCache: true });
  const probe = await nativeAdminFetch()('/api/admin/badges', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    __reaveAuthProbe: true,
  });
  if (!probe.ok) return false;
  noteAdminNetworkSuccess();
  restoreAdminStaffUserIdFromClerk();
  clearAdminSessionRecoverMark();
  try {
    sessionStorage.removeItem(ADMIN_HANDSHAKE_PENDING_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Same-origin Clerk handshake via fetch — sets HttpOnly __session without unloading the SPA.
 */
async function tryClerkHandshakeFetchImpl(opts = {}) {
  if (!window.Clerk?.user) return false;
  const force = opts.force === true;
  if (!force && adminHandshakeInCooldown()) return false;

  const returnTo =
    opts.returnTo || cleanAdminReturnUrl(window.location.pathname, window.location.search);

  if (!force && handshakeFetchRecentlyTried()) return false;
  markHandshakeFetchAttempt();

  authLog().event('clerk handshake fetch (in-place)', { returnTo, force });
  markPwaRefreshCause('clerk-handshake-fetch', { returnTo, force });

  try {
    const url = clerkHandshakeUrl(returnTo);
    await nativeAdminFetch()(url, {
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
      headers: { Accept: 'text/html,application/xhtml+xml,application/json' },
      __reaveAuthProbe: true,
    });
  } catch (e) {
    authLog().warn('clerk handshake fetch failed', { message: e?.message || String(e) });
    return false;
  }

  try {
    if (await probeAdminSessionCookie()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export const tryClerkHandshakeFetch = authDiag.wrapAsync(
  'tryClerkHandshakeFetch',
  tryClerkHandshakeFetchImpl,
);

async function trySilentAdminSessionRefreshImpl() {
  try {
    if (await probeAdminSessionCookie()) {
      resumeAdminAuthPolls();
      staleRecoverySheetOpen = false;
      return true;
    }
  } catch {
    /* ignore */
  }
  if (!window.Clerk?.user) return false;
  const ok = await tryClerkHandshakeFetchImpl();
  if (ok) {
    resumeAdminAuthPolls();
    staleRecoverySheetOpen = false;
  }
  return ok;
}

/** One silent refresh / badge probe at a time — avoids 401 storms from parallel polls. */
function coalesceAsync(fn) {
  /** @type {Promise<unknown> | null} */
  let inFlight = null;
  return (...args) => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve(fn(...args)).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

const trySilentAdminSessionRefreshCoalesced = coalesceAsync(
  authDiag.wrapAsync('trySilentAdminSessionRefresh', trySilentAdminSessionRefreshImpl),
);

export function trySilentAdminSessionRefresh() {
  return trySilentAdminSessionRefreshCoalesced();
}

/**
 * Clerk JS can still show a user while HttpOnly __session is gone (expired handshake JWT).
 * Navigate through /admin/__clerk once before opening the sign-in sheet.
 */
function authLog() {
  return getAuthDebugLog();
}

/** @deprecated Legacy entry — never full-page navigates; kept for cached clients. */
function recoverAdminSessionOn401Impl(opts = {}) {
  const force = opts.force === true;
  const hasClerkUser = Boolean(window.Clerk?.user);
  const onAdmin =
    window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  if (!onAdmin && !hasClerkUser) return false;

  const returnTo =
    opts.returnTo || cleanAdminReturnUrl(window.location.pathname, window.location.search);

  authLog().warn('recoverAdminSessionOn401 — in-place sync only (no location.assign)', {
    force,
    returnTo,
    documentHidden: document.hidden,
  });

  if (!force && document.hidden) {
    scheduleDeferredHandshake(returnTo);
    return false;
  }

  markAdminServerSessionStale();
  void (async () => {
    if (await trySilentAdminSessionRefresh()) return;
    if (await tryClerkHandshakeFetchImpl({ returnTo, force })) return;
    openAdminStaleSessionRecovery({ returnTo, source: 'recover-legacy', force });
  })();
  return false;
}

export const recoverAdminSessionOn401 = authDiag.wrapSync(
  'recoverAdminSessionOn401',
  recoverAdminSessionOn401Impl,
);

/** Return when __session healed — caller should retry the 401 request once. */
export const ADMIN_AUTH_SILENT_RETRY = 'admin-auth-silent-retry';

/**
 * Clerk still has a user but SSR/API session is gone — open in-app recovery
 * (handshake or stuck-session sheet). Never bounce to /admin/login (PWA loop).
 */
let staleRecoverySheetOpen = false;

function dismissAdminSessionSyncBanner() {
  const root = document.getElementById('admin-setup-alerts');
  if (!root?.dataset.sessionSyncBanner) return;
  root.hidden = true;
  root.replaceChildren();
  delete root.dataset.sessionSyncBanner;
  try {
    document.documentElement.style.setProperty('--setup-alert-h', '0px');
  } catch {
    /* ignore */
  }
}

async function runAdminSessionSyncFromBanner(btn) {
  if (btn) btn.disabled = true;
  try {
    if (await trySilentAdminSessionRefresh()) {
      markAdminSessionHealed();
      dismissAdminSessionSyncBanner();
      return;
    }
    const returnTo = cleanAdminReturnUrl(window.location.pathname, window.location.search);
    if (await tryClerkHandshakeFetch({ returnTo, force: true })) {
      markAdminSessionHealed();
      dismissAdminSessionSyncBanner();
      return;
    }
    staleRecoverySheetOpen = true;
    window.IosSheet?.open?.('sign-in-sheet');
    try {
      window.dispatchEvent(
        new CustomEvent('reave-admin-session-stale', {
          detail: { source: 'banner-sync', returnTo, quiet: false },
        }),
      );
    } catch {
      /* ignore */
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showAdminSessionSyncBanner() {
  const root = document.getElementById('admin-setup-alerts');
  if (!root || root.dataset.sessionSyncBanner === '1') return;
  root.dataset.sessionSyncBanner = '1';
  root.hidden = false;
  root.replaceChildren();
  const notice = buildAdminNotice({
    tone: 'alert',
    copyHtml:
      '<strong>Session needs sync</strong><p>Clerk is signed in but the admin cookie expired. Background updates are paused.</p>',
    actions: [
      {
        label: 'Sync session',
        primary: true,
        onClick: (btn) => void runAdminSessionSyncFromBanner(btn),
      },
    ],
    dismissLabel: 'Dismiss session sync alert',
    onDismiss: () => dismissAdminSessionSyncBanner(),
  });
  root.appendChild(notice.root);
  try {
    const h = Math.ceil(root.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--setup-alert-h', `${h}px`);
  } catch {
    /* ignore */
  }
}

function openAdminStaleSessionRecoveryImpl(detail = {}) {
  markAdminServerSessionStale();
  const quietApi401 = detail.source === 'api-401';
  if (quietApi401) {
    authLog().info('stale session — header banner (no sheet auto-open)', detail);
    showAdminSessionSyncBanner();
    try {
      window.dispatchEvent(
        new CustomEvent('reave-admin-session-stale', {
          detail: { ...detail, quiet: true },
        }),
      );
    } catch {
      /* ignore */
    }
    return true;
  }

  const sheet = document.getElementById('sign-in-sheet');
  if (!sheet || !window.IosSheet?.open) {
    authLog().warn('stale session recovery unavailable — no sign-in sheet', detail);
    showAdminSessionSyncBanner();
    return false;
  }
  if (staleRecoverySheetOpen) {
    authLog().info('stale-session sheet already open — skip duplicate', detail);
    return true;
  }
  staleRecoverySheetOpen = true;
  authLog().info('opening stale-session recovery sheet', {
    hadClerkUser: Boolean(window.Clerk?.user),
    ...detail,
  });
  markPwaRefreshCause('stale-session-sheet-open', detail);
  window.IosSheet.open('sign-in-sheet');
  try {
    window.dispatchEvent(
      new CustomEvent('reave-admin-session-stale', { detail: { quiet: false, ...detail } }),
    );
  } catch {
    /* ignore */
  }
  return true;
}

export const openAdminStaleSessionRecovery = authDiag.wrapSync(
  'openAdminStaleSessionRecovery',
  openAdminStaleSessionRecoveryImpl,
);

/**
 * Shared 401 handler for adminFetch and the global /api fetch guard.
 * Clerk JS can still have a user while SSR __session is stale — avoid sending
 * those cases to /admin/login (instant bounce, feels like a random refresh).
 */
async function handleAdminUnauthorizedResponseImpl() {
  authLog().warn('admin API 401 — starting recovery', {
    path: location.pathname + location.search,
    hadClerkUser: Boolean(window.Clerk?.user),
    serverUserId: Boolean(document.body?.dataset?.userId),
    handshakeCooldown: adminHandshakeInCooldown(),
  });

  if (await trySilentAdminSessionRefresh()) {
    authLog().info('silent session refresh succeeded after 401');
    clearAdminSessionRecoverMark();
    return ADMIN_AUTH_SILENT_RETRY;
  }

  const hasClerkUser = Boolean(window.Clerk?.user);
  if (hasClerkUser) {
    pauseAdminAuthPolls();
    authLog().warn('silent session refresh failed — no full-page handshake from API 401', {
      documentHidden: document.hidden,
    });
    const returnTo = cleanAdminReturnUrl(window.location.pathname, window.location.search);
    if (document.hidden) {
      scheduleDeferredHandshake(returnTo);
      authLog().info('401 recover deferred — document hidden (poll again on foreground)');
    } else if (
      openAdminStaleSessionRecovery({ after: 'silent-failed', returnTo, source: 'api-401' })
    ) {
      /* in-app sheet; section polls retry on next tick */
    } else {
      authLog().error('Clerk user present but stale-session sheet unavailable', { returnTo });
    }
    throw new Error('Session expired');
  }

  const signInSheet = document.getElementById('sign-in-sheet');
  if (signInSheet && window.IosSheet?.open) {
    authLog().info('opening sign-in sheet after 401 (signed out)');
    window.IosSheet.open('sign-in-sheet');
    throw new Error('Session expired');
  }

  const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/sign-in';
  authLog().error('redirecting to login after 401 (signed out, no sheet)', {
    loginPath,
    hadSignInSheet: Boolean(signInSheet),
    iosSheetReady: Boolean(window.IosSheet?.open),
  });
  markPwaRefreshCause('session-expired-login-redirect', {
    loginPath,
    hadClerkUser: false,
    hadSignInSheet: Boolean(signInSheet),
    iosSheetReady: Boolean(window.IosSheet?.open),
  });
  window.location.assign(loginPath);
  throw new Error('Session expired');
}

const handleAdminUnauthorizedResponseCoalesced = coalesceAsync(
  authDiag.wrapAsync('handleAdminUnauthorizedResponse', handleAdminUnauthorizedResponseImpl),
);

export function handleAdminUnauthorizedResponse() {
  return handleAdminUnauthorizedResponseCoalesced();
}

/**
 * Raw fetch() in os-map-loader bypasses adminFetch — wrap once so 401s recover the same way.
 */
export function installAdminApiFetchGuard() {
  if (typeof window === 'undefined' || window.__reaveAdminFetchGuard) return;
  window.__reaveAdminFetchGuard = true;

  if (serverHasStaffSession()) clearAdminSessionRecoverMark();

  const native = window.fetch.bind(window);
  window.__reaveNativeFetch = native;
  window.fetch = async function reaveAdminFetch(input, init) {
    const retried = init?.__reaveRetried401 === true;
    const res = await native(input, init);
    if (init?.__reaveAuthProbe) return res;
    if (res.status !== 401) return res;

    let path = '';
    try {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.pathname
            : input instanceof Request
              ? input.url
              : String(input?.url || '');
      path = raw.startsWith('http') ? new URL(raw).pathname : raw.split('?')[0] || '';
    } catch {
      return res;
    }
    if (!path.startsWith('/api/') || path.includes('__clerk')) return res;

    if (!retried && (await trySilentAdminSessionRefresh())) {
      const retryInit = { ...(init || {}), __reaveRetried401: true };
      return native(input, retryInit);
    }

    const authOutcome = await handleAdminUnauthorizedResponse();
    if (authOutcome === ADMIN_AUTH_SILENT_RETRY) {
      const retryInit = { ...(init || {}), __reaveRetried401: true };
      return native(input, retryInit);
    }
    return res;
  };

  installDiagnosticFetchTrace();
}

function installAdminSessionKeepalive() {
  if (typeof window === 'undefined' || window.__reaveAdminSessionKeepalive) return;
  window.__reaveAdminSessionKeepalive = true;

  let timer = null;
  let wasHidden = document.hidden;

  /** Background cookie refresh only — must never navigate (see trySilentAdminSessionRefresh). */
  const refreshQuietly = async () => {
    if (document.hidden || !window.Clerk?.user) return;
    await sessionDiag.runAsync('keepalive.refreshQuietly', () => trySilentAdminSessionRefresh());
  };

  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    if (wasHidden && !hidden) {
      void sessionDiag.runAsync('visibility.foreground', async () => {
        await flushDeferredAdminHandshake();
        await trySilentAdminSessionRefresh();
      });
    }
    wasHidden = hidden;
  });

  const tickKeepalive = () => {
    if (pwaRefreshDebugEnabled()) {
      const mode = clerkHalfSessionOnClient() ? 'half-session heal' : 'routine refresh';
      console.info(`[pwa-refresh-debug] session keepalive (${mode})`);
    }
    void refreshQuietly();
  };

  timer = setInterval(tickKeepalive, ADMIN_SESSION_KEEPALIVE_MS);

  /** Retry cookie sync sooner while Clerk is signed in but SSR __session is gone. */
  setInterval(() => {
    if (document.hidden || !clerkHalfSessionOnClient()) return;
    void refreshQuietly();
  }, ADMIN_HANDSHAKE_COOLDOWN_MS);
}

/**
 * Never speculative-reload for cookie lag.
 * Combined with SignIn fallbackRedirectUrl="/" that caused refresh loops.
 */
export function syncSsrAfterClerkSignIn() {
  if (serverHasStaffSession()) {
    try {
      sessionStorage.removeItem(AUTH_SYNC_KEY);
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Open sign-in sheet when asked — never navigate/reload for cookie lag. */
export function bindClerkSsrSessionSync(opts = {}) {
  const { autoOpenSignIn = false } = opts;

  function run() {
    if (serverHasStaffSession()) clearAdminSessionRecoverMark();
    if (autoOpenSignIn && !serverHasStaffSession()) {
      window.IosSheet?.open('sign-in-sheet');
    }
  }

  window.addEventListener('clerk-loaded', run, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}

/** Dashboard fetch — always send session cookies; re-auth on 401. */
let adminDegradedUntil = 0;
let adminFailStreak = 0;
/** Wait for Clerk + silent cookie sync before badge/chat/email polls (avoids boot 401 burst). */
let adminBackgroundPollsArmed = false;
let adminAuthPollPausedUntil = 0;

/** Live SSR staff marker — os-map-loader `userId` const is frozen at import time. */
export function adminStaffUserId() {
  return document.body?.dataset?.userId?.trim() || '';
}

function pauseAdminAuthPolls(ms = 60_000) {
  adminAuthPollPausedUntil = Math.max(adminAuthPollPausedUntil, Date.now() + ms);
}

function resumeAdminAuthPolls() {
  adminAuthPollPausedUntil = 0;
}

async function armAdminBackgroundPollsImpl() {
  if (adminBackgroundPollsArmed) return;
  if (!serverHasStaffSession()) {
    adminBackgroundPollsArmed = true;
    return;
  }
  await trySilentAdminSessionRefresh();
  adminBackgroundPollsArmed = true;
  try {
    window.dispatchEvent(new CustomEvent('reave-admin-background-polls-armed'));
  } catch {
    /* ignore */
  }
}

function installAdminBackgroundPollArming() {
  if (typeof window === 'undefined' || window.__reaveAdminPollArming) return;
  window.__reaveAdminPollArming = true;
  if (!serverHasStaffSession()) {
    adminBackgroundPollsArmed = true;
    return;
  }
  const arm = () => void armAdminBackgroundPollsImpl();
  if (window.Clerk?.loaded) arm();
  else window.addEventListener('clerk-loaded', arm, { once: true });
}

/** Back off background polls while redeploying, session healing, or before Clerk is ready. */
export function shouldSkipAdminBackgroundPoll() {
  if (staleRecoverySheetOpen) return true;
  if (serverHasStaffSession() && !adminBackgroundPollsArmed) return true;
  if (Date.now() < adminAuthPollPausedUntil) return true;
  return Date.now() < adminDegradedUntil;
}

/** Call after in-app session sync (SignIn sheet) so background polls can resume. */
export function markAdminSessionHealed() {
  staleRecoverySheetOpen = false;
  restoreAdminStaffUserIdFromClerk();
  dismissAdminSessionSyncBanner();
  resumeAdminAuthPolls();
  clearAdminSessionRecoverMark();
  noteAdminNetworkSuccess();
  try {
    window.dispatchEvent(new CustomEvent('reave-admin-background-polls-armed'));
  } catch {
    /* ignore */
  }
}

/** Back off adminFetch while the server is redeploying or unreachable. */
export function shouldSkipAdminPoll() {
  return Date.now() < adminDegradedUntil;
}

export function noteAdminNetworkFailure(err) {
  if (err?.message === 'Session expired') return;
  adminFailStreak = Math.min(adminFailStreak + 1, 8);
  const ms = Math.min(120_000, 1500 * 2 ** (adminFailStreak - 1));
  adminDegradedUntil = Date.now() + ms;
}

export function noteAdminNetworkSuccess() {
  adminFailStreak = 0;
  adminDegradedUntil = 0;
}

if (typeof window !== 'undefined') {
  window.__reaveShouldSkipAdminPoll = shouldSkipAdminPoll;
  window.__reaveShouldSkipAdminBackgroundPoll = shouldSkipAdminBackgroundPoll;
  window.__reaveNoteAdminNetworkFailure = noteAdminNetworkFailure;
  window.__reaveNoteAdminNetworkSuccess = noteAdminNetworkSuccess;
  installAdminApiFetchGuard();
  installAdminSessionKeepalive();
  installAdminBackgroundPollArming();
}

export async function adminFetch(url, opts = {}) {
  if (shouldSkipAdminPoll()) {
    throw new Error('Admin offline — retrying shortly');
  }
  const retried = opts._retried401 === true;
  let res;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...opts,
      headers: {
        Accept: 'application/json',
        ...(opts.headers || {}),
      },
    });
  } catch (e) {
    noteAdminNetworkFailure(e);
    throw e;
  }
  if (res.ok) {
    noteAdminNetworkSuccess();
    clearAdminSessionRecoverMark();
  }
  if (res.status === 401) {
    if (!retried && (await trySilentAdminSessionRefresh())) {
      return adminFetch(url, { ...opts, _retried401: true });
    }
    const authOutcome = await handleAdminUnauthorizedResponse();
    if (authOutcome === ADMIN_AUTH_SILENT_RETRY) {
      return adminFetch(url, { ...opts, _retried401: true });
    }
  }
  return res;
}

/** Best-effort error string from admin API JSON (Resend/Railway sometimes use `message`). */
export function adminApiErrorMessage(data, status) {
  if (data && typeof data === 'object') {
    const err = data.error ?? data.message;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (Array.isArray(err) && err.length) {
      const parts = err
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'message' in item) return String(item.message);
          return '';
        })
        .filter(Boolean);
      if (parts.length) return parts.join('; ');
    }
  }
  return `HTTP ${status}`;
}

/** Parse admin API JSON without Safari's opaque "expected pattern" failures. */
export async function readAdminJson(res, label = 'response') {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`${label}: empty response (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.trim().slice(0, 80).replace(/\s+/g, ' ');
    if (snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html') || snippet.startsWith('<')) {
      throw new Error(`${label}: server returned HTML (HTTP ${res.status})`);
    }
    throw new Error(`${label}: invalid JSON (HTTP ${res.status})`);
  }
}

export async function readApiJson(res) {
  const text = await res.text();
  if (res.ok && !text.trim()) {
    throw new Error(`Empty response (HTTP ${res.status})`);
  }
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? 'Invalid server response' : `HTTP ${res.status}`);
    }
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Shimmer skeleton — `kind`: 'list' | 'dashboard-home' | 'dashboard'. */
const SK_LIST_WIDTHS = [
  [72, 58],
  [84, 46],
  [64, 52],
  [78, 44],
  [68, 50],
  [80, 42],
  [74, 48],
  [66, 54],
];

function isMobileListPanelViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
}

function listItemSkeletonRows(count = SK_LIST_WIDTHS.length) {
  return SK_LIST_WIDTHS.slice(0, count)
    .map(([titleW, subW], i) => {
      const sub =
        i % 3 !== 1
          ? `<span class="sk-bone sk-list-sub" style="width:${subW}%"></span>`
          : '';
      return (
        `<div class="ch-list-item sk-list-item">` +
        `<div class="sk-bone sk-list-icon"></div>` +
        `<span class="ch-list-content">` +
        `<span class="ch-item-row">` +
        `<span class="sk-bone sk-list-title" style="width:${titleW}%"></span>` +
        `<span class="sk-bone sk-list-date"></span>` +
        `</span>` +
        sub +
        `</span></div>`
      );
    })
    .join('');
}

/** Full sidebar list shell — search, filter tabs, and card rows (mobile footer-nav tabs). */
export function listPanelSkeletonHtml(label = 'Loading…') {
  const safeLabel = escHtml(label);
  const filters = Array(5)
    .fill(`<span class="sk-bone sk-list-filter"></span>`)
    .join('');
  return (
    `<div class="ch-sidebar sk-list-panel" role="status" aria-live="polite" aria-busy="true">` +
    `<span class="sk-sr">${safeLabel}</span>` +
    `<div class="panel-list-subheader panel-list-subheader--search-only panel-list-subheader--stacked">` +
    /* Solid bar — avoid hollow .control-field shell (tall empty band under the logo). */
    `<div class="sk-bone sk-list-search" aria-hidden="true"></div>` +
    `<div class="em-filter-tabs sk-list-filters">${filters}</div>` +
    `</div>` +
    `<div class="ch-list">${listItemSkeletonRows(8)}</div>` +
    `</div>`
  );
}

export function skeletonHtml(kind = 'list', label = 'Loading…') {
  const safeLabel = escHtml(label);
  if (kind === 'dashboard-home' || kind === 'home') {
    const alerts = `<div class="sk-bone sk-home-alert"></div>`.repeat(2);
    const events = Array(3)
      .fill(
        `<div class="sk-home-event">` +
          `<div class="sk-bone sk-home-event-time"></div>` +
          `<div class="sk-home-event-body">` +
            `<div class="sk-bone sk-home-event-line"></div>` +
            `<div class="sk-bone sk-home-event-line sk-home-event-line--short"></div>` +
          `</div>` +
        `</div>`,
      )
      .join('');
    const stats = `<div class="sk-bone sk-home-stat"></div>`.repeat(8);
    const uptime = `<div class="sk-bone sk-home-uptime-tile"></div>`.repeat(14);
    const inboxRows = Array(5)
      .fill(
        `<div class="sk-home-inbox-row">` +
          `<div class="sk-bone sk-home-inbox-subject"></div>` +
          `<div class="sk-bone sk-home-inbox-meta"></div>` +
        `</div>`,
      )
      .join('');
    return (
      `<div class="home-dashboard-scroll">` +
        `<div class="sk-home" role="status" aria-live="polite" aria-busy="true">` +
          `<span class="sk-sr">${safeLabel}</span>` +
          `<div class="sk-home-briefing">` +
            `<div class="sk-bone sk-home-briefing-title"></div>` +
            `<div class="sk-bone sk-home-briefing-date"></div>` +
            `<div class="sk-bone sk-home-briefing-line"></div>` +
            `<div class="sk-bone sk-home-briefing-line"></div>` +
          `</div>` +
          `<div class="sk-home-alerts">${alerts}</div>` +
          `<section class="sk-home-section sk-home-today">` +
            `<div class="sk-home-today-head">` +
              `<div class="sk-bone sk-home-pills"></div>` +
              `<div class="sk-bone sk-home-schedule-btn"></div>` +
            `</div>` +
            `<div class="sk-home-events">${events}</div>` +
          `</section>` +
          `<div class="sk-home-stats">${stats}</div>` +
          `<div class="sk-home-uptime">${uptime}</div>` +
          `<section class="sk-home-section sk-home-inbox">` +
            `<div class="sk-bone sk-home-panel-title"></div>` +
            `<div class="sk-home-inbox-body">${inboxRows}</div>` +
          `</section>` +
        `</div>` +
      `</div>`
    );
  }
  if (kind === 'dashboard') {
    return (
      `<div class="sk-dashboard" role="status" aria-live="polite" aria-busy="true">` +
      `<span class="sk-sr">${safeLabel}</span>` +
      `<div class="sk-stat-grid">` +
      `<div class="sk-bone sk-stat"></div>`.repeat(4) +
      `</div>` +
      `<div class="sk-bone sk-card"></div>` +
      `<div class="sk-bone sk-card sk-card--short"></div>` +
      `</div>`
    );
  }
  return (
    `<div class="sk-list" role="status" aria-live="polite" aria-busy="true">` +
    `<span class="sk-sr">${safeLabel}</span>` +
    listItemSkeletonRows() +
    `</div>`
  );
}

/** True when the panel is empty or already showing a skeleton (safe to swap in a new one). */
export function panelNeedsSkeleton(root, contentSelector) {
  if (!root) return false;
  if (root.querySelector('.sk-list, .sk-list-panel, .sk-dashboard, .sk-home')) return false;
  if (contentSelector && root.querySelector(contentSelector)) return false;
  return true;
}

/** Insert skeleton markup only for a first-load / empty panel — skips quiet refreshes. */
export function mountPanelSkeleton(root, kind, label, opts = {}) {
  if (!root || opts.quiet) return;
  if (!panelNeedsSkeleton(root, opts.contentSelector)) return;
  const html =
    kind === 'list' && isMobileListPanelViewport()
      ? listPanelSkeletonHtml(label)
      : skeletonHtml(kind, label);
  root.innerHTML = typeof opts.wrapper === 'function' ? opts.wrapper(html) : html;
}

/** Company icon used in the account menu (same fallback chain as Header.astro). */
export function companyStaffAvatarUrl() {
  return window.__companyStaffAvatarUrl || '/api/branding/icon?size=192&transparent=1';
}

const GENERIC_SENDER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'msn.com',
  'ymail.com',
]);

const TRANSACTIONAL_EMAIL_SUBDOMAINS = new Set([
  'email',
  'mail',
  'alerts',
  'notifications',
  'notify',
  'messaging',
  'e',
  'm',
  'noreply',
  'no-reply',
]);

function parseSenderEmailForIcon(from) {
  const raw = String(from || '').trim();
  const angled = raw.match(/<([^>]+)>/);
  if (angled?.[1]) return angled[1].trim();
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw;
  return '';
}

/** Registrable brand domain for favicon lookup — null for personal inboxes or unparseable senders. */
export function brandDomainFromSenderEmail(from) {
  const email = parseSenderEmailForIcon(from);
  const match = email.match(/@([^@\s]+)/);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  if (domain.endsWith('bsky.social') || domain === 'bsky.app') return 'bsky.app';
  if (GENERIC_SENDER_EMAIL_DOMAINS.has(domain)) return null;
  const parts = domain.split('.');
  if (parts.length >= 3 && TRANSACTIONAL_EMAIL_SUBDOMAINS.has(parts[0])) {
    return parts.slice(1).join('.');
  }
  return domain;
}

const SIMPLE_ICONS_CDN = (slug) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${slug}.svg`;

/** High-signal senders — Simple Icons before Google favicon (clearer at inbox row size). */
const KNOWN_SENDER_BRAND_DOMAINS = {
  'apple.com': 'apple',
  'amazon.com': 'amazon',
  'google.com': 'google',
  'microsoft.com': 'microsoft',
  'paypal.com': 'paypal',
  'stripe.com': 'stripe',
  'linkedin.com': 'linkedin',
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'meta.com': 'meta',
};

/** Brands inferred from notification copy when sender favicon / CRM icon are unavailable. */
const NOTIFICATION_CONTENT_BRANDS = [
  {
    slug: 'bluesky',
    faviconDomain: 'bsky.app',
    matches: (text) => /\bbluesky\b/i.test(text) || /\bbsky\.(?:social|app)\b/i.test(text),
  },
  {
    slug: 'linkedin',
    faviconDomain: 'linkedin.com',
    matches: (text) => /\blinkedin\b/i.test(text),
  },
  {
    slug: 'instagram',
    faviconDomain: 'instagram.com',
    matches: (text) => /\binstagram\b/i.test(text),
  },
  {
    slug: 'x',
    faviconDomain: 'x.com',
    matches: (text) => /\b(?:twitter|x\.com)\b/i.test(text),
  },
];

function notificationContentBlob(item) {
  return [item.title, item.detail, item.subject, item.from].filter(Boolean).join(' ');
}

function brandFromNotificationContent(item) {
  const blob = notificationContentBlob(item);
  if (!blob) return null;
  return NOTIFICATION_CONTENT_BRANDS.find((brand) => brand.matches(blob)) || null;
}

function contentBrandIconUrl(item) {
  const brand = brandFromNotificationContent(item);
  if (!brand) return null;
  if (brand.faviconDomain) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(brand.faviconDomain)}&sz=64`;
  }
  return SIMPLE_ICONS_CDN(brand.slug);
}

/** One or two initials from a sender address (personal inboxes). */
export function senderInitialsFromEmail(from) {
  const email = parseSenderEmailForIcon(from);
  if (!email) return '?';
  const local = (email.split('@')[0] || '').trim();
  const parts = local.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

/** Brand or favicon URL for a sender address — null when no brand domain can be inferred. */
export function senderFaviconUrl(from, size = 64) {
  const domain = brandDomainFromSenderEmail(from);
  if (!domain) return null;
  const slug = KNOWN_SENDER_BRAND_DOMAINS[domain];
  if (slug) return SIMPLE_ICONS_CDN(slug);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Best icon for a dashboard notification — CRM contact, sender favicon, content brand, or null (initials). */
export function resolveReviewAlertIconUrl(item = {}) {
  const contactIcon = brandingPreviewUrl(item.iconUrl);
  if (contactIcon) return contactIcon;
  const senderIcon = item.from ? senderFaviconUrl(item.from) : null;
  if (senderIcon) return senderIcon;
  const contentIcon = contentBrandIconUrl(item);
  if (contentIcon) return contentIcon;
  return null;
}

const contactAuthorIconByUid = new Map();
const contactAuthorNameByUid = new Map();
let contactAuthorIconPrefetchPromise = null;

function brandingPreviewUrl(url) {
  return (url || '').trim();
}

/** Split contact fields for display (not persisted contact_name). */
export function contactAuthorDisplayParts(client) {
  const company = String(client?.company || '').trim();
  let person = [client?.firstName, client?.lastName]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
  const fullName = String(client?.name || '').trim();
  if (!person && fullName) {
    if (!company || fullName.toLowerCase() !== company.toLowerCase()) {
      person = fullName;
    }
  }
  if (person && company && person.toLowerCase() === company.toLowerCase()) {
    person = '';
  }
  return { company, person };
}

/** Best-case one-line label: "Company / First Last" when both exist. */
export function contactAuthorDisplayLabel(parts) {
  const company = parts?.company || '';
  const person = parts?.person || '';
  if (company && person) return `${company} / ${person}`;
  return company || person || '';
}

/** Structured markup so CSS can drop the person when horizontal space is tight. */
export function contactAuthorDisplayHtml(parts) {
  const company = escHtml(parts?.company || '');
  const person = escHtml(parts?.person || '');
  if (company && person) {
    return (
      `<span class="wk-client-author-display">` +
      `<span class="wk-client-author-co">${company}</span>` +
      `<span class="wk-client-author-sep" aria-hidden="true"> / </span>` +
      `<span class="wk-client-author-person">${person}</span>` +
      `</span>`
    );
  }
  const single = company || person;
  return single ? `<span class="wk-client-author-display">${single}</span>` : '';
}

function contactListDisplayName(client) {
  return contactAuthorDisplayLabel(contactAuthorDisplayParts(client));
}

/** Cache client icon/logo URLs for sidebar author icons (work, todo, etc.). */
export function registerContactAuthorIcons(clients) {
  for (const client of clients || []) {
    if (!client?.uid) continue;
    const iconUrl =
      brandingPreviewUrl(client.iconUrl) || brandingPreviewUrl(client.logoUrl);
    if (iconUrl) contactAuthorIconByUid.set(client.uid, iconUrl);
    else contactAuthorIconByUid.delete(client.uid);
    const name = contactListDisplayName(client);
    if (name) contactAuthorNameByUid.set(client.uid, name);
    else contactAuthorNameByUid.delete(client.uid);
  }
}

/** Company or contact name for sidebar from lines; empty when unknown. */
export function resolveContactAuthorName(contactUid) {
  const uid = (contactUid || '').trim();
  if (!uid) return '';
  return contactAuthorNameByUid.get(uid) || '';
}

/** Best-effort contact list fetch so work/todo rows can show contact icons. */
export function prefetchContactAuthorIcons() {
  if (contactAuthorIconPrefetchPromise) return contactAuthorIconPrefetchPromise;
  contactAuthorIconPrefetchPromise = adminFetch('/api/clients')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.clients) registerContactAuthorIcons(data.clients);
    })
    .catch(() => undefined);
  return contactAuthorIconPrefetchPromise;
}

/** Wait for client branding icons before rendering sidebar rows (avoids reave.app fallback flash). */
export async function ensureContactAuthorIconsReady() {
  await prefetchContactAuthorIcons();
}

/** Contact icon/logo only — empty string when the contact has no branding. */
export function resolveContactBrandIconUrl(contactUid, explicitIconUrl) {
  const direct = brandingPreviewUrl(explicitIconUrl);
  if (direct) return direct;
  const uid = (contactUid || '').trim();
  if (!uid) return '';
  return contactAuthorIconByUid.get(uid) || '';
}

export function resolveContactAuthorIconUrl(contactUid, explicitIconUrl) {
  return resolveContactBrandIconUrl(contactUid, explicitIconUrl) || companyStaffAvatarUrl();
}

function senderInitialsAvatarHtml(from) {
  const initials = senderInitialsFromEmail(from);
  return (
    `<span class="sidebar-list-author-icon sidebar-list-author-icon--initials list-select-icon" role="checkbox" aria-label="Select item">` +
    `<span class="sidebar-list-author-initials" aria-hidden="true">${escHtml(initials)}</span>` +
    `</span>`
  );
}

/** Swap a broken sender favicon to initials (never the company mark). */
export function bindSidebarAuthorIconFallback(img, from = '') {
  if (!img || img.dataset.authorIconFallbackBound) return;
  img.dataset.authorIconFallbackBound = '1';
  img.addEventListener('error', () => {
    const host = img.closest('.sidebar-list-author-icon');
    if (!host) return;
    host.outerHTML = senderInitialsAvatarHtml(from);
  });
}

/** Sidebar list row avatar — client when linked, otherwise company icon. */
export function sidebarAuthorIconHtml(opts = {}) {
  const contactIcon = resolveContactBrandIconUrl(opts.contactUid, opts.iconUrl);
  if (contactIcon) {
    return (
      `<span class="sidebar-list-author-icon list-select-icon" role="checkbox" aria-label="Select item">` +
      `<img class="sidebar-list-author-icon-img" src="${escHtml(contactIcon)}" alt="" loading="lazy" decoding="async" />` +
      `</span>`
    );
  }
  if (opts.iconUrl) {
    const from = opts.from || '';
    return (
      `<span class="sidebar-list-author-icon list-select-icon" role="checkbox" aria-label="Select item">` +
      `<img class="sidebar-list-author-icon-img" src="${escHtml(opts.iconUrl)}" alt="" loading="lazy" decoding="async" data-sender-from="${escHtml(from)}" />` +
      `</span>`
    );
  }
  if (opts.from) return senderInitialsAvatarHtml(opts.from);
  const url = companyStaffAvatarUrl();
  return (
    `<span class="sidebar-list-author-icon list-select-icon" role="checkbox" aria-label="Select item">` +
    `<img class="sidebar-list-author-icon-img" src="${escHtml(url)}" alt="" loading="lazy" decoding="async" />` +
    `</span>`
  );
}

/** Mount sender-icon fallbacks under a list root (inbox, work, todo). */
export function mountSidebarAuthorIcons(root) {
  root?.querySelectorAll?.('.sidebar-list-author-icon-img[data-sender-from]').forEach((img) => {
    bindSidebarAuthorIconFallback(img, img.dataset.senderFrom || '');
  });
}

/** Email sidebar list row avatar — brand favicon, CRM icon, sender initials; not the company mark. */
export function emailListAuthorIconHtml(ev = {}) {
  const firstRecipient = Array.isArray(ev.to) ? ev.to[0] : null;
  const address = ev.from || ev.toEmail || firstRecipient?.email || '';
  const favicon = address ? senderFaviconUrl(address) : null;
  if (favicon) return sidebarAuthorIconHtml({ iconUrl: favicon, from: address });

  const contactUid = String(ev.contactUid || '').trim();
  const contactIcon = contactUid ? resolveContactBrandIconUrl(contactUid) : '';
  if (contactIcon) return sidebarAuthorIconHtml({ contactUid, iconUrl: contactIcon });

  const recipientUid =
    firstRecipient && typeof firstRecipient === 'object'
      ? String(firstRecipient.uid || '').trim()
      : '';
  const recipientIcon = recipientUid ? resolveContactBrandIconUrl(recipientUid) : '';
  if (recipientIcon) return sidebarAuthorIconHtml({ contactUid: recipientUid, iconUrl: recipientIcon });

  if (address) return senderInitialsAvatarHtml(address);

  return sidebarAuthorIconHtml();
}

function stringifyNotificationDebugValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Temporary debug format: `$varname : value` per line (remove when alert sources are fixed). */
export function formatNotificationDebugHtml(record) {
  const lines = [];
  for (const [key, value] of Object.entries(record || {})) {
    const str = stringifyNotificationDebugValue(value);
    if (str == null) continue;
    lines.push(`${escHtml(key)} : ${escHtml(str)}`);
  }
  return lines.join('<br>');
}

const LINKIFY_TRAILING_PUNCT = /[.,;:!?)]+$/;

function isSafeHttpUrl(url) {
  const trimmed = String(url).trim();
  if (!trimmed || /^(javascript|vbscript|data):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Turn plain-text URLs into safe anchor tags (used by work, documents, email panels). */
export function linkifyPlainText(str) {
  const escaped = escHtml(str);
  return escaped.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    let url = raw;
    let trailing = '';
    if (!raw.endsWith('...')) {
      const m = raw.match(LINKIFY_TRAILING_PUNCT);
      if (m) {
        trailing = m[0];
        url = raw.slice(0, -trailing.length);
      }
    }
    if (!isSafeHttpUrl(url)) return raw;
    const href = url.replace(/"/g, '&quot;');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

/** To-do priority labels — shared by dashboard and todo panel. */
export const TODO_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

/** True for legacy DATE-only values stored as UTC midnight. */
export function isUtcDateOnlyInstant(raw, d) {
  if (!d) return false;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return true;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

export function parseTodoDueInstant(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTodoDueTime(d) {
  const h = d.getHours();
  const min = d.getMinutes();
  if (h === 0 && min === 0) return null;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  if (min === 0) return `${hour12}${period}`;
  return `${hour12}:${String(min).padStart(2, '0')}${period}`;
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Display format for tel inputs — US/Canada (+1) by default. */
export function formatPhoneInput(value) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  const us = (digits.startsWith('1') ? digits.slice(1) : digits).slice(0, 10);
  if (us.length < 4) return `+1 (${us}`;
  if (us.length < 7) return `+1 (${us.slice(0, 3)}) ${us.slice(3)}`;
  return `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}

/** Store phones as E.164 for SMS/API. */
export function phoneToStorage(display) {
  const digits = phoneDigits(display);
  if (!digits) return '';
  const us = (digits.startsWith('1') && digits.length >= 11 ? digits.slice(1) : digits).slice(0, 10);
  if (us.length === 10) return `+1${us}`;
  return `+${digits}`;
}

export function isValidPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return true;
  return digits.length >= 10 && digits.length <= 15;
}

export function attachPhoneFormatter(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.phoneFormatted === '1') return;
  input.dataset.phoneFormatted = '1';
  input.type = 'tel';
  input.inputMode = 'tel';
  input.autocomplete = 'tel';
  if (!input.placeholder) input.placeholder = '+1 (555) 000-0000';
  if (input.value) input.value = formatPhoneInput(input.value);
  input.addEventListener('input', () => {
    const formatted = formatPhoneInput(input.value);
    if (formatted !== input.value) input.value = formatted;
  });
}

export function bindFormattedPhoneInputs(root) {
  if (!root) return;
  root.querySelectorAll('input[type="tel"], input[name*="phone" i]').forEach((el) => {
    if (el instanceof HTMLInputElement) attachPhoneFormatter(el);
  });
}

/**
 * Personal contact type + Personal rule-scope chrome.
 * Reave / super-admin install only (`window.__installConfig.showPersonal`).
 */
export function showPersonal() {
  return window.__installConfig?.showPersonal === true;
}

/**
 * Industries catalog editor.
 * Reave / super-admin install only (`window.__installConfig.showIndustries`).
 */
export function showIndustries() {
  return window.__installConfig?.showIndustries === true;
}

/**
 * Module catalog editor.
 * Reave / super-admin install only (`window.__installConfig.showModuleCatalog`).
 */
export function showModuleCatalog() {
  return window.__installConfig?.showModuleCatalog === true;
}

export function hasInstallFeature(id) {
  const features = window.__installConfig?.features;
  return typeof id === 'string' && Array.isArray(features) && features.includes(id);
}

/** Inbox tab, inbound triage, and in-app compose from contacts. */
export function emailInboxEnabled() {
  return hasInstallFeature('email_inbox');
}

/** Profile email signature + admin compose — same gate as Inbox Triage (`email_inbox`). */
export function agenticEmailEnabled() {
  return emailInboxEnabled();
}

/** Cal.com schedule tab and footer schedule icon. */
export function schedulingEnabled() {
  return hasInstallFeature('scheduling');
}
