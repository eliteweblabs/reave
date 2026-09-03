/**
 * Lightweight admin performance tracing.
 *
 * Enable:
 *   ?trace=1        — boot + all traced spans
 *   ?trace=chat     — chat refresh/selection path only (+ admin boot)
 *   localStorage.setItem('reave:trace', '1' | 'chat')
 *
 * Console: filter "[reave trace]". Performance panel: measures prefixed "reave:".
 * HUD: bottom-right overlay while tracing is on. window.__reaveTrace.summary() dumps timings.
 */

const LS_KEY = 'reave:trace';
const HUD_ID = 'reave-trace-hud';

/** @type {'all' | 'chat' | null} */
let scope = null;

function readScope() {
  try {
    const q = new URLSearchParams(window.location.search).get('trace');
    if (q === 'chat') return 'chat';
    if (q === '1' || q === 'true') return 'all';
    const ls = localStorage.getItem(LS_KEY);
    if (ls === 'chat') return 'chat';
    if (ls === '1' || ls === 'true') return 'all';
  } catch {
    /* ignore */
  }
  return null;
}

function persistScopeFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get('trace');
    if (q === 'chat' || q === '1' || q === 'true') {
      localStorage.setItem(LS_KEY, q === 'chat' ? 'chat' : '1');
    }
  } catch {
    /* ignore */
  }
}

function isTracing(name) {
  if (!scope) return false;
  if (scope === 'all') return true;
  return (
    name.startsWith('chat:') ||
    name.startsWith('admin:')
  );
}

function log(line, meta) {
  if (meta != null && typeof meta === 'object' && Object.keys(meta).length) {
    console.info(`[reave trace] ${line}`, meta);
  } else {
    console.info(`[reave trace] ${line}`);
  }
}

function ensureHud() {
  if (document.getElementById(HUD_ID)) return document.getElementById(HUD_ID);
  const hud = document.createElement('div');
  hud.id = HUD_ID;
  hud.setAttribute('aria-hidden', 'true');
  hud.style.cssText =
    'position:fixed;right:0.65rem;bottom:0.65rem;z-index:99998;max-width:min(22rem,calc(100vw - 1.3rem));' +
    'max-height:40vh;overflow:auto;padding:0.45rem 0.55rem;border-radius:8px;' +
    'background:rgba(15,23,42,0.92);color:#e2e8f0;font:500 0.68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'border:1px solid rgba(148,163,184,0.35);box-shadow:0 8px 24px rgba(0,0,0,0.35);pointer-events:none;';
  const title = document.createElement('div');
  title.textContent = scope === 'chat' ? 'trace · chat' : 'trace · all';
  title.style.cssText = 'font-weight:700;margin-bottom:0.25rem;color:#93c5fd;';
  hud.appendChild(title);
  const body = document.createElement('div');
  body.dataset.traceBody = '1';
  hud.appendChild(body);
  document.body?.appendChild(hud);
  return hud;
}

function hudLine(text, meta) {
  const hud = ensureHud();
  const body = hud?.querySelector('[data-trace-body]');
  if (!body) return;
  const row = document.createElement('div');
  let extra = '';
  if (meta != null && typeof meta === 'object') {
    const bits = [];
    if (meta.ms != null) bits.push(`${meta.ms}ms`);
    if (meta.threads != null) bits.push(`${meta.threads} threads`);
    if (meta.messages != null) bits.push(`${meta.messages} msgs`);
    if (meta.restoreId) bits.push(String(meta.restoreId).slice(0, 8));
    if (meta.ok === false) bits.push('FAILED');
    if (bits.length) extra = ` · ${bits.join(' · ')}`;
  }
  row.textContent = `${text}${extra}`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

const noopEnd = () => 0;

/** @param {string} name @param {Record<string, unknown>} [meta] */
export function traceStart(name, meta) {
  if (!isTracing(name)) return noopEnd;
  const t0 = performance.now();
  const markName = `reave:${name}`;
  performance.mark(`${markName}:start`);
  log(`→ ${name}`, meta);
  return (endMeta) => {
    const ms = performance.now() - t0;
    try {
      performance.measure(markName, `${markName}:start`);
    } catch {
      /* duplicate measure name — ok */
    }
    const merged = { ...(meta || {}), ...(endMeta || {}), ms: Math.round(ms) };
    log(`${name} ${ms.toFixed(1)}ms`, merged);
    hudLine(name, merged);
    return ms;
  };
}

/** @param {string} name @param {() => Promise<T>} fn @param {Record<string, unknown>} [meta] @template T */
export async function traceAsync(name, fn, meta) {
  const end = traceStart(name, meta);
  try {
    const result = await fn();
    end({ ok: true });
    return result;
  } catch (e) {
    end({ ok: false, err: e?.message || String(e) });
    throw e;
  }
}

export function traceSummary() {
  if (!scope) return [];
  const entries = performance
    .getEntriesByType('measure')
    .filter((e) => e.name.startsWith('reave:'))
    .map((e) => ({ name: e.name.replace(/^reave:/, ''), ms: e.duration }))
    .sort((a, b) => b.ms - a.ms);
  console.groupCollapsed('[reave trace] summary (slowest first)');
  for (const row of entries) console.info(`${row.name}: ${row.ms.toFixed(1)}ms`);
  console.groupEnd();
  return entries;
}

function markMs(name) {
  const entry = performance.getEntriesByName(name, 'mark')[0];
  return entry ? Math.round(entry.startTime) : null;
}

export function reportPreBootTiming() {
  if (!scope) return;
  const page = markMs('reave:admin:page');
  const evalStart = markMs('reave:admin:os-map-loader:eval-start');
  const evalEnd = markMs('reave:admin:os-map-loader:eval-end');
  const traceStartMs = markMs('reave:trace:start');
  const meta = {
    pageToTraceMs: page != null && traceStartMs != null ? traceStartMs - page : null,
    pageToLoaderEvalMs: page != null && evalEnd != null ? evalEnd - page : null,
    loaderParseMs: evalStart != null && evalEnd != null ? evalEnd - evalStart : null,
    domContentLoadedMs: null,
  };
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav?.domContentLoadedEventEnd) meta.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd);
  log('pre-boot (untraced JS parse / download)', meta);
  hudLine('pre-boot gap', meta);
}

export function initPerfTrace() {
  persistScopeFromUrl();
  scope = readScope();
  if (!scope) return false;
  performance.mark('reave:trace:start');
  log('enabled', {
    scope,
    hint: 'window.__reaveTrace.summary() · disable: localStorage.removeItem("reave:trace")',
  });
  if (document.body) ensureHud();
  else document.addEventListener('DOMContentLoaded', ensureHud, { once: true });
  return true;
}

const enabled = initPerfTrace();

window.__reaveTrace = {
  enabled: () => !!scope,
  scope: () => scope,
  start: traceStart,
  async: traceAsync,
  summary: traceSummary,
  preBoot: reportPreBootTiming,
};

export { enabled as perfTraceEnabled };
