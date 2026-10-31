/**
 * Work Day field PWA — toggle, project picker, GPS pings.
 */

const state = {
  projects: [],
  clients: [],
  session: null,
  selectedJobSlug: '',
  selectedContactUid: '',
  watchId: null,
  wakeLock: null,
  tickTimer: null,
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  if (els.status) els.status.textContent = msg || '';
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || res.statusText || 'Request failed';
    throw new Error(err);
  }
  return data;
}

function isSessionActive() {
  return state.session && state.session.status === 'active';
}

function openSegment() {
  return state.session?.openSegment || null;
}

function segmentStartedAt() {
  const seg = openSegment();
  if (seg?.startedAt) return new Date(seg.startedAt).getTime();
  if (state.session?.startedAt) return new Date(state.session.startedAt).getTime();
  return null;
}

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateElapsed() {
  if (!els.elapsed) return;
  if (!isSessionActive()) {
    els.elapsed.textContent = '';
    return;
  }
  const start = segmentStartedAt();
  els.elapsed.textContent = start ? formatElapsed(Date.now() - start) : '';
}

async function loadClients() {
  const data = await api('/api/work-day/clients?limit=200');
  state.clients = data.clients || [];
  renderClientFilter();
}

async function loadProjects() {
  const contact = state.selectedContactUid || els.clientFilter?.value || '';
  const q = els.projectSearch?.value?.trim() || '';
  let path = '/api/work-day/projects?';
  if (contact) path += `contact=${encodeURIComponent(contact)}&`;
  if (q) path += `q=${encodeURIComponent(q)}&`;
  const data = await api(path);
  state.projects = data.projects || [];
  renderProjectSelect();
}

function renderClientFilter() {
  if (!els.clientFilter) return;
  els.clientFilter.innerHTML =
    '<option value="">All clients</option>' +
    state.clients
      .map((c) => `<option value="${escapeAttr(c.uid)}">${escapeHtml(c.name || c.uid)}</option>`)
      .join('');
  if (state.selectedContactUid) els.clientFilter.value = state.selectedContactUid;
}

function renderProjectSelect() {
  if (!els.projectSelect) return;
  const cur = state.selectedJobSlug;
  els.projectSelect.innerHTML =
    '<option value="">Select project…</option>' +
    state.projects
      .map((p) => {
        const site = p.siteAddress ? ` — ${p.siteAddress}` : '';
        return `<option value="${escapeAttr(p.slug)}">${escapeHtml(p.title)}${escapeHtml(site)}</option>`;
      })
      .join('');
  if (cur && state.projects.some((p) => p.slug === cur)) els.projectSelect.value = cur;
  if (els.toggle) els.toggle.disabled = !isSessionActive() && !state.selectedJobSlug;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function syncUiFromSession() {
  const active = isSessionActive();
  if (els.toggle) {
    els.toggle.textContent = active ? 'Work off' : 'Work on';
    els.toggle.classList.toggle('is-on', active);
    els.toggle.disabled = !active && !state.selectedJobSlug;
  }
  const seg = openSegment();
  if (seg?.jobSlug) {
    state.selectedJobSlug = seg.jobSlug;
    if (els.projectSelect) els.projectSelect.value = state.selectedJobSlug;
  }
  if (els.projectSelect) els.projectSelect.disabled = active;
  if (els.clientFilter) els.clientFilter.disabled = active;
  updateElapsed();
}

async function refreshSession() {
  const data = await api('/api/work-day/session');
  state.session = data.session;
  syncUiFromSession();
  if (isSessionActive()) startTracking();
  else stopTracking();
}

async function onToggle() {
  if (isSessionActive()) {
    setStatus('Ending work day…');
    await api('/api/work-day/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'stop' }),
    });
    setStatus('Work day ended.');
    await refreshSession();
    return;
  }
  const jobSlug = state.selectedJobSlug || els.projectSelect?.value;
  if (!jobSlug) {
    setStatus('Pick a project first.');
    return;
  }
  setStatus('Starting work day…');
  await api('/api/work-day/session', {
    method: 'POST',
    body: JSON.stringify({ action: 'start', jobSlug }),
  });
  setStatus('Work day active — GPS on while this screen stays open.');
  await refreshSession();
}

async function onProjectChange() {
  state.selectedJobSlug = els.projectSelect?.value || '';
  if (els.toggle) els.toggle.disabled = !isSessionActive() && !state.selectedJobSlug;
  if (isSessionActive() && state.selectedJobSlug) {
    await api('/api/work-day/session/segment', {
      method: 'PATCH',
      body: JSON.stringify({ jobSlug: state.selectedJobSlug }),
    });
    await refreshSession();
    setStatus('Switched project.');
  }
}

function pingLocation(position) {
  void api('/api/work-day/location', {
    method: 'POST',
    body: JSON.stringify({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    }),
  }).catch(() => {});
}

function startTracking() {
  if (!navigator.geolocation) return;
  if (state.watchId != null) return;
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => pingLocation(pos),
    () => {},
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
  );
  void requestWakeLock();
  if (!state.tickTimer) state.tickTimer = window.setInterval(updateElapsed, 1000);
}

function stopTracking() {
  if (state.watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  releaseWakeLock();
  if (state.tickTimer) {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
  }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !state.wakeLock) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
      });
    }
  } catch {
    /* ignore */
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    void state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
}

function openSheet(id) {
  const sheet = $(id);
  if (sheet) sheet.classList.add('is-open');
}

function closeSheet(id) {
  const sheet = $(id);
  if (sheet) sheet.classList.remove('is-open');
}

async function submitNewClient(ev) {
  ev.preventDefault();
  const name = $('field-new-client-name')?.value?.trim();
  const phone = $('field-new-client-phone')?.value?.trim();
  if (!name) return;
  setStatus('Creating client…');
  await api('/api/work-day/clients', {
    method: 'POST',
    body: JSON.stringify({ name, phone: phone || undefined }),
  });
  await loadClients();
  closeSheet('field-sheet-client');
  setStatus('Client added — create a project in admin and set its Address tab.');
}

function maybeShowInstallHint() {
  const key = 'reave-field-pwa-hint';
  try {
    if (localStorage.getItem(key)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
  } catch {
    return;
  }
  if (els.installHint) {
    els.installHint.hidden = false;
    els.installHint.textContent =
      'Install: Share → Add to Home Screen for a full-screen Work Day app.';
  }
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export function initWorkDayApp() {
  els.toggle = $('field-toggle');
  els.projectSelect = $('field-project-select');
  els.clientFilter = $('field-client-filter');
  els.projectSearch = $('field-project-search');
  els.status = $('field-status');
  els.elapsed = $('field-elapsed');
  els.installHint = $('field-install-hint');

  els.toggle?.addEventListener('click', () => void onToggle().catch((e) => setStatus(e.message)));
  els.projectSelect?.addEventListener('change', () =>
    void onProjectChange().catch((e) => setStatus(e.message)),
  );
  els.clientFilter?.addEventListener('change', () => {
    state.selectedContactUid = els.clientFilter?.value || '';
    void loadProjects().catch((e) => setStatus(e.message));
  });
  els.projectSearch?.addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => void loadProjects(), 300);
  });

  $('field-add-client')?.addEventListener('click', () => openSheet('field-sheet-client'));
  document.querySelectorAll('[data-field-sheet-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-field-sheet-close');
      if (id) closeSheet(id);
    });
  });
  $('field-new-client-form')?.addEventListener('submit', (ev) =>
    void submitNewClient(ev).catch((e) => setStatus(e.message)),
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSessionActive()) void requestWakeLock();
  });

  maybeShowInstallHint();

  void loadClients()
    .then(() => loadProjects())
    .then(() => refreshSession())
    .catch((e) => setStatus(e.message));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkDayApp);
} else {
  initWorkDayApp();
}
