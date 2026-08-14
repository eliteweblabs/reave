/**
 * Full-bleed admin contact geo map — Mapbox markers with status toggles.
 * Critical layout is applied inline so Astro CSS bundling cannot blank the map.
 */

import { escHtml, readAdminJson } from './shared.js?v=20260810a';

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';

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
let leafletLoadPromise = null;

function ensureStylesheet(href, attr) {
  if (document.querySelector(`link[${attr}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(attr, '1');
  document.head.appendChild(link);
}

function resolveMapboxGl(mod) {
  const candidates = [mod?.default, mod, mod?.mapboxgl, mod?.default?.default];
  for (const c of candidates) {
    if (c && typeof c.Map === 'function') return c;
  }
  return null;
}

async function loadMapboxGl() {
  ensureStylesheet(MAPBOX_CSS, 'data-cgm-mapbox-css');
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then(resolveMapboxGl);
  }
  return mapboxLoadPromise;
}

async function loadLeaflet() {
  ensureStylesheet(LEAFLET_CSS, 'data-cgm-leaflet-css');
  if (!leafletLoadPromise) {
    leafletLoadPromise = import(/* @vite-ignore */ LEAFLET_JS).then((mod) => mod.default || mod);
  }
  return leafletLoadPromise;
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
 * Layout-viewport px for Mapbox (avoids % height collapsing to ~300px).
 * Prefer layout size over visualViewport alone — on iOS Safari, vv.height is
 * shorter than the fixed containing block while the toolbar is up, which left
 * a solid black chin under the map canvas.
 */
function viewportSize() {
  const vv = window.visualViewport;
  const layoutW = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  const layoutH = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const visualW = vv ? Math.ceil((vv.offsetLeft || 0) + vv.width) : 0;
  const visualH = vv ? Math.ceil((vv.offsetTop || 0) + vv.height) : 0;
  return {
    w: Math.max(1, Math.floor(Math.max(layoutW, visualW, vv?.width || 0))),
    h: Math.max(1, Math.floor(Math.max(layoutH, visualH, vv?.height || 0))),
  };
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
  /** @type {'mapbox' | 'leaflet' | null} */
  let mapEngine = null;
  /** @type {any} */
  let mapboxgl = null;
  /** @type {any} */
  let leaflet = null;
  /** @type {any} */
  let map = null;
  /** @type {Map<string, any>} */
  const markers = new Map();
  let activeUid = null;
  let fitOnce = false;

  // Page chrome styles that must work even if Astro CSS fails to attach.
  if (!document.getElementById('cgm-critical-css')) {
    const style = document.createElement('style');
    style.id = 'cgm-critical-css';
    style.textContent = `
      html, body { margin:0; width:100%; height:100%; min-height:100%; min-height:-webkit-fill-available; min-height:100dvh; min-height:100lvh; overflow:hidden; background-color:#0d1117; color:#e9eef6;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
      .cgm-root { position:fixed; inset:0; width:auto; height:auto; min-width:100%; min-height:-webkit-fill-available; min-height:100lvh; }
      .cgm-map-host, .cgm-map-canvas { position:absolute; inset:0; width:100%; height:100%; min-height:100%; }
      .cgm-map-empty { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center;
        padding:1.5rem; text-align:center; color:#8b949e; font-size:.95rem; background:rgba(13,17,23,.55); pointer-events:none; }
      .cgm-map-empty[hidden] { display:none !important; }
      .cgm-chrome { position:absolute; z-index:5; top:max(.75rem, env(safe-area-inset-top));
        left:max(.75rem, env(safe-area-inset-left)); right:max(.75rem, env(safe-area-inset-right));
        display:flex; flex-direction:row; align-items:flex-start; gap:.55rem;
        width:auto; max-width:360px; pointer-events:none; }
      .cgm-back { pointer-events:auto; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
        width:2.75rem; height:2.75rem; padding:0; border:1px solid rgba(48,54,61,.95); border-radius:14px;
        background:rgba(22,27,34,.92); backdrop-filter:blur(12px); color:inherit; text-decoration:none;
        box-shadow:0 12px 32px rgba(0,0,0,.35); }
      .cgm-back:hover { background:rgba(28,33,40,.96); }
      .cgm-back svg { display:block; }
      .cgm-chrome-panel { pointer-events:auto; flex:1 1 auto; min-width:0;
        border:1px solid rgba(48,54,61,.95); border-radius:14px;
        background:rgba(22,27,34,.92); backdrop-filter:blur(12px); padding:.45rem .65rem;
        box-shadow:0 12px 32px rgba(0,0,0,.35); }
      .cgm-toolbar { display:flex; align-items:center; gap:.5rem; min-height:1.85rem; }
      .cgm-count { margin:0; margin-right:auto; color:#8b949e; font-size:.78rem; white-space:nowrap; min-width:0;
        overflow:hidden; text-overflow:ellipsis; }
      .cgm-settings-btn { flex-shrink:0; display:inline-flex; align-items:center; justify-content:center;
        width:2rem; height:2rem; padding:0; border:none; border-radius:8px; background:transparent;
        color:inherit; cursor:pointer; }
      .cgm-settings-btn:hover, .cgm-settings-btn[aria-expanded="true"] { background:rgba(177,186,196,.14); }
      .cgm-settings-btn svg { display:block; }
      .cgm-filters { margin-top:.45rem; padding-top:.35rem; border-top:1px solid rgba(48,54,61,.95); }
      .cgm-filters[hidden] { display:none !important; }
      .cgm-toggles { display:flex; flex-direction:column; gap:.1rem; }
      .cgm-toggle { display:flex; align-items:center; gap:.65rem; padding:.4rem .15rem; cursor:pointer; user-select:none; }
      .cgm-toggle-input { position:absolute; opacity:0; width:0; height:0; pointer-events:none; }
      .cgm-toggle-track { flex-shrink:0; width:2.55rem; height:1.45rem; border-radius:999px; background:#30363d; position:relative; transition:background .15s; }
      .cgm-toggle-track::after { content:""; position:absolute; top:.14rem; left:.14rem; width:1.15rem; height:1.15rem;
        border-radius:50%; background:#fff; transition:transform .15s; }
      .cgm-toggle.is-on .cgm-toggle-track, .cgm-toggle-input:checked + .cgm-toggle-track { background:var(--cgm-kind,#2563eb); }
      .cgm-toggle.is-on .cgm-toggle-track::after, .cgm-toggle-input:checked + .cgm-toggle-track::after { transform:translateX(1.1rem); }
      .cgm-toggle-meta { display:flex; align-items:center; gap:.4rem; min-width:0; flex:1; }
      .cgm-toggle-label { font-size:.86rem; font-weight:600; }
      .cgm-toggle-count { margin-left:auto; font-size:.75rem; color:#8b949e; font-variant-numeric:tabular-nums; }
      .cgm-toggle:not(.is-on) { opacity:.55; }
      .cgm-pin { position:relative; width:36px; height:42px; padding:0; border:none; background:transparent; cursor:pointer;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
      .cgm-pin-face { position:absolute; top:4px; left:50%; transform:translateX(-50%); width:32px; height:32px; border-radius:50%;
        border:2.5px solid var(--cgm-kind,#2563eb); background:#fff; overflow:hidden; display:flex; align-items:center; justify-content:center; z-index:1; }
      .cgm-pin-face--initial { background:var(--cgm-kind,#2563eb); color:#fff; font-size:.85rem; font-weight:700; }
      .cgm-pin-icon { width:100%; height:100%; object-fit:cover; display:block; }
      /* Triangle tip — base tucked under the face so only a clean point shows. */
      .cgm-pin-tip { position:absolute; left:50%; bottom:0; width:12px; height:10px; transform:translateX(-50%);
        background:var(--cgm-kind,#2563eb); clip-path:polygon(0 0, 100% 0, 50% 100%); z-index:0; }
      .cgm-pin.is-active { z-index:2; filter:drop-shadow(0 3px 8px rgba(0,0,0,.45)); }
      .cgm-pin.is-active .cgm-pin-face { width:36px; height:36px; border-width:3px; }
      .cgm-status { position:absolute; z-index:6; left:50%; bottom:max(1rem, env(safe-area-inset-bottom)); transform:translateX(-50%);
        max-width:min(420px, calc(100vw - 2rem)); padding:.7rem .95rem; border-radius:10px; border:1px solid rgba(48,54,61,.95);
        background:rgba(22,27,34,.92); font-size:.88rem; }
      .cgm-status--error { border-color:rgba(248,113,113,.35); background:rgba(60,20,20,.92); color:#f87171; }
      .cgm-popup { display:flex; flex-direction:column; gap:.2rem; }
      .mapboxgl-popup-content, .leaflet-popup-content { color:#0d1117; font-size:.85rem; line-height:1.35; }
      .leaflet-container { width:100%; height:100%; background:#0d1117; }
      .mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right, .leaflet-bottom {
        bottom: max(.35rem, env(safe-area-inset-bottom, 0px));
      }
    `;
    document.head.appendChild(style);
  }

  // IOS_ICONS.chevron-left — keep in sync with public/admin/admin-ui.js
  const BACK_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  // IOS_ICONS.settings — keep in sync with public/admin/admin-ui.js
  const SETTINGS_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

  container.classList.add('cgm-root');
  container.innerHTML = `
    <div class="cgm-map-host" id="cgm-map-host" role="img" aria-label="Contact locations map"></div>
    <div class="cgm-chrome">
      <a class="cgm-back" href="/admin/?tab=clients" aria-label="Back to Contacts" title="Contacts">${BACK_ICON}</a>
      <div class="cgm-chrome-panel">
        <div class="cgm-toolbar">
          <p class="cgm-count" id="cgm-count" aria-live="polite">Loading…</p>
          <button
            type="button"
            class="cgm-settings-btn"
            id="cgm-settings-btn"
            aria-expanded="false"
            aria-controls="cgm-filters"
            aria-label="Filter settings"
          >${SETTINGS_ICON}</button>
        </div>
        <div class="cgm-filters" id="cgm-filters" hidden>
          <div class="cgm-toggles" id="cgm-toggles" role="group" aria-label="Status toggles"></div>
        </div>
      </div>
    </div>
    <div class="cgm-status" id="cgm-status" hidden></div>
  `;

  const mapHost = /** @type {HTMLElement} */ (container.querySelector('#cgm-map-host'));
  const togglesEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-toggles'));
  const filtersEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-filters'));
  const settingsBtn = /** @type {HTMLButtonElement} */ (container.querySelector('#cgm-settings-btn'));
  const countEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-count'));
  const statusEl = /** @type {HTMLElement} */ (container.querySelector('#cgm-status'));

  settingsBtn.addEventListener('click', () => {
    const open = settingsBtn.getAttribute('aria-expanded') === 'true';
    const next = !open;
    settingsBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    filtersEl.hidden = !next;
  });

  const emptyEl = document.createElement('div');
  emptyEl.className = 'cgm-map-empty';
  emptyEl.textContent = 'Loading map…';
  mapHost.appendChild(emptyEl);

  const mapEl = document.createElement('div');
  mapEl.className = 'cgm-map-canvas';
  mapHost.appendChild(mapEl);

  function sizeMapShell() {
    const { w, h } = viewportSize();
    // Keep document at least layout-tall — shrinking html/body to visualViewport
    // height made Safari sample an opaque black chin under the map.
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';
    document.documentElement.style.minHeight = `${h}px`;
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.minHeight = `${h}px`;
    document.body.style.backgroundColor = '#0d1117';
    // Fixed inset:0 tracks the layout viewport; do not override with short vv px.
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.right = '0';
    container.style.bottom = '0';
    container.style.left = '0';
    container.style.width = 'auto';
    container.style.height = 'auto';
    container.style.minWidth = '100%';
    container.style.minHeight = `${h}px`;
    const rect = container.getBoundingClientRect();
    const mw = Math.max(1, Math.floor(rect.width || w));
    const mh = Math.max(1, Math.floor(rect.height || h));
    for (const el of [mapHost, mapEl]) {
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.width = `${mw}px`;
      el.style.height = `${mh}px`;
    }
  }

  sizeMapShell();

  function visibleClients() {
    return clients.filter((c) => enabledKinds[normalizeKind(c.kind)]);
  }

  function locatedClients(list = visibleClients()) {
    return list.filter((c) => {
      const lat = c.geo?.lat;
      const lng = c.geo?.lng;
      return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180 &&
        !(lat === 0 && lng === 0)
      );
    });
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
    for (const marker of markers.values()) {
      if (mapEngine === 'leaflet') map?.removeLayer?.(marker);
      else marker.remove?.();
    }
    markers.clear();
  }

  function buildPinElement(c) {
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

  function popupHtml(c) {
    const kind = normalizeKind(c.kind);
    return `
      <div class="cgm-popup">
        <strong>${escHtml(displayName(c))}</strong>
        <span class="cgm-popup-kind">${escHtml(CLIENT_KIND_LABELS[kind])}</span>
        ${c.address ? `<span class="cgm-popup-addr">${escHtml(c.address)}</span>` : ''}
        <a href="/admin/?tab=clients&amp;client=${encodeURIComponent(c.uid)}">Open contact</a>
      </div>
    `;
  }

  function fitBounds() {
    if (!map || !mapReady) return;
    const located = locatedClients();
    if (!located.length) return;

    if (mapEngine === 'leaflet' && leaflet) {
      if (located.length === 1) {
        map.setView([located[0].geo.lat, located[0].geo.lng], 13);
      } else {
        const bounds = leaflet.latLngBounds(located.map((c) => [c.geo.lat, c.geo.lng]));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14 });
      }
      fitOnce = true;
      return;
    }

    if (!mapboxgl) return;
    sizeMapShell();
    map.resize?.();
    if (located.length === 1) {
      map.jumpTo({ center: [located[0].geo.lng, located[0].geo.lat], zoom: 13 });
      fitOnce = true;
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const c of located) bounds.extend([c.geo.lng, c.geo.lat]);
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, {
      padding: 72,
      maxZoom: 14,
      minZoom: 2,
      duration: fitOnce ? 650 : 0,
    });
    fitOnce = true;
  }

  function renderMarkers({ refit = false } = {}) {
    if (!map || !mapReady) {
      emptyEl.hidden = locatedClients().length > 0 && mapReady;
      return;
    }

    clearMarkers();
    const located = locatedClients();
    emptyEl.hidden = located.length > 0;
    if (!located.length) {
      emptyEl.textContent = 'No mapped contacts for the statuses you have on.';
      emptyEl.hidden = false;
      return;
    }

    for (const c of located) {
      if (mapEngine === 'leaflet' && leaflet) {
        const pin = buildPinElement(c);
        if (c.uid === activeUid) pin.classList.add('is-active');
        const marker = leaflet.marker([c.geo.lat, c.geo.lng], {
          icon: leaflet.divIcon({
            className: '',
            html: pin.outerHTML,
            iconSize: [36, 42],
            iconAnchor: [18, 42],
          }),
        });
        marker.bindPopup(popupHtml(c));
        marker.on('click', () => {
          activeUid = c.uid;
        });
        marker.addTo(map);
        markers.set(c.uid, marker);
      } else if (mapboxgl) {
        const pin = buildPinElement(c);
        if (c.uid === activeUid) pin.classList.add('is-active');
        pin.addEventListener('click', () => {
          activeUid = c.uid;
          container.querySelectorAll('.cgm-pin.is-active').forEach((n) => n.classList.remove('is-active'));
          pin.classList.add('is-active');
        });
        const marker = new mapboxgl.Marker({ element: pin, anchor: 'bottom' })
          .setLngLat([c.geo.lng, c.geo.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18, maxWidth: '240px' }).setHTML(popupHtml(c)))
          .addTo(map);
        markers.set(c.uid, marker);
      }
    }

    if (refit || !fitOnce) fitBounds();
    resize();
  }

  async function ensureLeafletMap() {
    const L = await loadLeaflet();
    if (destroyed || !L) return false;
    sizeMapShell();
    leaflet = L;
    map = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapEngine = 'leaflet';
    mapReady = true;
    emptyEl.hidden = true;
    setStatus('Showing OpenStreetMap — Mapbox unavailable.', false);
    renderMarkers({ refit: true });
    requestAnimationFrame(() => {
      sizeMapShell();
      map?.invalidateSize?.();
      fitBounds();
    });
    return true;
  }

  async function ensureMapboxMap(token) {
    const gl = await loadMapboxGl();
    if (destroyed) return false;
    if (!gl || typeof gl.Map !== 'function') {
      throw new Error('Mapbox GL failed to load (no Map constructor)');
    }
    sizeMapShell();
    mapboxgl = gl;
    gl.accessToken = token;
    map = new gl.Map({
      container: mapEl,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5795, 39.8283],
      zoom: 3.5,
      attributionControl: true,
    });
    map.addControl(new gl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.on('error', (e) => {
      console.warn('[contact-map] Mapbox error', e?.error || e);
    });
    await new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('Mapbox style load timed out')), 15000);
      map.once('load', () => {
        window.clearTimeout(t);
        resolve(undefined);
      });
      map.once('error', (e) => {
        // Style/token errors — still allow map shell if canvas exists; reject hard failures.
        if (e?.error?.status === 401 || e?.error?.status === 403) {
          window.clearTimeout(t);
          reject(new Error('Mapbox token rejected'));
        }
      });
    });
    mapEngine = 'mapbox';
    mapReady = true;
    emptyEl.hidden = true;
    setStatus('');
    sizeMapShell();
    map.resize();
    renderMarkers({ refit: true });
    requestAnimationFrame(() => {
      sizeMapShell();
      map?.resize?.();
      fitBounds();
    });
    return true;
  }

  async function ensureMap() {
    if (map || destroyed) return;
    const token = (opts.token || window.__mapboxAccessToken || '').trim();
    emptyEl.hidden = false;
    emptyEl.textContent = 'Loading map…';
    try {
      if (token) {
        await ensureMapboxMap(token);
        return;
      }
      setStatus('Mapbox token missing — using OpenStreetMap.', false);
      await ensureLeafletMap();
    } catch (e) {
      console.warn('[contact-map] Mapbox failed, falling back to Leaflet', e);
      try {
        if (map) {
          map.remove?.();
          map = null;
        }
        mapReady = false;
        mapEngine = null;
        await ensureLeafletMap();
        setStatus(
          `Mapbox failed (${e instanceof Error ? e.message : String(e)}); showing OpenStreetMap.`,
          false,
        );
      } catch (e2) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Could not load map.';
        setStatus(e2 instanceof Error ? e2.message : String(e2), true);
      }
    }
  }

  async function loadClients() {
    countEl.textContent = 'Loading pins…';

    if (window.__clientsMapPayload) {
      const data = window.__clientsMapPayload;
      if (!data?.ok) {
        setStatus(data?.error || 'Could not load contacts.', true);
        return;
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
      for (const row of togglesEl.querySelectorAll('.cgm-toggle')) {
        const k = row.getAttribute('data-kind');
        if (k) syncToggleRow(/** @type {HTMLElement} */ (row), k);
      }
      renderCount();
      if (mapReady) renderMarkers({ refit: true });
      return;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), 45000)
      : 0;
    try {
      // Plain fetch — this page is public; adminFetch would bounce 401 → /sign-in.
      const res = await fetch('/api/clients/map', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller?.signal,
        headers: { Accept: 'application/json' },
      });
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
      for (const row of togglesEl.querySelectorAll('.cgm-toggle')) {
        const k = row.getAttribute('data-kind');
        if (k) syncToggleRow(/** @type {HTMLElement} */ (row), k);
      }
      renderCount();
      if (mapReady) renderMarkers({ refit: true });
    } catch (e) {
      const aborted =
        (e && typeof e === 'object' && 'name' in e && e.name === 'AbortError') ||
        (e instanceof Error && /abort/i.test(e.message));
      setStatus(
        aborted
          ? 'Timed out loading contacts — try refreshing.'
          : e instanceof Error
            ? e.message
            : String(e),
        true,
      );
      renderCount();
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  function resize() {
    sizeMapShell();
    if (mapEngine === 'leaflet') map?.invalidateSize?.();
    else map?.resize?.();
  }

  function destroy() {
    destroyed = true;
    clearMarkers();
    map?.remove?.();
    map = null;
    mapReady = false;
    window.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', resize);
    window.visualViewport?.removeEventListener?.('resize', resize);
    window.visualViewport?.removeEventListener?.('scroll', resize);
  }

  renderToggles();
  renderCount();
  sizeMapShell();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener?.('resize', resize);
  window.visualViewport?.addEventListener?.('scroll', resize);
  void ensureMap();
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
    console.error('[contact-map]', e);
  }
}
