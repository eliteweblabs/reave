/**
 * Lightweight admin performance tracing (always on in admin).
 *
 * Scope overrides:
 *   ?trace=0 | ?trace=off  — disable for this session
 *   ?trace=chat            — chat + admin boot + dashboard load (admin API fetches only)
 *   localStorage.setItem('reave:trace', '0' | 'chat')
 *
 * Console: filter "[reave trace]". Performance panel: measures prefixed "reave:".
 * HUD: footer nav stopwatch (deployment owner only); hover for live span log (resets each page load).
 * Auto: fetch timing, long tasks, slow resources. window.__reaveTrace.summary() dumps timings.
 */

const LS_KEY = 'reave:trace';
const PANEL_ID = 'reave-trace-panel';
const TRACE_BTN_ID = 'footer-nav-trace';
const MAX_HUD_ROWS = 250;
const LONG_TASK_MS = 50;
const SLOW_RESOURCE_MS = 80;
const WARN_MS = 500;
const CRITICAL_MS = 1500;

/** @type {'all' | 'chat' | null} */
let scope = null;

function readScope() {
  try {
    const q = new URLSearchParams(window.location.search).get('trace');
    if (q === '0' || q === 'off' || q === 'false') return null;
    if (q === 'chat') return 'chat';
    if (q === '1' || q === 'true') return 'all';
    const ls = localStorage.getItem(LS_KEY);
    if (ls === '0' || ls === 'off' || ls === 'false') return null;
    if (ls === 'chat') return 'chat';
    if (ls === '1' || ls === 'true') return 'all';
  } catch {
    /* ignore */
  }
  return 'all';
}

function persistScopeFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get('trace');
    if (q === '0' || q === 'off' || q === 'false') {
      localStorage.setItem(LS_KEY, '0');
    } else if (q === 'chat' || q === '1' || q === 'true') {
      localStorage.setItem(LS_KEY, q === 'chat' ? 'chat' : '1');
    }
  } catch {
    /* ignore */
  }
}

function isTracing(name) {
  if (!scope) return false;
  if (scope === 'all') return true;
  return name.startsWith('chat:') || name.startsWith('admin:');
}

function autoTraceEnabled() {
  return scope === 'all';
}

function log(line, meta) {
  if (meta != null && typeof meta === 'object' && Object.keys(meta).length) {
    console.info(`[reave trace] ${line}`, meta);
  } else {
    console.info(`[reave trace] ${line}`);
  }
}

/** @param {string} line @param {Record<string, unknown>} [meta] */
export function traceRecord(line, meta) {
  if (!scope) return;
  log(line, meta);
  hudLine(line, meta);
}

function fetchPath(input) {
  try {
    const raw = typeof input === 'string' ? input : input?.url || String(input);
    const u = new URL(raw, window.location.origin);
    return u.pathname + (u.search ? u.search.split('&').slice(0, 1).join('') : '');
  } catch {
    return String(input).slice(0, 120);
  }
}

function shouldTraceFetch(path) {
  if (autoTraceEnabled()) return true;
  if (scope !== 'chat') return false;
  return path.startsWith('/api/admin/') || path.startsWith('/api/os-map/');
}

function installFetchTrace() {
  if (!scope || window.__reaveTraceFetchPatched) return;
  window.__reaveTraceFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = function traceFetch(input, init) {
    const path = fetchPath(input);
    if (!shouldTraceFetch(path)) return orig(input, init);
    const method = (init?.method || 'GET').toUpperCase();
    const t0 = performance.now();
    log(`→ fetch ${method} ${path}`);
    return orig(input, init).then(
      (res) => {
        const ms = Math.round(performance.now() - t0);
        const meta = { ms, method, path, status: res.status, ok: res.ok };
        log(`fetch ${method} ${path} ${ms}ms`, meta);
        hudLine(`fetch ${path}`, meta);
        return res;
      },
      (err) => {
        const ms = Math.round(performance.now() - t0);
        const meta = { ms, method, path, ok: false, err: err?.message || String(err) };
        log(`fetch ${method} ${path} FAILED ${ms}ms`, meta);
        hudLine(`fetch ${path}`, meta);
        throw err;
      },
    );
  };
}

function installLongTaskObserver() {
  if (!autoTraceEnabled() || typeof PerformanceObserver === 'undefined') return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ms = Math.round(entry.duration);
        if (ms < LONG_TASK_MS) continue;
        const meta = { ms, type: 'longtask' };
        log(`long task ${ms}ms`, meta);
        hudLine('long task (main thread blocked)', meta);
      }
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch {
    /* unsupported */
  }
}

function installResourceObserver() {
  if (!autoTraceEnabled() || typeof PerformanceObserver === 'undefined') return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ms = Math.round(entry.duration);
        if (ms < SLOW_RESOURCE_MS) continue;
        const short = String(entry.name || '').replace(window.location.origin, '');
        const meta = {
          ms,
          type: entry.initiatorType || 'resource',
          name: short.slice(0, 160),
        };
        log(`resource ${entry.initiatorType} ${ms}ms`, meta);
        hudLine(`resource ${entry.initiatorType}`, meta);
      }
    });
    po.observe({ type: 'resource', buffered: true });
  } catch {
    /* unsupported */
  }
}

function logNavigationTiming() {
  if (!scope) return;
  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav) return;
  const meta = {
    domInteractiveMs: nav.domInteractive ? Math.round(nav.domInteractive) : null,
    domContentLoadedMs: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadEventMs: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
    transferSize: nav.transferSize || null,
    encodedBodySize: nav.encodedBodySize || null,
    type: nav.type,
  };
  traceRecord('navigation', meta);
}

function logLoadSummary() {
  if (!scope) return;
  const resources = performance
    .getEntriesByType('resource')
    .filter((e) => e.duration >= SLOW_RESOURCE_MS)
    .map((e) => ({
      ms: Math.round(e.duration),
      type: e.initiatorType,
      name: String(e.name).replace(window.location.origin, '').slice(0, 120),
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12);
  if (resources.length) {
    traceRecord('slow resources (top)', { count: resources.length, resources });
  }
  traceSummary();
}

function installAutoTrace() {
  if (!autoTraceEnabled()) return;
  installFetchTrace();
  installLongTaskObserver();
  installResourceObserver();
  logNavigationTiming();
  window.addEventListener(
    'load',
    () => {
      window.setTimeout(logLoadSummary, 0);
    },
    { once: true },
  );
}

function isDeploymentOwnerClient() {
  return document.body?.dataset?.isOwner === '1';
}

function ensureHud() {
  if (!isDeploymentOwnerClient()) return null;
  const btn = document.getElementById(TRACE_BTN_ID);
  if (!btn) return null;
  if (btn.dataset.traceHudReady === '1') return btn;

  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-hidden', 'true');

    const title = document.createElement('div');
    title.dataset.traceTitle = '1';
    title.textContent = scope === 'chat' ? 'trace · chat' : 'trace · all';
    panel.appendChild(title);
    const body = document.createElement('div');
    body.dataset.traceBody = '1';
    panel.appendChild(body);
    btn.appendChild(panel);
  }

  const showPanel = () => {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
  };
  const hidePanel = () => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('mouseenter', showPanel);
  btn.addEventListener('mouseleave', hidePanel);
  btn.addEventListener('focusin', showPanel);
  btn.addEventListener('focusout', (e) => {
    if (!btn.contains(e.relatedTarget)) hidePanel();
  });

  btn.dataset.traceHudReady = '1';
  return btn;
}

function rowColor(ms) {
  if (ms == null) return '#e2e8f0';
  if (ms >= CRITICAL_MS) return '#fca5a5';
  if (ms >= WARN_MS) return '#fcd34d';
  return '#e2e8f0';
}

function hudLine(text, meta) {
  if (!isDeploymentOwnerClient()) return;
  ensureHud();
  const body = document.getElementById(PANEL_ID)?.querySelector('[data-trace-body]');
  if (!body) return;
  while (body.childElementCount >= MAX_HUD_ROWS) {
    body.firstElementChild?.remove();
  }
  const row = document.createElement('div');
  let extra = '';
  if (meta != null && typeof meta === 'object') {
    const bits = [];
    if (meta.ms != null) bits.push(`${meta.ms}ms`);
    if (meta.method != null) bits.push(String(meta.method));
    if (meta.status != null) bits.push(String(meta.status));
    if (meta.threads != null) bits.push(`${meta.threads} threads`);
    if (meta.messages != null) bits.push(`${meta.messages} msgs`);
    if (meta.tab != null) bits.push(String(meta.tab));
    if (meta.shellOnly) bits.push('shell only');
    if (meta.path != null && !text.includes(String(meta.path))) bits.push(String(meta.path).slice(0, 48));
    if (meta.restoreId) bits.push(String(meta.restoreId).slice(0, 8));
    if (meta.ok === false) bits.push('FAILED');
    if (bits.length) extra = ` · ${bits.join(' · ')}`;
  }
  row.textContent = `${text}${extra}`;
  row.style.color = rowColor(meta?.ms);
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
  if (entries.length) {
    const top = entries.slice(0, 8).map((e) => `${e.name} ${Math.round(e.ms)}ms`).join(' · ');
    hudLine('summary (slowest)', { ms: Math.round(entries[0].ms), detail: top });
  }
  return entries;
}


export function reportPreBootTiming() {
  if (!scope) return;
  const pageMark = performance.getEntriesByName('reave:admin:page', 'mark')[0];
  const evalStartMark = performance.getEntriesByName('reave:admin:os-map-loader:eval-start', 'mark')[0];
  const evalEndMark = performance.getEntriesByName('reave:admin:os-map-loader:eval-end', 'mark')[0];
  const traceStartMark = performance.getEntriesByName('reave:trace:start', 'mark')[0];
  const page = pageMark ? Math.round(pageMark.startTime) : null;
  const evalStart = evalStartMark ? Math.round(evalStartMark.startTime) : null;
  const evalEnd = evalEndMark ? Math.round(evalEndMark.startTime) : null;
  const traceStartMs = traceStartMark ? Math.round(traceStartMark.startTime) : null;
  const pageToTraceMs = page != null && traceStartMs != null ? traceStartMs - page : null;
  const pageToLoaderEvalMs = page != null && evalEnd != null ? evalEnd - page : null;
  const loaderParseMs = evalStart != null && evalEnd != null ? evalEnd - evalStart : null;
  let domContentLoadedMs = null;
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav?.domContentLoadedEventEnd) domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd);
  if (pageToLoaderEvalMs != null) {
    hudLine('pre-boot: page → loader ready', { ms: pageToLoaderEvalMs });
  }
  if (loaderParseMs != null) {
    hudLine('pre-boot: loader parse/eval', { ms: loaderParseMs });
  }
  if (domContentLoadedMs != null) {
    hudLine('pre-boot: DOMContentLoaded', { ms: domContentLoadedMs });
  }
  traceRecord('pre-boot (JS parse / download)', {
    pageToTraceMs,
    pageToLoaderEvalMs,
    loaderParseMs,
    domContentLoadedMs,
  });
}

/** Elapsed ms since the inline page mark (reave:admin:page). */
export function traceSincePage(name, meta) {
  if (!isTracing(name)) return;
  const pageMark = performance.getEntriesByName('reave:admin:page', 'mark')[0];
  const ms = pageMark ? Math.round(performance.now() - pageMark.startTime) : null;
  const merged = { ...(meta || {}), ms };
  log(`${name} @ ${ms != null ? `${ms}ms` : '?'} since page`, merged);
  hudLine(name, merged);
  try {
    performance.measure(`reave:${name}`, 'reave:admin:page');
  } catch {
    /* measure may already exist */
  }
}

export function initPerfTrace() {
  persistScopeFromUrl();
  scope = readScope();
  if (!scope) return false;
  performance.mark('reave:trace:start');
  log('enabled', {
    scope,
    hint: 'window.__reaveTrace.summary() · disable: localStorage.setItem("reave:trace","0")',
  });
  installAutoTrace();
  const mountHud = () => {
    if (isDeploymentOwnerClient()) ensureHud();
  };
  if (document.body) mountHud();
  else document.addEventListener('DOMContentLoaded', mountHud, { once: true });
  return true;
}

const enabled = initPerfTrace();

window.__reaveTrace = {
  enabled: () => !!scope,
  scope: () => scope,
  start: traceStart,
  async: traceAsync,
  record: traceRecord,
  sincePage: traceSincePage,
  summary: traceSummary,
  preBoot: reportPreBootTiming,
};

export { enabled as perfTraceEnabled };
