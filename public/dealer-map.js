/**
 * Public used-car dealer map — Mapbox (or Leaflet fallback) with Google Places
 * search-on-pan and inventory-size toggles (demo estimates).
 */

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';

/** @typedef {'1-50' | '51-100' | '101-200' | '201-500' | '500+'} InventoryBucket */

const INVENTORY_BUCKETS = /** @type {const} */ ([
  '1-50',
  '51-100',
  '101-200',
  '201-500',
  '500+',
]);

const BUCKET_LABELS = {
  '1-50': '1–50 cars',
  '51-100': '51–100 cars',
  '101-200': '101–200 cars',
  '201-500': '201–500 cars',
  '500+': '500+ cars',
};

const BUCKET_COLORS = {
  '1-50': '#2563eb',
  '51-100': '#16a34a',
  '101-200': '#d97706',
  '201-500': '#7c3aed',
  '500+': '#dc2626',
};

/** Below this zoom, Places search is skipped (region too large). */
const MIN_SEARCH_ZOOM = 9;
const SEARCH_DEBOUNCE_MS = 450;
/** Popup tip clears the 44px pin (was overlapping at offset 18). */
const POPUP_OFFSET_PX = 52;

/** Default: Metro West Boston — close enough that Places search runs immediately. */
const DEFAULT_CENTER = { lng: -71.4162, lat: 42.2793 }; // Framingham / MetroWest
/** ~80% of a useful local zoom range (street ≈ 14–15; this is city/suburb). */
const DEFAULT_ZOOM = 11.5;

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
  ensureStylesheet(MAPBOX_CSS, 'data-dgm-mapbox-css');
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then(resolveMapboxGl);
  }
  return mapboxLoadPromise;
}

async function loadLeaflet() {
  ensureStylesheet(LEAFLET_CSS, 'data-dgm-leaflet-css');
  if (!leafletLoadPromise) {
    leafletLoadPromise = import(/* @vite-ignore */ LEAFLET_JS).then((mod) => mod.default || mod);
  }
  return leafletLoadPromise;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pinInitial(name) {
  const ch = String(name || '')
    .replace(/^the\s+/i, '')
    .trim()
    .charAt(0);
  return (ch || '?').toUpperCase();
}

function viewportSize() {
  const vv = window.visualViewport;
  const w = Math.max(
    1,
    Math.floor(vv?.width || window.innerWidth || document.documentElement.clientWidth || 1),
  );
  const h = Math.max(
    1,
    Math.floor(vv?.height || window.innerHeight || document.documentElement.clientHeight || 1),
  );
  return { w, h };
}

/**
 * @param {HTMLElement} container
 * @param {{ token?: string }} opts
 */
export function mountDealerGeoMap(container, opts = {}) {
  /** @type {Map<string, any>} */
  const dealersById = new Map();
  /** @type {Record<string, boolean>} */
  const enabledBuckets = {
    '1-50': true,
    '51-100': true,
    '101-200': true,
    '201-500': true,
    '500+': true,
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
  let activeId = null;
  let searchTimer = 0;
  let searchSeq = 0;
  let searching = false;
  let lastSearchKey = '';

  if (!document.getElementById('dgm-critical-css')) {
    const style = document.createElement('style');
    style.id = 'dgm-critical-css';
    style.textContent = `
      html, body { margin:0; width:100%; height:100%; min-height:100%; min-height:100dvh; overflow:hidden; background:#0d1117; color:#e9eef6;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
      .dgm-root { position:fixed; inset:0; width:100%; height:100%; min-height:100dvh; }
      .dgm-map-host, .dgm-map-canvas { position:absolute; inset:0; width:100%; height:100%; min-height:100%; }
      .dgm-map-empty { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center;
        padding:1.5rem; text-align:center; color:#8b949e; font-size:.95rem; background:rgba(13,17,23,.55); pointer-events:none; }
      .dgm-map-empty[hidden] { display:none !important; }
      .dgm-chrome { position:absolute; z-index:5; top:max(.75rem, env(safe-area-inset-top));
        left:max(.75rem, env(safe-area-inset-left)); right:max(.75rem, env(safe-area-inset-right));
        width:auto; max-width:none; pointer-events:none; }
      .dgm-chrome-panel { pointer-events:auto; border:1px solid rgba(48,54,61,.95); border-radius:14px; background:rgba(22,27,34,.92);
        backdrop-filter:blur(12px); padding:0; box-shadow:0 12px 32px rgba(0,0,0,.35); overflow:hidden; }
      .dgm-chrome-header { display:flex; align-items:center; justify-content:space-between; gap:.75rem;
        width:100%; padding:.75rem .9rem; border:none; background:transparent; color:inherit; cursor:pointer; text-align:left; font:inherit; }
      .dgm-chrome-header:hover { background:rgba(177,186,196,.08); }
      .dgm-chrome-header-text { display:flex; align-items:baseline; justify-content:space-between; gap:.75rem; flex:1; min-width:0; }
      .dgm-title { margin:0; font-size:1.05rem; font-weight:700; }
      .dgm-count { margin:0; color:#8b949e; font-size:.78rem; white-space:nowrap; }
      .dgm-chevron { flex-shrink:0; width:18px; height:18px; color:#8b949e; transition:transform .18s ease; }
      .dgm-chrome-panel.is-collapsed .dgm-chevron { transform:rotate(-90deg); }
      .dgm-chrome-body { padding:0 .9rem .85rem; }
      .dgm-chrome-panel.is-collapsed .dgm-chrome-body { display:none; }
      .dgm-hint { margin:0 0 .7rem; color:#8b949e; font-size:.72rem; line-height:1.35; }
      .dgm-toggles { display:flex; flex-direction:column; gap:.15rem; }
      .dgm-toggle { display:flex; align-items:center; gap:.65rem; padding:.4rem .15rem; cursor:pointer; user-select:none; }
      .dgm-toggle-input { position:absolute; opacity:0; width:0; height:0; pointer-events:none; }
      .dgm-toggle-track { flex-shrink:0; width:2.55rem; height:1.45rem; border-radius:999px; background:#30363d; position:relative; transition:background .15s; }
      .dgm-toggle-track::after { content:""; position:absolute; top:.14rem; left:.14rem; width:1.15rem; height:1.15rem;
        border-radius:50%; background:#fff; transition:transform .15s; }
      .dgm-toggle.is-on .dgm-toggle-track, .dgm-toggle-input:checked + .dgm-toggle-track { background:var(--dgm-bucket,#2563eb); }
      .dgm-toggle.is-on .dgm-toggle-track::after, .dgm-toggle-input:checked + .dgm-toggle-track::after { transform:translateX(1.1rem); }
      .dgm-toggle-meta { display:flex; align-items:center; gap:.4rem; min-width:0; flex:1; }
      .dgm-toggle-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .dgm-toggle-label { font-size:.86rem; font-weight:600; }
      .dgm-toggle-count { margin-left:auto; font-size:.75rem; color:#8b949e; font-variant-numeric:tabular-nums; }
      .dgm-toggle:not(.is-on) { opacity:.55; }
      .dgm-pin { position:relative; width:36px; height:44px; padding:0; border:none; background:transparent; cursor:pointer;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
      .dgm-pin-face { position:absolute; top:0; left:50%; transform:translateX(-50%); width:32px; height:32px; border-radius:50%;
        border:2.5px solid var(--dgm-bucket,#2563eb); background:#fff; color:#fff; font-size:.72rem; font-weight:700;
        overflow:hidden; display:flex; align-items:center; justify-content:center; z-index:1; }
      .dgm-pin-face--initial { background:var(--dgm-bucket,#2563eb); }
      .dgm-pin-icon { width:100%; height:100%; object-fit:cover; display:block; }
      .dgm-pin-tip { position:absolute; left:50%; bottom:2px; width:12px; height:12px; transform:translateX(-50%) rotate(45deg);
        background:var(--dgm-bucket,#2563eb); border-radius:0 0 2px 0; }
      .dgm-status { position:absolute; z-index:6; left:50%; bottom:max(1rem, env(safe-area-inset-bottom)); transform:translateX(-50%);
        max-width:min(420px, calc(100vw - 2rem)); padding:.7rem .95rem; border-radius:10px; border:1px solid rgba(48,54,61,.95);
        background:rgba(22,27,34,.92); font-size:.88rem; }
      .dgm-status--error { border-color:rgba(248,113,113,.35); background:rgba(60,20,20,.92); color:#f87171; }
      .dgm-status--loading { color:#8b949e; }
      .dgm-popup { display:flex; flex-direction:column; gap:.2rem; }
      .mapboxgl-popup-content, .leaflet-popup-content { color:#0d1117; font-size:.85rem; line-height:1.35; }
      .leaflet-container { width:100%; height:100%; background:#0d1117; }
    `;
    document.head.appendChild(style);
  }

  container.classList.add('dgm-root');
  container.innerHTML = `
    <div class="dgm-map-host" id="dgm-map-host" role="img" aria-label="Used car dealership map"></div>
    <div class="dgm-chrome">
      <div class="dgm-chrome-panel" id="dgm-panel">
        <button type="button" class="dgm-chrome-header" id="dgm-collapse" aria-expanded="true" aria-controls="dgm-chrome-body">
          <span class="dgm-chrome-header-text">
            <h1 class="dgm-title">Dealer map</h1>
            <p class="dgm-count" id="dgm-count" aria-live="polite">—</p>
          </span>
          <svg class="dgm-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="dgm-chrome-body" id="dgm-chrome-body">
          <p class="dgm-hint">Used-car lots from Google Places for the area you zoom to. Lot sizes are demo estimates.</p>
          <div class="dgm-toggles" id="dgm-toggles" role="group" aria-label="Inventory size"></div>
        </div>
      </div>
    </div>
    <div class="dgm-status" id="dgm-status" hidden></div>
  `;

  const mapHost = /** @type {HTMLElement} */ (container.querySelector('#dgm-map-host'));
  const panelEl = /** @type {HTMLElement} */ (container.querySelector('#dgm-panel'));
  const collapseBtn = /** @type {HTMLButtonElement} */ (container.querySelector('#dgm-collapse'));
  const togglesEl = /** @type {HTMLElement} */ (container.querySelector('#dgm-toggles'));
  const countEl = /** @type {HTMLElement} */ (container.querySelector('#dgm-count'));
  const statusEl = /** @type {HTMLElement} */ (container.querySelector('#dgm-status'));

  collapseBtn.addEventListener('click', () => {
    const collapsed = panelEl.classList.toggle('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  const emptyEl = document.createElement('div');
  emptyEl.className = 'dgm-map-empty';
  emptyEl.textContent = 'Loading map…';
  mapHost.appendChild(emptyEl);

  const mapEl = document.createElement('div');
  mapEl.className = 'dgm-map-canvas';
  mapHost.appendChild(mapEl);

  function sizeMapShell() {
    const { w, h } = viewportSize();
    document.documentElement.style.width = `${w}px`;
    document.documentElement.style.height = `${h}px`;
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = `${w}px`;
    document.body.style.height = `${h}px`;
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.width = `${w}px`;
    container.style.height = `${h}px`;
    for (const el of [mapHost, mapEl]) {
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
  }

  sizeMapShell();

  function bucketOf(d) {
    const b = d?.inventoryBucket;
    return INVENTORY_BUCKETS.includes(b) ? b : '1-50';
  }

  function bucketColor(bucket) {
    return BUCKET_COLORS[bucket] || BUCKET_COLORS['1-50'];
  }

  function allDealers() {
    return Array.from(dealersById.values());
  }

  /** Pads the current map bounds so edge pins stay while panning a little. */
  function viewBoundsPadded() {
    const b = getBounds();
    if (!b) return null;
    const padLat = (b.north - b.south) * 0.12;
    const padLng = (b.east - b.west) * 0.12;
    return {
      south: b.south - padLat,
      north: b.north + padLat,
      west: b.west - padLng,
      east: b.east + padLng,
    };
  }

  function inView(d, vb) {
    if (!vb) return true;
    return d.lat >= vb.south && d.lat <= vb.north && d.lng >= vb.west && d.lng <= vb.east;
  }

  function visibleDealers() {
    const vb = viewBoundsPadded();
    return allDealers().filter((d) => enabledBuckets[bucketOf(d)] && inView(d, vb));
  }

  function bucketCounts() {
    const counts = { '1-50': 0, '51-100': 0, '101-200': 0, '201-500': 0, '500+': 0 };
    const vb = viewBoundsPadded();
    for (const d of allDealers()) {
      if (!inView(d, vb)) continue;
      counts[bucketOf(d)] += 1;
    }
    return counts;
  }

  /** Drop dealers far from the current view so the cache follows the map. */
  function pruneFarDealers() {
    const b = getBounds();
    if (!b || dealersById.size < 30) return;
    const center = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
    const maxDeg = Math.max(b.north - b.south, b.east - b.west) * 2.5;
    for (const [id, d] of dealersById) {
      if (Math.abs(d.lat - center.lat) > maxDeg || Math.abs(d.lng - center.lng) > maxDeg) {
        dealersById.delete(id);
      }
    }
  }

  function setStatus(msg, { error = false, loading = false } = {}) {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('dgm-status--error', 'dgm-status--loading');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle('dgm-status--error', error);
    statusEl.classList.toggle('dgm-status--loading', loading && !error);
  }

  function renderCount() {
    const shown = visibleDealers().length;
    const total = dealersById.size;
    countEl.textContent =
      total === 0 ? 'No pins yet' : shown === total ? `${shown} pins` : `${shown} / ${total} pins`;
  }

  function syncToggleRow(row, bucket) {
    const on = !!enabledBuckets[bucket];
    row.classList.toggle('is-on', on);
    const input = row.querySelector('input');
    if (input instanceof HTMLInputElement) input.checked = on;
    const countNode = row.querySelector('.dgm-toggle-count');
    if (countNode) countNode.textContent = String(bucketCounts()[bucket] ?? 0);
  }

  function setBucketEnabled(bucket, next) {
    enabledBuckets[bucket] = next;
    if (!INVENTORY_BUCKETS.some((b) => enabledBuckets[b])) {
      enabledBuckets[bucket] = true;
    }
    for (const row of togglesEl.querySelectorAll('.dgm-toggle')) {
      const b = row.getAttribute('data-bucket');
      if (b) syncToggleRow(/** @type {HTMLElement} */ (row), b);
    }
    renderMarkers();
    renderCount();
  }

  function renderToggles() {
    togglesEl.replaceChildren();
    for (const bucket of INVENTORY_BUCKETS) {
      const row = document.createElement('label');
      row.className = 'dgm-toggle';
      row.dataset.bucket = bucket;
      row.style.setProperty('--dgm-bucket', bucketColor(bucket));

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'dgm-toggle-input';
      input.checked = !!enabledBuckets[bucket];
      input.setAttribute('aria-label', BUCKET_LABELS[bucket]);

      const track = document.createElement('span');
      track.className = 'dgm-toggle-track';
      track.setAttribute('aria-hidden', 'true');

      const meta = document.createElement('span');
      meta.className = 'dgm-toggle-meta';
      meta.innerHTML = `
        <span class="dgm-toggle-dot" style="background:${bucketColor(bucket)}"></span>
        <span class="dgm-toggle-label">${escHtml(BUCKET_LABELS[bucket])}</span>
        <span class="dgm-toggle-count">0</span>
      `;

      input.addEventListener('change', () => {
        setBucketEnabled(bucket, input.checked);
      });

      row.appendChild(input);
      row.appendChild(track);
      row.appendChild(meta);
      syncToggleRow(row, bucket);
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

  function buildPinElement(d) {
    const bucket = bucketOf(d);
    const color = bucketColor(bucket);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'dgm-pin';
    el.style.setProperty('--dgm-bucket', color);
    el.title = d.name;
    el.setAttribute('aria-label', d.name);

    const face = document.createElement('span');
    face.className = 'dgm-pin-face';
    const logoUrl = typeof d.logoUrl === 'string' ? d.logoUrl.trim() : '';
    if (logoUrl) {
      const img = document.createElement('img');
      img.className = 'dgm-pin-icon';
      img.src = logoUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener(
        'error',
        () => {
          face.replaceChildren();
          face.textContent = pinInitial(d.name);
          face.classList.add('dgm-pin-face--initial');
        },
        { once: true },
      );
      face.appendChild(img);
    } else {
      face.textContent = pinInitial(d.name);
      face.classList.add('dgm-pin-face--initial');
    }

    const tip = document.createElement('span');
    tip.className = 'dgm-pin-tip';
    tip.setAttribute('aria-hidden', 'true');
    el.appendChild(face);
    el.appendChild(tip);
    return el;
  }

  function popupHtml(d) {
    const bucket = bucketOf(d);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      d.address || d.name,
    )}&query_place_id=${encodeURIComponent(d.placeId)}`;
    return `
      <div class="dgm-popup">
        <strong>${escHtml(d.name)}</strong>
        <span class="dgm-popup-meta">${escHtml(BUCKET_LABELS[bucket])} · ~${escHtml(String(d.inventoryEstimate))} cars</span>
        ${d.address ? `<span class="dgm-popup-addr">${escHtml(d.address)}</span>` : ''}
        ${d.phone ? `<span class="dgm-popup-addr">${escHtml(d.phone)}</span>` : ''}
        <a href="${escHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        ${d.website ? `<a href="${escHtml(d.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
      </div>
    `;
  }

  function getBounds() {
    if (!map || !mapReady) return null;
    if (mapEngine === 'leaflet') {
      const b = map.getBounds?.();
      if (!b) return null;
      return {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
        zoom: map.getZoom?.() ?? 0,
      };
    }
    const b = map.getBounds?.();
    if (!b) return null;
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    return {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng,
      zoom: map.getZoom?.() ?? 0,
    };
  }

  function renderMarkers() {
    if (!map || !mapReady) return;

    clearMarkers();
    const located = visibleDealers();
    emptyEl.hidden = located.length > 0 || searching;
    if (!located.length && !searching) {
      const zoom = getBounds()?.zoom ?? 0;
      emptyEl.textContent =
        zoom < MIN_SEARCH_ZOOM
          ? 'Zoom in to load used-car dealerships.'
          : dealersById.size
            ? 'No dealers in the sizes you have on.'
            : 'Pan or zoom to search this area.';
      emptyEl.hidden = false;
    }

    for (const d of located) {
      if (mapEngine === 'leaflet' && leaflet) {
        const pin = buildPinElement(d);
        if (d.placeId === activeId) pin.classList.add('is-active');
        const marker = leaflet.marker([d.lat, d.lng], {
          icon: leaflet.divIcon({
            className: '',
            html: pin.outerHTML,
            iconSize: [36, 44],
            iconAnchor: [18, 44],
          }),
        });
        marker.bindPopup(popupHtml(d), { offset: [0, -POPUP_OFFSET_PX], maxWidth: 280 });
        marker.on('click', () => {
          activeId = d.placeId;
        });
        marker.addTo(map);
        markers.set(d.placeId, marker);
      } else if (mapboxgl) {
        const pin = buildPinElement(d);
        if (d.placeId === activeId) pin.classList.add('is-active');
        pin.addEventListener('click', () => {
          activeId = d.placeId;
          container.querySelectorAll('.dgm-pin.is-active').forEach((n) => n.classList.remove('is-active'));
          pin.classList.add('is-active');
        });
        const marker = new mapboxgl.Marker({ element: pin, anchor: 'bottom' })
          .setLngLat([d.lng, d.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: POPUP_OFFSET_PX, maxWidth: '280px', anchor: 'bottom' }).setHTML(
              popupHtml(d),
            ),
          )
          .addTo(map);
        markers.set(d.placeId, marker);
      }
    }

    for (const row of togglesEl.querySelectorAll('.dgm-toggle')) {
      const b = row.getAttribute('data-bucket');
      if (b) syncToggleRow(/** @type {HTMLElement} */ (row), b);
    }
    renderCount();
    resize();
  }

  async function searchViewport() {
    if (destroyed || !mapReady) return;
    const bounds = getBounds();
    if (!bounds) return;

    // Always refresh pins for the current view (cached + bucket filters).
    renderMarkers();

    if (bounds.zoom < MIN_SEARCH_ZOOM) {
      setStatus('Zoom in to search for used-car dealerships.', { loading: true });
      return;
    }

    const centerLat = (bounds.south + bounds.north) / 2;
    const centerLng = (bounds.west + bounds.east) / 2;
    // ~1km / half-zoom grid so small pans still re-query nearby lots.
    const key = [
      centerLat.toFixed(2),
      centerLng.toFixed(2),
      (Math.round(bounds.zoom * 2) / 2).toFixed(1),
    ].join(',');
    if (key === lastSearchKey) return;
    lastSearchKey = key;

    const seq = ++searchSeq;
    searching = true;
    setStatus('Searching dealerships…', { loading: true });

    try {
      const qs = new URLSearchParams({
        south: String(bounds.south),
        west: String(bounds.west),
        north: String(bounds.north),
        east: String(bounds.east),
      });
      const res = await fetch(`/api/dealer-map/places?${qs}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (seq !== searchSeq || destroyed) return;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const list = Array.isArray(data.dealers) ? data.dealers : [];
      for (const d of list) {
        if (d?.placeId) dealersById.set(d.placeId, d);
      }
      pruneFarDealers();
      renderMarkers();
      const inViewCount = visibleDealers().length;
      setStatus(
        list.length
          ? `Found ${list.length} nearby · ${inViewCount} in view`
          : inViewCount
            ? `${inViewCount} in view (no new results)`
            : 'No used-car dealers in this view.',
        { loading: false },
      );
      window.setTimeout(() => {
        if (seq === searchSeq && !searching) setStatus('');
      }, 2200);
    } catch (e) {
      if (seq !== searchSeq || destroyed) return;
      lastSearchKey = '';
      setStatus(e instanceof Error ? e.message : String(e), { error: true });
    } finally {
      if (seq === searchSeq) {
        searching = false;
        renderMarkers();
      }
    }
  }

  function scheduleSearch() {
    if (searchTimer) window.clearTimeout(searchTimer);
    // Re-paint cached pins immediately while the debounced Places call runs.
    renderMarkers();
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      void searchViewport();
    }, SEARCH_DEBOUNCE_MS);
  }

  function bindMapMove() {
    if (!map) return;
    if (mapEngine === 'leaflet') {
      map.on('moveend', scheduleSearch);
      map.on('zoomend', scheduleSearch);
    } else {
      map.on('moveend', scheduleSearch);
      map.on('zoomend', scheduleSearch);
    }
  }

  async function ensureLeafletMap() {
    const L = await loadLeaflet();
    if (destroyed || !L) return false;
    sizeMapShell();
    leaflet = L;
    map = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true,
    }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapEngine = 'leaflet';
    mapReady = true;
    emptyEl.hidden = true;
    setStatus('Showing OpenStreetMap — Mapbox unavailable.', { loading: false });
    bindMapMove();
    requestAnimationFrame(() => {
      sizeMapShell();
      map?.invalidateSize?.();
      scheduleSearch();
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
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });
    map.addControl(new gl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.on('error', (e) => {
      console.warn('[dealer-map] Mapbox error', e?.error || e);
    });
    await new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('Mapbox style load timed out')), 15000);
      map.once('load', () => {
        window.clearTimeout(t);
        resolve(undefined);
      });
      map.once('error', (e) => {
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
    bindMapMove();
    requestAnimationFrame(() => {
      sizeMapShell();
      map?.resize?.();
      scheduleSearch();
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
      setStatus('Mapbox token missing — using OpenStreetMap.');
      await ensureLeafletMap();
    } catch (e) {
      console.warn('[dealer-map] Mapbox failed, falling back to Leaflet', e);
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
        );
      } catch (e2) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Could not load map.';
        setStatus(e2 instanceof Error ? e2.message : String(e2), { error: true });
      }
    }
  }

  function resize() {
    sizeMapShell();
    if (mapEngine === 'leaflet') map?.invalidateSize?.();
    else map?.resize?.();
  }

  function destroy() {
    destroyed = true;
    if (searchTimer) window.clearTimeout(searchTimer);
    clearMarkers();
    map?.remove?.();
    map = null;
    mapReady = false;
    window.removeEventListener('resize', resize);
    window.visualViewport?.removeEventListener?.('resize', resize);
  }

  renderToggles();
  renderCount();
  sizeMapShell();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener?.('resize', resize);
  void ensureMap();

  return { destroy, resize };
}

const root = document.getElementById('dealer-geo-map');
if (root) {
  try {
    mountDealerGeoMap(root, {
      token: window.__mapboxAccessToken || root.dataset.mapboxToken || '',
    });
  } catch (e) {
    root.textContent = e instanceof Error ? e.message : String(e);
    console.error('[dealer-map]', e);
  }
}
