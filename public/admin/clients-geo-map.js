/**
 * Full-bleed admin client geo map — Mapbox markers with status toggles.
 */

import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260810a';

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';

const CLIENT_KINDS = ['professional', 'service', 'proposed', 'personal'];
const CLIENT_KIND_LABELS = {
  professional: 'Client',
  service: 'Service',
  personal: 'Personal',
  proposed: 'Proposed',
};

const KIND_COLORS = {
  professional: '#2563eb',
  service: '#16a34a',
  personal: '#7c3aed',
  proposed: '#0284c7',
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
  return (c.company || '').trim() || (c.name || '').trim() || 'Contact';
}

function pinInitial(c) {
  const name = displayName(c);
  const ch = name.replace(/^the\s+/i, '').trim().charAt(0);
  return (ch || '?').toUpperCase();
}

function pinIconUrl(c) {
  const icon = typeof c.iconUrl === 'string' ? c.iconUrl.trim() : '';
  if (icon) return icon;
  const logo = typeof c.logoUrl === 'string' ? c.logoUrl.trim() : '';
  return logo || '';
}

/**
 * @param {HTMLElement} container
 * @param {{ token?: string }} opts
 */
export function mountClientsGeoMap(container, opts = {}) {
  let clients = [];
  let counts = { all: 0, professional: 0, service: 0, proposed: 0, personal: 0, located: 0 };
  /** @type {Record<string, boolean>} */
  const enabledKinds = {
    professional: true,
    service: true,
    proposed: true,
    personal: true,
  };
  let destroyed = false;
  let mapReady = false;
  /** @type {typeof import('mapbox-gl') | null} */
  let mapboxgl = null;
  /** @type {import('mapbox-gl').Map | null} */
  let map = null;
  /** @type {Map<string, import('mapbox-gl').Marker>} */
  const markers = new Map();
  let activeUid = null;
  let fitOnce = false;

  container.classList.add('cgm-root');
  container.innerHTML = `
    <div class="cgm-map-host" id="cgm-map-host" role="img" aria-label="Contact locations map"></div>
    <div class="cgm-chrome">
      <a class="cgm-back" href="/admin/?tab=clients">← Contacts</a>
      <div class="cgm-chrome-panel">
        <div class="cgm-chrome-top">
          <h1 class="cgm-title">Contact map</h1>
          <p class="cgm-count" id="cgm-count" aria-live="polite">Loading…</p>
        </div>
        <div class="cgm-toggles" id="cgm-toggles" role="group" aria-label="Status toggles"></div>
      </div>
    </div>
    <div class="cgm-status" id="cgm-status" hidden></div>
  `;

  const mapHost = /** @type {HTMLElement} */ (container.querySelector('#cgm-map-host'));
  const togglesEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-toggles'));
  const countEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-count'));
  const statusEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-status'));

  const emptyEl = document.createElement('div');
  emptyEl.className = 'cgm-map-empty';
  emptyEl.textContent = 'No mapped contacts for the statuses you have on.';
  mapHost.appendChild(emptyEl);

  const mapEl = document.createElement('div');
  mapEl.className = 'cgm-map-canvas';
  mapHost.appendChild(mapEl);

  function visibleClients() {
    return clients.filter((c) => enabledKinds[normalizeKind(c.kind)]);
  }

  function locatedClients(list = visibleClients()) {
    return list.filter(
      (c) => c.geo && Number.isFinite(c.geo.lat) && Number.isFinite(c.geo.lng),
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

  function renderCount() {
    const located = locatedClients().length;
    const onKinds = CLIENT_KINDS.filter((k) => enabledKinds[k]).length;
    countEl.textContent =
      located === 1
        ? `1 pin · ${onKinds}/4 on`
        : `${located} pins · ${onKinds}/4 on`;
  }

  function syncToggleRow(row, kind) {
    const on = !!enabledKinds[kind];
    row.classList.toggle('is-on', on);
    const input = row.querySelector('input');
    if (input instanceof HTMLInputElement) input.checked = on;
    const countNode = row.querySelector('.cgm-toggle-count');
    if (countNode) countNode.textContent = String(counts[kind] ?? 0);
  }

  function setKindEnabled(kind, next) {
    enabledKinds[kind] = next;
    if (!CLIENT_KINDS.some((k) => enabledKinds[k])) {
      enabledKinds[kind] = true;
    }
    for (const row of togglesEl.querySelectorAll('.cgm-toggle')) {
      const k = row.getAttribute('data-kind');
      if (k) syncToggleRow(/** @type {HTMLElement} */ (row), k);
    }
    renderMarkers({ refit: true });
    renderCount();
  }

  function renderToggles() {
    togglesEl.replaceChildren();
    for (const kind of CLIENT_KINDS) {
      const row = document.createElement('label');
      row.className = 'cgm-toggle';
      row.dataset.kind = kind;
      row.style.setProperty('--cgm-kind', kindColor(kind));

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'cgm-toggle-input';
      input.checked = !!enabledKinds[kind];
      input.setAttribute('aria-label', `${CLIENT_KIND_LABELS[kind]} status`);

      const track = document.createElement('span');
      track.className = 'cgm-toggle-track';
      track.setAttribute('aria-hidden', 'true');

      const meta = document.createElement('span');
      meta.className = 'cgm-toggle-meta';
      meta.innerHTML = `
        <span class="cgm-toggle-dot" style="background:${kindColor(kind)}"></span>
        <span class="cgm-toggle-label">${escHtml(CLIENT_KIND_LABELS[kind])}</span>
        <span class="cgm-toggle-count">${counts[kind] ?? 0}</span>
      `;

      input.addEventListener('change', () => {
        setKindEnabled(kind, input.checked);
      });

      row.appendChild(input);
      row.appendChild(track);
      row.appendChild(meta);
      syncToggleRow(row, kind);
      togglesEl.appendChild(row);
    }
  }

  function clearMarkers() {
    for (const marker of markers.values()) marker.remove();
    markers.clear();
  }

  function buildMarkerElement(c) {
    const kind = normalizeKind(c.kind);
    const color = kindColor(kind);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cgm-pin';
    el.style.setProperty('--cgm-kind', color);
    el.title = displayName(c);
    el.setAttribute('aria-label', displayName(c));

    const face = document.createElement('span');
    face.className = 'cgm-pin-face';

    const iconUrl = pinIconUrl(c);
    if (iconUrl) {
      const img = document.createElement('img');
      img.className = 'cgm-pin-icon';
      img.src = iconUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener(
        'error',
        () => {
          face.replaceChildren();
          face.textContent = pinInitial(c);
          face.classList.add('cgm-pin-face--initial');
        },
        { once: true },
      );
      face.appendChild(img);
    } else {
      face.textContent = pinInitial(c);
      face.classList.add('cgm-pin-face--initial');
    }

    const tip = document.createElement('span');
    tip.className = 'cgm-pin-tip';
    tip.setAttribute('aria-hidden', 'true');

    el.appendChild(face);
    el.appendChild(tip);
    return el;
  }

  function fitBounds() {
    if (!map || !mapReady || !mapboxgl) return;
    const located = locatedClients();
    if (!located.length) return;
    if (located.length === 1) {
      map.flyTo({ center: [located[0].geo.lng, located[0].geo.lat], zoom: 13 });
      fitOnce = true;
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const c of located) bounds.extend([c.geo.lng, c.geo.lat]);
    map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: fitOnce ? 650 : 0 });
    fitOnce = true;
  }

  function renderMarkers({ refit = false } = {}) {
    if (!map || !mapReady || !mapboxgl) {
      emptyEl.hidden = locatedClients().length > 0;
      return;
    }

    clearMarkers();
    const located = locatedClients();
    emptyEl.hidden = located.length > 0;

    for (const c of located) {
      const kind = normalizeKind(c.kind);
      const el = buildMarkerElement(c);
      const popupHtml = `
        <div class="cgm-popup">
          <strong>${escHtml(displayName(c))}</strong>
          <span class="cgm-popup-kind">${escHtml(CLIENT_KIND_LABELS[kind])}</span>
          ${c.address ? `<span class="cgm-popup-addr">${escHtml(c.address)}</span>` : ''}
          <a href="/admin/?tab=clients&amp;client=${encodeURIComponent(c.uid)}">Open contact</a>
        </div>
      `;
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([c.geo.lng, c.geo.lat])
        .setPopup(new mapboxgl.Popup({ offset: 18, maxWidth: '240px' }).setHTML(popupHtml))
        .addTo(map);

      el.addEventListener('click', () => {
        activeUid = c.uid;
        container.querySelectorAll('.cgm-pin.is-active').forEach((n) => n.classList.remove('is-active'));
        el.classList.add('is-active');
      });
      if (c.uid === activeUid) el.classList.add('is-active');
      markers.set(c.uid, marker);
    }

    if (refit || !fitOnce) fitBounds();
    map.resize();
  }

  async function ensureMap() {
    const token = (opts.token || window.__mapboxAccessToken || '').trim();
    if (!token) {
      setStatus('Mapbox access token is not configured.', true);
      emptyEl.textContent = 'Mapbox token missing — set PUBLIC_MAPBOX_ACCESS_TOKEN.';
      emptyEl.hidden = false;
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
      map.addControl(new gl.NavigationControl({ visualizePitch: false }), 'bottom-right');
      map.on('load', () => {
        if (destroyed) return;
        mapReady = true;
        renderMarkers({ refit: true });
      });
      requestAnimationFrame(() => map?.resize());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true);
      emptyEl.textContent = 'Could not load Mapbox.';
      emptyEl.hidden = false;
    }
  }

  async function loadClients() {
    setStatus('Loading contacts…');
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
      // Refresh counts on the already-mounted toggles.
      for (const row of togglesEl.querySelectorAll('.cgm-toggle')) {
        const k = row.getAttribute('data-kind');
        if (k) syncToggleRow(/** @type {HTMLElement} */ (row), k);
      }
      renderCount();
      await ensureMap();
      if (mapReady) renderMarkers({ refit: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), true);
      renderCount();
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

  // Mount toggles immediately so a slow/failed fetch never blanks the controls.
  renderToggles();
  renderCount();
  window.addEventListener('resize', resize);
  void loadClients();

  return { destroy, reload: loadClients, resize };
}

const root = document.getElementById('clients-geo-map');
if (root) {
  try {
    mountClientsGeoMap(root, {
      token: window.__mapboxAccessToken || root.dataset.mapboxToken || '',
    });
  } catch (e) {
    root.textContent = e instanceof Error ? e.message : String(e);
    console.error('[client-map]', e);
  }
}
