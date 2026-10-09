/**
 * Chat composer / dictation diagnostics.
 *
 * Enable (then hard-refresh admin):
 *   localStorage.setItem('reave:chat-compose-trace', '1')
 *   — or open admin with ?composeTrace=1 (persists to localStorage)
 *
 * Console filter: [reave compose]
 * Dump ring buffer: window.__reaveChatComposeTrace.dump()
 * Copy as JSON: window.__reaveChatComposeTrace.copy()
 * Disable: localStorage.removeItem('reave:chat-compose-trace')
 */

const LS_KEY = 'reave:chat-compose-trace';
const MAX_ROWS = 160;
const PREFIX = '[reave compose]';

/** @type {Array<{ t: number, event: string, level: string, detail?: Record<string, unknown>, snap?: Record<string, unknown> }>} */
const ring = [];

/** @type {() => Record<string, unknown>} */
let shellState = () => ({});

/** @type {() => Record<string, unknown>} */
let reactState = () => ({});

let enabled = false;

function persistFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get('composeTrace');
    if (q === '1' || q === 'true') localStorage.setItem(LS_KEY, '1');
    if (q === '0' || q === 'false') localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

function readEnabled() {
  try {
    if (localStorage.getItem(LS_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function composeTraceEnabled() {
  return enabled;
}

/** @param {() => Record<string, unknown>} fn */
export function registerComposeTraceShellState(fn) {
  shellState = typeof fn === 'function' ? fn : shellState;
}

/** @param {() => Record<string, unknown>} fn */
export function registerComposeTraceReactState(fn) {
  reactState = typeof fn === 'function' ? fn : reactState;
}

function inputEl() {
  return document.querySelector('#chat-panel .aui-input, .aui-root .aui-input');
}

export function composeTraceSnapshot() {
  const el = inputEl();
  const domText =
    el instanceof HTMLElement ? (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ') : '';
  let draftLen = 0;
  try {
    const raw = sessionStorage.getItem('reave:chat-compose-draft');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        draftLen = Object.values(parsed).reduce(
          (n, v) => n + (typeof v === 'string' ? v.length : 0),
          0,
        );
      }
    }
  } catch {
    /* ignore */
  }
  return {
    t: Math.round(performance.now()),
    domLen: domText.length,
    domPreview: domText.slice(0, 96),
    inputFocused: el instanceof HTMLElement && document.activeElement === el,
    hasThreadRoot: Boolean(document.querySelector('#ch-thread-root')),
    composing: Boolean(window.__reaveChatComposing),
    composeSession: Boolean(window.__reaveChatComposeSession),
    composeDirty: Boolean(window.__reaveChatComposeDirty),
    bodyComposeFocused: document.body.classList.contains('chat-compose-focused'),
    draftStorageChars: draftLen,
    hidden: document.hidden,
    ...shellState(),
    ...reactState(),
  };
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 * @param {'info' | 'warn' | 'error'} [level]
 * @param {{ snap?: boolean }} [opts]
 */
export function composeTrace(event, detail, level = 'info', opts = {}) {
  if (!enabled) return;
  const row = {
    t: Math.round(performance.now()),
    event,
    level,
    detail: detail && Object.keys(detail).length ? detail : undefined,
    snap: opts.snap ? composeTraceSnapshot() : undefined,
  };
  ring.push(row);
  if (ring.length > MAX_ROWS) ring.shift();

  const line = `${PREFIX} ${event}`;
  const meta = { ...row.detail, ...(row.snap ? { snap: row.snap } : {}) };
  if (level === 'warn') console.warn(line, Object.keys(meta).length ? meta : '');
  else if (level === 'error') console.error(line, Object.keys(meta).length ? meta : '');
  else console.info(line, Object.keys(meta).length ? meta : '');
}

export function composeTraceDump() {
  console.groupCollapsed(`${PREFIX} dump (${ring.length} events)`);
  for (const row of ring) console.log(row);
  console.groupEnd();
  return ring.slice();
}

export async function composeTraceCopy() {
  const payload = JSON.stringify({ at: new Date().toISOString(), events: ring }, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    composeTrace('trace.copied', { bytes: payload.length }, 'info');
    return true;
  } catch {
    composeTrace('trace.copy-failed', {}, 'warn');
    console.info(payload);
    return false;
  }
}

function init() {
  persistFromUrl();
  enabled = readEnabled();
  if (!enabled) return;
  composeTrace(
    'trace.enabled',
    {
      hint: 'dump: window.__reaveChatComposeTrace.dump() · copy: .copy() · off: localStorage.removeItem("reave:chat-compose-trace")',
    },
    'warn',
    { snap: true },
  );

  window.addEventListener('reave:chat-compose-active', (ev) => {
    composeTrace('event.compose-active', { active: ev.detail !== false }, 'info');
  });

  window.addEventListener('beforeunload', () => {
    composeTrace('page.beforeunload', {}, 'warn', { snap: true });
  });

  document.addEventListener(
    'visibilitychange',
    () => {
      composeTrace(`page.visibility.${document.visibilityState}`, {}, document.hidden ? 'warn' : 'info', {
        snap: document.hidden,
      });
    },
    true,
  );
}

init();

window.__reaveChatComposeTrace = {
  enabled: () => enabled,
  log: composeTrace,
  snapshot: composeTraceSnapshot,
  dump: composeTraceDump,
  copy: composeTraceCopy,
  registerShellState: registerComposeTraceShellState,
  registerReactState: registerComposeTraceReactState,
};
