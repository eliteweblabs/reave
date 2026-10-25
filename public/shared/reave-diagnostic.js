/**
 * Reave client diagnostic tracer — module-scoped, on/off, call enter/leave spans.
 *
 * Global:
 *   localStorage.setItem('reave:diag', 'on')   — all modules
 *   localStorage.setItem('reave:diag', 'off')  — disabled
 *   localStorage.setItem('reave:diag', 'modules') — only toggled modules (default)
 *
 * Per module:
 *   localStorage.setItem('reave:diag:auth', '1')
 *   localStorage.setItem('reave:diag:fetch', '0')
 *
 * URL (persists for tab session):
 *   ?diag=1              all modules on
 *   ?diag=0              off
 *   ?diag=auth,fetch,pwa comma list
 *
 * Console:
 *   __reaveDiag.status()
 *   __reaveDiag.enable('auth') / .disable('fetch') / .enableAll() / .disableAll()
 *   __reaveDiag.copyTrace()
 *
 * In code:
 *   import { createTracer } from '/shared/reave-diagnostic.js';
 *   const auth = createTracer('auth');
 *   await auth.runAsync('handle401', () => ...);
 */

import { ingestDiagnosticEntry, ensureDebugHud } from './reave-debug-log.js';

const LS_GLOBAL = 'reave:diag';
const LS_MODULES = 'reave:diag:modules';
const LS_BUFFER = 'reave:diag-trace-buffer';
const LS_SESSION_FORCE = 'reave:diag-session';

const MAX_BUFFER = 800;
const MAX_PERSIST = 400;
const MAX_ARG_JSON = 240;

/** @type {Record<string, string>} */
export const DIAG_MODULES = {
  auth: 'Clerk / SSR session / 401 recovery',
  fetch: 'Admin fetch guard and /api/* calls',
  pwa: 'PWA reload marks and location navigation',
  nav: 'Admin tab switches (setActiveMap, activate panel)',
  chat: 'Chats tab load, open thread, session list',
  push: 'Web push permission, subscribe, server sync',
  sw: 'Service worker register and updates',
  clerk: 'Sign-in sheet / handshake / half-session',
  session: 'Keepalive and visibility foreground sync',
};

/** @type {Map<string, number>} */
const depthByModule = new Map();
/** @type {Array<Record<string, unknown>>} */
let memoryBuffer = [];

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function parseUrlDiag() {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('diag');
    if (q == null) return null;
    if (q === '0' || q === 'off' || q === 'false') return { mode: 'off' };
    if (q === '1' || q === 'on' || q === 'true' || q === 'all') return { mode: 'on' };
    const list = q
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { mode: 'modules', modules: list };
  } catch {
    return null;
  }
}

function applyUrlDiagOnce() {
  const parsed = parseUrlDiag();
  if (!parsed) return;
  try {
    sessionStorage.setItem(LS_SESSION_FORCE, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
  if (parsed.mode === 'off') {
    try {
      localStorage.setItem(LS_GLOBAL, 'off');
    } catch {
      /* ignore */
    }
    return;
  }
  if (parsed.mode === 'on') {
    try {
      localStorage.setItem(LS_GLOBAL, 'on');
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    localStorage.setItem(LS_GLOBAL, 'modules');
  } catch {
    /* ignore */
  }
  const mods = readJson(LS_MODULES, {});
  for (const id of parsed.modules || []) {
    if (DIAG_MODULES[id]) mods[id] = true;
  }
  writeJson(LS_MODULES, mods);
}

function readSessionForce() {
  try {
    const raw = sessionStorage.getItem(LS_SESSION_FORCE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function diagnosticGlobalMode() {
  applyUrlDiagOnce();
  try {
    const v = localStorage.getItem(LS_GLOBAL);
    if (v === 'off' || v === '0' || v === 'false') return 'off';
    if (v === 'on' || v === '1' || v === 'true') return 'on';
  } catch {
    /* ignore */
  }
  const forced = readSessionForce();
  if (forced?.mode === 'off') return 'off';
  if (forced?.mode === 'on') return 'on';
  return 'modules';
}

function readModuleOverrides() {
  return readJson(LS_MODULES, {});
}

export function isDiagnosticModuleEnabled(moduleId) {
  if (!DIAG_MODULES[moduleId]) return false;
  const mode = diagnosticGlobalMode();
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  const overrides = readModuleOverrides();
  if (overrides[moduleId] === true) return true;
  if (overrides[moduleId] === false) return false;
  return false;
}

export function isAnyDiagnosticEnabled() {
  const mode = diagnosticGlobalMode();
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  const overrides = readModuleOverrides();
  return Object.values(overrides).some((v) => v === true);
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > 3) return '[nested]';
  if (typeof value === 'string') {
    return value.length > MAX_ARG_JSON ? `${value.slice(0, MAX_ARG_JSON)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|password|authorization|cookie|key/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = sanitizeValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function sanitizeArgs(args) {
  if (!args?.length) return undefined;
  if (args.length === 1) return sanitizeValue(args[0]);
  return args.map((a) => sanitizeValue(a));
}

function pushEntry(entry) {
  memoryBuffer.push(entry);
  while (memoryBuffer.length > MAX_BUFFER) memoryBuffer.shift();

  try {
    const persisted = readJson(LS_BUFFER, []);
    persisted.push(entry);
    writeJson(LS_BUFFER, persisted.slice(-MAX_PERSIST));
  } catch {
    /* ignore */
  }

  ingestDiagnosticEntry(entry);
}

function moduleDepth(moduleId) {
  return depthByModule.get(moduleId) || 0;
}

function setModuleDepth(moduleId, depth) {
  depthByModule.set(moduleId, depth);
}

/**
 * @param {string} moduleId
 * @param {'enter' | 'leave' | 'log' | 'event'} kind
 * @param {string} fn
 * @param {Record<string, unknown>} [detail]
 */
function record(moduleId, kind, fn, detail) {
  if (!isDiagnosticModuleEnabled(moduleId)) return;
  ensureDebugHud();
  const depth = kind === 'leave' ? Math.max(0, moduleDepth(moduleId) - 1) : moduleDepth(moduleId);
  const entry = {
    at: nowIso(),
    module: moduleId,
    kind,
    fn,
    depth,
    ...detail,
  };
  pushEntry(entry);

  const indent = '  '.repeat(depth);
  const arrow = kind === 'enter' ? '→' : kind === 'leave' ? '←' : kind === 'event' ? '•' : '·';
  const ms = detail?.ms != null ? ` ${detail.ms}ms` : '';
  const extra =
    detail && Object.keys(detail).filter((k) => k !== 'ms' && k !== 'ok').length
      ? ` ${JSON.stringify(
          Object.fromEntries(
            Object.entries(detail).filter(([k]) => !['ms', 'ok'].includes(k)),
          ),
        )}`
      : '';
  const line = `${indent}${arrow} ${moduleId}.${fn}${ms}${extra}`;
  if (kind === 'log' && detail?.level === 'error') console.error('[diag]', line);
  else if (kind === 'log' && detail?.level === 'warn') console.warn('[diag]', line);
  else console.info('[diag]', line);
}

export function createTracer(moduleId) {
  return {
    moduleId,
    enabled: () => isDiagnosticModuleEnabled(moduleId),

    enter(fn, args) {
      if (!this.enabled()) return;
      setModuleDepth(moduleId, moduleDepth(moduleId) + 1);
      record(moduleId, 'enter', fn, args ? { args: sanitizeArgs([args].flat()) } : undefined);
    },

    leave(fn, detail) {
      if (!this.enabled()) return;
      record(moduleId, 'leave', fn, detail);
      setModuleDepth(moduleId, Math.max(0, moduleDepth(moduleId) - 1));
    },

    log(fn, message, detail) {
      if (!this.enabled()) return;
      record(moduleId, 'log', fn, { level: 'info', message, ...detail });
    },

    warn(fn, message, detail) {
      if (!this.enabled()) return;
      record(moduleId, 'log', fn, { level: 'warn', message, ...detail });
    },

    event(fn, message, detail) {
      if (!this.enabled()) return;
      record(moduleId, 'event', fn, { message, ...detail });
    },

    runSync(fn, cb, args) {
      if (!this.enabled()) return cb();
      const t0 = performance.now();
      this.enter(fn, sanitizeArgs(args));
      try {
        const result = cb();
        this.leave(fn, { ms: Math.round(performance.now() - t0), ok: true });
        return result;
      } catch (e) {
        this.leave(fn, {
          ms: Math.round(performance.now() - t0),
          ok: false,
          error: e?.message || String(e),
        });
        throw e;
      }
    },

    async runAsync(fn, cb, args) {
      if (!this.enabled()) return cb();
      const t0 = performance.now();
      this.enter(fn, sanitizeArgs(args));
      try {
        const result = await cb();
        this.leave(fn, { ms: Math.round(performance.now() - t0), ok: true });
        return result;
      } catch (e) {
        this.leave(fn, {
          ms: Math.round(performance.now() - t0),
          ok: false,
          error: e?.message || String(e),
        });
        throw e;
      }
    },

    wrapSync(fn, cb) {
      const self = this;
      return function tracedSync(...args) {
        return self.runSync(fn, () => cb.apply(this, args), args);
      };
    },

    wrapAsync(fn, cb) {
      const self = this;
      return async function tracedAsync(...args) {
        return self.runAsync(fn, () => cb.apply(this, args), args);
      };
    },
  };
}

export function exportDiagnosticTrace() {
  try {
    const persisted = readJson(LS_BUFFER, []);
    if (persisted.length) {
      return formatTraceLines(persisted);
    }
  } catch {
    /* ignore */
  }
  return formatTraceLines(memoryBuffer);
}

function formatTraceLines(entries) {
  return entries
    .map((e) => {
      const indent = '  '.repeat(Number(e.depth) || 0);
      const arrow =
        e.kind === 'enter' ? '→' : e.kind === 'leave' ? '←' : e.kind === 'event' ? '•' : '·';
      const ms = e.ms != null ? ` ${e.ms}ms` : '';
      const msg = e.message ? ` ${e.message}` : '';
      const rest = { ...e };
      delete rest.at;
      delete rest.module;
      delete rest.kind;
      delete rest.fn;
      delete rest.depth;
      delete rest.ms;
      delete rest.message;
      const tail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
      return `${e.at} ${indent}${arrow} ${e.module}.${e.fn}${ms}${msg}${tail}`;
    })
    .join('\n');
}

export async function copyDiagnosticTrace() {
  try {
    await navigator.clipboard.writeText(exportDiagnosticTrace());
    return true;
  } catch {
    return false;
  }
}

export function clearDiagnosticTrace() {
  memoryBuffer = [];
  try {
    localStorage.removeItem(LS_BUFFER);
  } catch {
    /* ignore */
  }
}

export function setDiagnosticGlobal(mode) {
  try {
    localStorage.setItem(LS_GLOBAL, mode);
  } catch {
    /* ignore */
  }
}

export function enableDiagnosticModule(moduleId) {
  if (!DIAG_MODULES[moduleId]) return false;
  const mods = readModuleOverrides();
  mods[moduleId] = true;
  writeJson(LS_MODULES, mods);
  try {
    localStorage.setItem(LS_GLOBAL, 'modules');
  } catch {
    /* ignore */
  }
  return true;
}

export function disableDiagnosticModule(moduleId) {
  if (!DIAG_MODULES[moduleId]) return false;
  const mods = readModuleOverrides();
  mods[moduleId] = false;
  writeJson(LS_MODULES, mods);
  return true;
}

export function enableAllDiagnosticModules() {
  setDiagnosticGlobal('on');
}

export function disableAllDiagnostics() {
  setDiagnosticGlobal('off');
}

export function diagnosticStatus() {
  const mode = diagnosticGlobalMode();
  const overrides = readModuleOverrides();
  /** @type {Record<string, boolean>} */
  const modules = {};
  for (const id of Object.keys(DIAG_MODULES)) {
    modules[id] = isDiagnosticModuleEnabled(id);
  }
  return { mode, overrides, modules, anyEnabled: isAnyDiagnosticEnabled() };
}

/** Patch fetch once for the fetch module — admin /api paths only. */
export function installDiagnosticFetchTrace() {
  if (typeof window === 'undefined' || window.__reaveDiagFetchPatched) return;
  window.__reaveDiagFetchPatched = true;
  const fetchTracer = createTracer('fetch');
  const native = window.__reaveNativeFetch || window.fetch.bind(window);

  window.fetch = async function diagnosticFetch(input, init) {
    const enabled = fetchTracer.enabled();
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
      return native(input, init);
    }

    const traceThis = enabled && path.startsWith('/api/') && !path.includes('__clerk');
    const method = (init?.method || 'GET').toUpperCase();
    if (!traceThis) return native(input, init);

    const label = `${method} ${path}`;
    if (!enabled) return native(input, init);
    const t0 = performance.now();
    fetchTracer.enter(label, { method, path });
    try {
      const res = await native(input, init);
      fetchTracer.leave(label, {
        ms: Math.round(performance.now() - t0),
        status: res.status,
        ok: res.ok,
      });
      return res;
    } catch (e) {
      fetchTracer.leave(label, {
        ms: Math.round(performance.now() - t0),
        ok: false,
        error: e?.message || String(e),
      });
      throw e;
    }
  };
}

if (typeof window !== 'undefined') {
  applyUrlDiagOnce();
  window.__reaveDiag = {
    modules: DIAG_MODULES,
    status: diagnosticStatus,
    enableAll: enableAllDiagnosticModules,
    disableAll: disableAllDiagnostics,
    setGlobal: setDiagnosticGlobal,
    enable: enableDiagnosticModule,
    disable: disableDiagnosticModule,
    createTracer,
    exportTrace: exportDiagnosticTrace,
    copyTrace: copyDiagnosticTrace,
    clearTrace: clearDiagnosticTrace,
    installFetchTrace: installDiagnosticFetchTrace,
  };
}
