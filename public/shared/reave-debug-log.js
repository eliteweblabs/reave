/**
 * Structured client debug log — ring buffer, console, optional HUD, localStorage export.
 *
 * Enable all channels:
 *   localStorage.setItem('reave:debug-log', '1')
 *   ?debugLog=1
 *
 * Disable:
 *   localStorage.setItem('reave:debug-log', '0')
 *
 * PWA refresh channel also follows pwa-refresh-debug rules (standalone PWA by default).
 *
 * Console: window.__reaveDebugLog.copyAll() | .exportAll() | .get('pwa-refresh').entries()
 */

const LS_ENABLE_KEY = 'reave:debug-log';
const LS_FORCE_SESSION = 'reave:debug-log-force';
const LS_PERSIST_KEY = 'reave:debug-log-buffer';
const MAX_MEMORY = 400;
const MAX_PERSIST = 120;
const HUD_MAX_ROWS = 200;

/** @typedef {'debug' | 'info' | 'warn' | 'error' | 'event' | 'trace'} DebugLevel */

const LS_DIAG_BUFFER = 'reave:diag-trace-buffer';
const LS_DIAG_GLOBAL = 'reave:diag';
const LS_DIAG_MODULES = 'reave:diag:modules';

/** @type {Map<string, ReaveDebugLog>} */
const channels = new Map();

function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function readGlobalForceEnable() {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(LS_FORCE_SESSION) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('debugLog') === '1') {
      sessionStorage.setItem(LS_FORCE_SESSION, '1');
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(LS_ENABLE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

function globalDisabled() {
  try {
    return localStorage.getItem(LS_ENABLE_KEY) === '0';
  } catch {
    return false;
  }
}

function readPersistedBuffer() {
  try {
    const raw = localStorage.getItem(LS_PERSIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersistedBuffer(entries) {
  try {
    localStorage.setItem(LS_PERSIST_KEY, JSON.stringify(entries.slice(-MAX_PERSIST)));
  } catch {
    /* ignore */
  }
}

function levelColor(level) {
  switch (level) {
    case 'error':
      return '#fca5a5';
    case 'warn':
      return '#fcd34d';
    case 'event':
      return '#93c5fd';
    case 'trace':
      return '#67e8f9';
    case 'debug':
      return '#94a3b8';
    default:
      return '#e2e8f0';
  }
}

function diagnosticHudEnabled() {
  try {
    const v = localStorage.getItem(LS_DIAG_GLOBAL);
    if (v === 'on' || v === '1' || v === 'true') return true;
    if (v === 'off' || v === '0' || v === 'false') return false;
    const mods = readJsonLocal(LS_DIAG_MODULES, {});
    return Object.values(mods).some((x) => x === true);
  } catch {
    return false;
  }
}

function readJsonLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function shouldShowDebugHud() {
  return pwaRefreshChannelEnabled() || readGlobalForceEnable() || diagnosticHudEnabled();
}

/**
 * Call trace lines from reave-diagnostic.js (shared HUD + persist merge on export).
 * @param {Record<string, unknown>} entry
 */
export function ingestDiagnosticEntry(entry) {
  if (!entry?.module || !entry?.fn) return;
  const depth = Number(entry.depth) || 0;
  const indent = '  '.repeat(depth);
  const arrow =
    entry.kind === 'enter' ? '→' : entry.kind === 'leave' ? '←' : entry.kind === 'event' ? '•' : '·';
  const ms = entry.ms != null ? ` ${entry.ms}ms` : '';
  const msg = entry.message ? ` ${entry.message}` : '';
  const detail = { ...entry };
  delete detail.at;
  delete detail.module;
  delete detail.fn;
  delete detail.kind;
  delete detail.depth;
  delete detail.message;
  delete detail.ms;
  const message = `${indent}${arrow} ${entry.module}.${entry.fn}${ms}${msg}`;
  const logEntry = {
    at: typeof entry.at === 'string' ? entry.at : new Date().toISOString(),
    level: 'trace',
    channel: String(entry.module),
    message,
    detail: Object.keys(detail).length ? detail : undefined,
  };
  appendHudRow(logEntry);
  try {
    const merged = readPersistedBuffer().concat(logEntry).slice(-MAX_PERSIST);
    writePersistedBuffer(merged);
  } catch {
    /* ignore */
  }
}

export function ensureDebugHud() {
  return ensureHudShell();
}

function formatConsoleLine(entry) {
  const parts = [`[${entry.channel}]`, entry.message];
  if (entry.detail && Object.keys(entry.detail).length) {
    parts.push(JSON.stringify(entry.detail));
  }
  return parts.join(' ');
}

function hudMountEl() {
  return document.getElementById('reave-debug-log-hud-mount') || document.getElementById('reave-trace-hud-mount');
}

export class ReaveDebugLog {
  /**
   * @param {string} channel
   * @param {{ hud?: boolean; persist?: boolean; enabled?: () => boolean }} [options]
   */
  constructor(channel, options = {}) {
    this.channel = channel;
    this.hudEnabled = options.hud !== false;
    this.persistEnabled = options.persist !== false;
    /** @type {() => boolean} */
    this._enabledFn = options.enabled || (() => readGlobalForceEnable());
    /** @type {Array<{ at: string; level: DebugLevel; channel: string; message: string; detail?: Record<string, unknown> }>} */
    this._entries = [];
  }

  enabled() {
    if (globalDisabled()) return false;
    return this._enabledFn();
  }

  /** @param {DebugLevel} level @param {string} message @param {Record<string, unknown>} [detail] */
  _push(level, message, detail) {
    if (!this.enabled()) return;
    const entry = {
      at: new Date().toISOString(),
      level,
      channel: this.channel,
      message,
      detail: detail && Object.keys(detail).length ? detail : undefined,
    };
    this._entries.push(entry);
    while (this._entries.length > MAX_MEMORY) this._entries.shift();

    if (this.persistEnabled) {
      const merged = readPersistedBuffer().concat(entry).slice(-MAX_PERSIST);
      writePersistedBuffer(merged);
    }

    const line = formatConsoleLine(entry);
    if (level === 'error') console.error(line, detail || '');
    else if (level === 'warn') console.warn(line, detail || '');
    else if (level === 'debug') console.debug(line, detail || '');
    else console.info(line, detail || '');

    if (this.hudEnabled) appendHudRow(entry);
  }

  debug(message, detail) {
    this._push('debug', message, detail);
  }

  info(message, detail) {
    this._push('info', message, detail);
  }

  warn(message, detail) {
    this._push('warn', message, detail);
  }

  error(message, detail) {
    this._push('error', message, detail);
  }

  /** High-signal navigation / state transition (reload causes, auth forks). */
  event(message, detail) {
    this._push('event', message, detail);
  }

  entries() {
    return this._entries.slice();
  }

  exportText() {
    return this._entries
      .map((e) => {
        const base = `${e.at} [${e.level}] ${e.message}`;
        return e.detail ? `${base} ${JSON.stringify(e.detail)}` : base;
      })
      .join('\n');
  }

  async copyExport() {
    const text = this.exportText();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

/** @param {string} channel @param {{ hud?: boolean; persist?: boolean; enabled?: () => boolean }} [options] */
export function getDebugLog(channel, options) {
  const key = channel;
  if (!channels.has(key)) {
    channels.set(key, new ReaveDebugLog(channel, options));
  }
  return channels.get(key);
}

function pwaRefreshChannelEnabled() {
  if (readGlobalForceEnable()) return true;
  try {
    if (localStorage.getItem('reave-pwa-refresh-debug') === '0') return false;
  } catch {
    /* ignore */
  }
  try {
    if (sessionStorage.getItem('reave-pwa-refresh-debug-force') === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('pwaRefreshDebug') === '1') return true;
  } catch {
    /* ignore */
  }
  return isStandaloneDisplayMode();
}

function diagnosticModuleEnabled(moduleId) {
  try {
    const g = localStorage.getItem(LS_DIAG_GLOBAL);
    if (g === 'on' || g === '1' || g === 'true') return true;
    if (g === 'off' || g === '0' || g === 'false') return false;
    const mods = readJsonLocal(LS_DIAG_MODULES, {});
    return mods[moduleId] === true;
  } catch {
    return false;
  }
}

export function getPwaRefreshLog() {
  return getDebugLog('pwa-refresh', {
    enabled: () => pwaRefreshChannelEnabled() || diagnosticModuleEnabled('pwa'),
  });
}

export function getAuthDebugLog() {
  return getDebugLog('auth', {
    enabled: () =>
      readGlobalForceEnable() || pwaRefreshChannelEnabled() || diagnosticModuleEnabled('auth'),
  });
}

let hudReady = false;

function ensureHudShell() {
  if (typeof document === 'undefined') return null;
  if (document.getElementById('reave-debug-log-hud')) {
    return document.getElementById('reave-debug-log-hud');
  }
  if (!shouldShowDebugHud()) return null;

  const mount = hudMountEl();
  const inFooter = Boolean(mount);

  const hud = document.createElement('div');
  hud.id = 'reave-debug-log-hud';
  if (inFooter) {
    hud.className = 'reave-debug-log-hud-in-footer';
  } else {
    hud.style.cssText = 'position:fixed;left:0.65rem;bottom:0.65rem;z-index:99997;';
  }

  const hit = document.createElement('div');
  hit.className = inFooter ? 'reave-debug-log-hud-hit' : '';
  if (!inFooter) hit.style.cssText = 'position:relative;display:inline-flex;';

  const panel = document.createElement('div');
  panel.id = 'reave-debug-log-hud-panel';
  panel.setAttribute('aria-hidden', 'true');
  if (inFooter) {
    panel.className = 'reave-debug-log-hud-panel';
  } else {
    panel.style.cssText =
      'position:absolute;left:0;bottom:calc(100% + 0.35rem);width:min(26rem,calc(100vw - 1.3rem));max-height:42vh;overflow:auto;padding:0.45rem 0.55rem;border-radius:8px;' +
      'background:rgba(15,23,42,0.96);color:#e2e8f0;font:500 0.68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'border:1px solid rgba(148,163,184,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.35);' +
      'opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity 0.15s ease,visibility 0.15s ease,transform 0.15s ease;pointer-events:none;';
  }

  const title = document.createElement('div');
  title.textContent = 'debug · trace log';
  if (!inFooter) title.style.cssText = 'font-weight:700;margin-bottom:0.25rem;color:#93c5fd;';
  panel.appendChild(title);

  const body = document.createElement('div');
  body.dataset.debugLogBody = '1';
  panel.appendChild(body);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Debug/trace log — hover to expand; double-click to copy';
  btn.setAttribute('aria-label', 'Debug log');
  if (inFooter) {
    btn.className = 'footer-nav-btn reave-debug-log-hud-btn';
  } else {
    btn.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;border-radius:999px;' +
      'border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.88);color:#a5b4fc;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,0.28);font:700 0.62rem/1 ui-monospace,monospace;';
  }
  btn.textContent = inFooter ? 'DBG' : '⌁';

  const showPanel = () => {
    if (inFooter) panel.classList.add('is-open');
    else {
      panel.style.opacity = '1';
      panel.style.visibility = 'visible';
      panel.style.transform = 'translateY(0)';
      panel.style.pointerEvents = 'auto';
    }
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
  };
  const hidePanel = () => {
    if (inFooter) panel.classList.remove('is-open');
    else {
      panel.style.opacity = '0';
      panel.style.visibility = 'hidden';
      panel.style.transform = 'translateY(4px)';
      panel.style.pointerEvents = 'none';
    }
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  };

  hit.addEventListener('mouseenter', showPanel);
  hit.addEventListener('mouseleave', hidePanel);
  hit.addEventListener('focusin', showPanel);
  hit.addEventListener('focusout', (e) => {
    if (!hit.contains(e.relatedTarget)) hidePanel();
  });

  btn.addEventListener('dblclick', async (e) => {
    e.preventDefault();
    const ok = await exportAllDebugText().then((t) =>
      navigator.clipboard.writeText(t).then(() => true).catch(() => false),
    );
    btn.title = ok ? 'Copied debug log to clipboard' : 'Copy failed — see console';
  });

  hit.appendChild(panel);
  hit.appendChild(btn);
  hud.appendChild(hit);
  (mount || document.body)?.appendChild(hud);
  hudReady = true;
  return hud;
}

/** @param {{ at: string; level: DebugLevel; channel: string; message: string; detail?: Record<string, unknown> }} entry */
function appendHudRow(entry) {
  ensureHudShell();
  const body = document.getElementById('reave-debug-log-hud-panel')?.querySelector('[data-debug-log-body]');
  if (!body) return;
  while (body.childElementCount >= HUD_MAX_ROWS) {
    body.firstElementChild?.remove();
  }
  const row = document.createElement('div');
  const detail =
    entry.detail && Object.keys(entry.detail).length ? ` ${JSON.stringify(entry.detail)}` : '';
  row.textContent = `${entry.at.slice(11, 19)} [${entry.channel}] ${entry.message}${detail}`;
  row.style.color = levelColor(entry.level || 'info');
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

function formatPersistedLines(entries) {
  return entries
    .map((e) => {
      const base = `${e.at} [${e.channel}/${e.level}] ${e.message}`;
      return e.detail ? `${base} ${JSON.stringify(e.detail)}` : base;
    })
    .join('\n');
}

function readDiagnosticPersistedLines() {
  const trace = readJsonLocal(LS_DIAG_BUFFER, []);
  if (!Array.isArray(trace) || !trace.length) return '';
  return trace
    .map((e) => {
      const depth = Number(e.depth) || 0;
      const indent = '  '.repeat(depth);
      const arrow =
        e.kind === 'enter' ? '→' : e.kind === 'leave' ? '←' : e.kind === 'event' ? '•' : '·';
      const ms = e.ms != null ? ` ${e.ms}ms` : '';
      const msg = e.message ? ` ${e.message}` : '';
      const rest = { ...e };
      delete rest.at;
      delete rest.module;
      delete rest.fn;
      delete rest.kind;
      delete rest.depth;
      delete rest.ms;
      delete rest.message;
      const tail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
      return `${e.at} [trace/${e.module}] ${indent}${arrow} ${e.fn}${ms}${msg}${tail}`;
    })
    .join('\n');
}

export function exportAllDebugText() {
  const diagLines = readDiagnosticPersistedLines();
  const persisted = readPersistedBuffer();
  if (persisted.length || diagLines) {
    const parts = [];
    if (diagLines) parts.push('--- diagnostic trace ---\n' + diagLines);
    if (persisted.length) parts.push('--- log ---\n' + formatPersistedLines(persisted));
    return parts.join('\n\n');
  }
  const lines = [];
  for (const log of channels.values()) {
    lines.push(...log.entries());
  }
  lines.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return lines
    .map((e) => {
      const base = `${e.at} [${e.channel}/${e.level}] ${e.message}`;
      return e.detail ? `${base} ${JSON.stringify(e.detail)}` : base;
    })
    .join('\n');
}

export async function copyAllDebugText() {
  try {
    await navigator.clipboard.writeText(exportAllDebugText());
    return true;
  } catch {
    return false;
  }
}

export function clearPersistedDebugLog() {
  try {
    localStorage.removeItem(LS_PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  window.__reaveDebugLog = {
    get: getDebugLog,
    pwa: getPwaRefreshLog,
    auth: getAuthDebugLog,
    exportAll: exportAllDebugText,
    copyAll: copyAllDebugText,
    clearPersisted: clearPersistedDebugLog,
    ensureHud: ensureHudShell,
    /** Full call trace API lives on window.__reaveDiag (reave-diagnostic.js). */
    diag: () => window.__reaveDiag,
  };
}
