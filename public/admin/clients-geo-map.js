/**
 * Standalone admin client geo map — Mapbox multi-marker with kind (status) filters.
 */

import { mountListFilterTabs } from './filter-tabs.js?v=20260807b';
import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260808k';

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';

const CLIENT_KINDS = ['professional', 'service', 'personal', 'proposed'];
const CLIENT_KIND_LABELS = {
  professional: 'Client',
  service: 'Service',
  personal: 'Personal',
  proposed: 'Proposed',
};

const KIND_COLORS = {
  professional: '#3b82f6',
  service: '#22c55e',
  personal: '#a78bfa',
  proposed: '#38bdf8',
};

let mapboxLoadPromise = null;

function ensureMapboxCss() {
  if (document.querySelector('link[data-cgm-mapbox-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPBOX_CSS;
  link.setAttribute('data-cgm-mapbox-css', '1');
  document.head.appendChild(link);
}

async function loadMapboxGl() {
  ensureMapboxCss();
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then((mod) => mod.default || mod);
  }
  return mapboxLoadPromise;
}

function normalizeKind(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return CLIENT_KINDS.includes(v) ? v : 'professional';
}

function kindColor(kind) {
  return KIND_COLORS[normalizeKind(kind)] || KIND_COLORS.professional;
}

function displayName(c) {
  return (c.company || '').trim() || (c.name || '').trim() || 'Client';
}

/**
 * @param {HTMLElement} container
 * @param {{ token?: string }} opts
 */
export function mountClientsGeoMap(container, opts = {}) {
  let clients = [];
  let counts = { all: 0, professional: 0, service: 0, proposed: 0, personal: 0, located: 0 };
  let filter = 'all';
  let destroyed = false;
  let mapReady = false;
  /** @type {typeof import('mapbox-gl') | null} */
  let mapboxgl = null;
  /** @type {import('mapbox-gl').Map | null} */
  let map = null;
  /** @type {Map<string, import('mapbox-gl').Marker>} */
  const markers = new Map();
  let activeUid = null;

  container.classList.add('cgm-root');
  container.innerHTML = `
    <header class="cgm-header">
      <a class="cgm-back" href="/admin/?tab=clients">← Clients</a>
      <div class="cgm-header-text">
        <h1 class="cgm-title">Client map</h1>
        <p class="cgm-subtitle">All clients with saved addresses, filtered by status.</p>
      </div>
      <div class="cgm-stats" id="cgm-stats" aria-live="polite"></div>
    </header>
    <div class="cgm-filters" id="cgm-filters"></div>
    <div class="cgm-layout">
      <div class="cgm-map-host" id="cgm-map-host" role="img" aria-label="Client locations map"></div>
      <aside class="cgm-sidebar">
        <h2 class="cgm-sidebar-title">Clients</h2>
        <ul class="cgm-list" id="cgm-list"></ul>
      </aside>
    </div>
    <div class="cgm-status" id="cgm-status" hidden></div>
  `;

  const filtersEl = container.querySelector('#cgm-filters');
  const mapHost = container.querySelector('#cgm-map-host');
  const listEl = container.querySelector('#cgm-list');
  const statsEl = container.querySelector('#cgm-stats');
  const statusEl = container.querySelector('#cgm-status');

  const emptyEl = document.createElement('div');
  emptyEl.className = 'cgm-map-empty';
  emptyEl.textContent = 'No clients with map pins in this filter.';
  mapHost.appendChild(emptyEl);

  const mapEl = document.createElement('div');
  mapEl.className = 'cgm-map-canvas';
  mapHost.appendChild(mapEl);

  function filteredClients() {
    if (filter === 'all') return clients;
    return clients.filter((c) => normalizeKind(c.kind) === filter);
  }

  function locatedClients(list = filteredClients()) {
    return list.filter(
      (c) =>
        c.geo &&
        Number.isFinite(c.geo.lat) &&
        Number.isFinite(c.geo.lng),
    );
  }

  function setStatus(msg, isError = false) {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('cgm-status--error');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle('cgm-status--error', isError);
  }

  function renderStats() {
    const visible = filteredClients();
    const located = locatedClients(visible).length;
    statsEl.innerHTML = `
      <span><strong>${located}</strong> on map</span>
      <span><strong>${visible.length}</strong> in filter</span>
      <span><strong>${counts.located}</strong> located total</span>
    `;
  }

  function renderFilters() {
    const tabs = mountListFilterTabs({
      tabs: [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'professional', label: 'Client', count: counts.professional },
        { id: 'service', label: 'Service', count: counts.service },
        { id: 'proposed', label: 'Proposed', count: counts.proposed },
        { id: 'personal', label: 'Personal', count: counts.personal },
      ],
      activeId: filter,
      ariaLabel: 'Client status filters',
      onSelect(tabId) {
        filter = tabId;
        renderFilters();
        renderList();
        renderMarkers();
        renderStats();
      },
    });
    filtersEl.replaceChildren(tabs);
  }

  function renderList() {
    const visible = filteredClients();
    listEl.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'cgm-list-empty';
      empty.textContent = 'No clients in this status.';
      listEl.appendChild(empty);
      return;
    }
    for (const c of visible) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cgm-list-item';
      if (c.uid === activeUid) btn.classList.add('is-active');
      if (!c.located) btn.classList.add('is-unlocated');
      const kind = normalizeKind(c.kind);
      btn.innerHTML = `
        <span class="cgm-list-dot" style="background:${kindColor(kind)}"></span>
        <span class="cgm-list-main">
          <span class="cgm-list-name">${escHtml(displayName(c))}</span>
          <span class="cgm-list-meta">${escHtml(c.address || (c.located ? 'Pinned' : 'No address'))}</span>
        </span>
        <span class="cgm-list-kind">${escHtml(CLIENT_KIND_LABELS[kind])}</span>
      `;
      btn.addEventListener('click', () => {
        activeUid = c.uid;
        renderList();
        focusClient(c);
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  }

  function clearMarkers() {
    for (const marker of markers.values()) marker.remove();
    markers.clear();
  }

  function focusClient(c) {
    if (!map || !mapReady || !c?.geo) return;
    map.flyTo({ center: [c.geo.lng, c.geo.lat], zoom: Math.max(map.getZoom(), 13) });
    const marker = markers.get(c.uid);
    marker?.togglePopup();
  }

  function fitBounds() {
    if (!map || !mapReady || !mapboxgl) return;
    const located = locatedClients();
    if (!located.length) return;
    if (located.length === 1) {
      map.flyTo({ center: [located[0].geo.lng, located[0].geo.lat], zoom: 12 });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const c of located) bounds.extend([c.geo.lng, c.geo.lat]);
    map.fitBounds(bounds, { padding: 56, maxZoom: 13 });
  }

  function renderMarkers() {
    if (!map || !mapReady || !mapboxgl) {
      emptyEl.hidden = locatedClients().length > 0;
      return;
    }
    clearMarkers();
    const located = locatedClients();
    emptyEl.hidden = located.length > 0;
    mapEl.hidden = located.length === 0;

    for (const c of located) {
      const kind = normalizeKind(c.kind);
      const el = document.createElement('div');
      el.className = 'cgm-marker';
      el.style.background = kindColor(kind);
      el.title = displayName(c);
      const popupHtml = `
        <strong>${escHtml(displayName(c))}</strong><br>
        <span>${escHtml(CLIENT_KIND_LABELS[kind])}</span>
        ${c.address ? `<br>${escHtml(c.address)}` : ''}
        <br><a href="/admin/?tab=clients&amp;client=${encodeURIComponent(c.uid)}">Open client</a>
      `;
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([c.geo.lng, c.geo.lat])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(popupHtml))
        .addTo(map);
      el.addEventListener('click', () => {
        activeUid = c.uid;
        renderList();
      });
      markers.set(c.uid, marker);
    }
    fitBounds();
  }

  async function ensureMap() {
    const token = (opts.token || window.__mapboxAccessToken || '').trim();
    if (!token) {
      setStatus('Mapbox access token is not configured.', true);
      emptyEl.textContent = 'Mapbox token missing — set PUBLIC_MAPBOX_ACCESS_TOKEN.';
      emptyEl.hidden = false;
      mapEl.hidden = true;
      return;
    }
    if (map || destroyed) return;
    try {
      const gl = await loadMapboxGl();
      mapboxgl = gl;
      if (destroyed) return;
      gl.accessToken = token;
      map = new gl.Map({
        container: mapEl,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-98.5795, 39.8283],
        zoom: 3.5,
        attributionControl: true,
      });
      map.addControl(new gl.NavigationControl({ visualizePitch: false }), 'top-right');
      map.on('load', () => {
        if (destroyed) return;
        mapReady = true;
        renderMarkers();
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true);
      emptyEl.textContent = 'Could not load Mapbox.';
      emptyEl.hidden = false;
      mapEl.hidden = true;
    }
  }

  async function loadClients() {
    setStatus('Loading clients…');
    try {
      const res = await adminFetch('/api/clients/map', { cache: 'no-store' });
      const data = await readAdminJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      clients = Array.isArray(data.clients) ? data.clients : [];
      counts = {
        all: data.counts?.all ?? clients.length,
        professional: data.counts?.professional ?? 0,
        service: data.counts?.service ?? 0,
        proposed: data.counts?.proposed ?? 0,
        personal: data.counts?.personal ?? 0,
        located: data.counts?.located ?? clients.filter((c) => c.located).length,
      };
      setStatus('');
      renderFilters();
      renderList();
      renderStats();
      await ensureMap();
      if (mapReady) renderMarkers();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true);
    }
  }

  function resize() {
    map?.resize();
  }

  function destroy() {
    destroyed = true;
    clearMarkers();
    map?.remove();
    map = null;
    mapReady = false;
    window.removeEventListener('resize', resize);
  }

  window.addEventListener('resize', resize);
  void loadClients();

  return { destroy, reload: loadClients, resize };
}

// Auto-mount when loaded as the page module.
const root = document.getElementById('clients-geo-map');
if (root) {
  mountClientsGeoMap(root, {
    token: window.__mapboxAccessToken || root.dataset.mapboxToken || '',
  });
}
