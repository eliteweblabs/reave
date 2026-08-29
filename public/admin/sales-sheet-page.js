import {
  initSidebarLayout,
  initTextareaCopyButtons,
  syncAdminSplitView,
  ADMIN_SPLIT_VIEW_MQ,
} from './admin-ui.js?v=20260825h';

initSidebarLayout();
initTextareaCopyButtons();
const sync = () => syncAdminSplitView('sales-sheet');
sync();
ADMIN_SPLIT_VIEW_MQ.addEventListener('change', sync);

const FOOTER_TABS = {
  dashboard: 'dashboard',
  chat: 'chats',
  inbox: 'email',
  schedule: 'schedule',
  work: 'work',
  todo: 'todo',
  clients: 'clients',
};

document.querySelectorAll('.footer-nav-btn[data-nav]').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    const tab = FOOTER_TABS[btn.getAttribute('data-nav') || ''];
    if (!tab) return;
    event.preventDefault();
    location.assign(`/admin/?tab=${tab}`);
  });
});

const WAIT_LINES = [
  'Waiting on the server…',
  'Reading the audit…',
  'Checking the live URL…',
  'Capturing exhibits…',
  'Laying out four phones…',
];

let renderTimer = null;
let renderStartedAt = 0;
let waitStep = 0;

function liveList() {
  return document.getElementById('ss-render-live');
}

function appendLive(line, failed = false) {
  const list = liveList();
  if (!list) return;
  const li = document.createElement('li');
  if (failed || /fail|error|timeout/i.test(line)) li.className = 'ss-log-fail';
  li.textContent = line;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

function stopRenderClock() {
  if (renderTimer != null) {
    clearInterval(renderTimer);
    renderTimer = null;
  }
}

function startRenderClock() {
  stopRenderClock();
  renderStartedAt = Date.now();
  waitStep = 0;
  const timeEl = document.getElementById('ss-render-time');
  const list = liveList();
  if (list) list.replaceChildren();
  appendLive(WAIT_LINES[0]);
  if (timeEl) timeEl.textContent = '0s';
  renderTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - renderStartedAt) / 1000);
    if (timeEl) timeEl.textContent = `${secs}s`;
    const next = Math.min(WAIT_LINES.length - 1, Math.floor(secs / 4));
    if (next > waitStep) {
      waitStep = next;
      appendLive(WAIT_LINES[waitStep]);
    }
  }, 250);
}

function renderTitle() {
  return document.querySelector('#ss-busy-mask .ss-render-title');
}

function renderDismiss() {
  return document.getElementById('ss-render-dismiss');
}

function setUpdateEnabled(on) {
  const updateBtn = document.getElementById('ss-update');
  if (!updateBtn) return;
  updateBtn.disabled = !on;
  updateBtn.textContent = on ? 'Update sheet' : 'Rendering…';
}

function hideMask() {
  document.body.classList.remove('ss-busy', 'ss-render-failed');
  const mask = document.getElementById('ss-busy-mask');
  if (mask) mask.hidden = true;
  const title = renderTitle();
  if (title) title.textContent = 'Rendering';
  const dismiss = renderDismiss();
  if (dismiss) dismiss.hidden = true;
  setUpdateEnabled(true);
  stopRenderClock();
}

function setBusy(on) {
  if (!on) {
    hideMask();
    return;
  }
  document.body.classList.remove('ss-render-failed');
  document.body.classList.add('ss-busy');
  const mask = document.getElementById('ss-busy-mask');
  const title = renderTitle();
  const dismiss = renderDismiss();
  if (mask) mask.hidden = false;
  if (title) title.textContent = 'Rendering';
  if (dismiss) dismiss.hidden = true;
  setUpdateEnabled(false);
  startRenderClock();
}

function failRender(message) {
  stopRenderClock();
  appendLive(message, true);
  document.body.classList.remove('ss-busy');
  document.body.classList.add('ss-render-failed');
  const mask = document.getElementById('ss-busy-mask');
  const title = renderTitle();
  const dismiss = renderDismiss();
  if (mask) mask.hidden = false;
  if (title) title.textContent = 'Render failed';
  if (dismiss) dismiss.hidden = false;
  setUpdateEnabled(true);
}

function formQuery(form) {
  const data = new FormData(form);
  const google = form.querySelector('#google');
  if (google && !google.checked) data.set('google', '0');
  const q = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (value === '' && key === 'run') continue;
    q.set(key, String(value));
  }
  return q;
}

async function renderSheet(url) {
  setBusy(true);
  history.pushState({}, '', url);
  try {
    const res = await fetch(url, { headers: { Accept: 'text/html' } });
    const html = await res.text();
    if (!res.ok) {
      failRender(`FAIL HTTP ${res.status}`);
      return;
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const next = doc.querySelector('#sales-sheet-editor');
    const cur = document.querySelector('#sales-sheet-editor');
    if (!next || !cur) {
      failRender('FAIL could not parse the rendered sheet');
      return;
    }
    cur.replaceWith(next);
    document.title = doc.title;
    initSidebarLayout();
    sync();
    setBusy(false);
  } catch (err) {
    failRender(`FAIL ${err instanceof Error ? err.message : String(err)}`);
  }
}

document.addEventListener('click', (event) => {
  const btn = event.target instanceof Element ? event.target.closest('#ss-render-dismiss') : null;
  if (!btn) return;
  hideMask();
});

function applyBadLogoCallout(on) {
  const logo = document.querySelector('#sales-sheet-editor .ss-logo');
  if (!logo) return;
  if (on) logo.setAttribute('data-ss-bad-logo', '1');
  else logo.removeAttribute('data-ss-bad-logo');
}

document.addEventListener('change', (event) => {
  const box = event.target;
  if (box instanceof HTMLInputElement && box.id === 'badLogo') {
    applyBadLogoCallout(box.checked);
    const url = new URL(location.href);
    if (box.checked) url.searchParams.set('badLogo', '1');
    else url.searchParams.delete('badLogo');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return;
  }
  const run = event.target;
  if (!(run instanceof HTMLSelectElement) || run.id !== 'run') return;
  const form = document.getElementById('ss-form');
  if (!(form instanceof HTMLFormElement)) return;
  const q = new URLSearchParams();
  if (run.value) q.set('run', run.value);
  const ori = document.getElementById('orientation');
  if (ori instanceof HTMLSelectElement && ori.value && ori.value !== 'landscape') {
    q.set('orientation', ori.value);
  }
  const google = document.getElementById('google');
  if (google instanceof HTMLInputElement && !google.checked) q.set('google', '0');
  else if (google instanceof HTMLInputElement && google.checked && !run.value) q.set('google', '1');
  const badLogo = document.getElementById('badLogo');
  if (badLogo instanceof HTMLInputElement && badLogo.checked) q.set('badLogo', '1');
  void renderSheet('/admin/sales-sheet' + (q.toString() ? `?${q}` : ''));
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'ss-form') return;
  event.preventDefault();
  const q = formQuery(form);
  void renderSheet('/admin/sales-sheet' + (q.toString() ? `?${q}` : ''));
});
