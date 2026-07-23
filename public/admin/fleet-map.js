/**
 * Mapbox map for the admin Fleet tab — multi-vehicle markers.
 */

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://esm.sh/mapbox-gl@3.9.0';

let mapboxLoadPromise = null;

function ensureMapboxCss() {
  if (document.querySelector('link[data-fl-mapbox-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPBOX_CSS;
  link.setAttribute('data-fl-mapbox-css', '1');
  document.head.appendChild(link);
}

async function loadMapboxGl() {
  ensureMapboxCss();
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then((mod) => mod.default || mod);
  }
  return mapboxLoadPromise;
}

function statusColor(status) {
  if (status === 'active') return '#22c55e';
  if (status === 'offline') return '#94a3b8';
  return '#f59e0b';
}

/**
 * @param {HTMLElement} container
 * @param {{ token?: string, vehicles?: Array<{ id: string, name: string, status?: string, lastLat?: number|null, lastLng?: number|null }> }} opts
 */
export function createFleetMap(container, opts = {}) {
  /** @type {typeof import('mapbox-gl') | null} */
  let mapboxgl = null;
  /** @type {import('mapbox-gl').Map | null} */
  let map = null;
  /** @type {Map<string, import('mapbox-gl').Marker>} */
  const markers = new Map();
  let destroyed = false;
  let mapReady = false;
  let vehicles = Array.isArray(opts.vehicles) ? opts.vehicles : [];

  const mapEl = document.createElement('div');
  mapEl.className = 'fl-map-canvas';
  mapEl.setAttribute('role', 'img');
  mapEl.setAttribute('aria-label', 'Fleet vehicle map');

  const emptyEl = document.createElement('div');
  emptyEl.className = 'fl-map-empty';
  emptyEl.textContent = 'Add vehicles and assign drivers to see live positions.';

  container.classList.add('fl-map-wrap');
  container.replaceChildren(mapEl, emptyEl);

  function locatedVehicles() {
    return vehicles.filter(
      (v) => v.lastLat != null && v.lastLng != null && Number.isFinite(v.lastLat) && Number.isFinite(v.lastLng),
    );
  }

  function syncEmptyState() {
    const located = locatedVehicles();
    emptyEl.hidden = located.length > 0;
    mapEl.hidden = located.length === 0 && !mapReady;
  }

  function fitBounds() {
    if (!map || !mapReady || !mapboxgl) return;
    const located = locatedVehicles();
    if (!located.length) return;
    if (located.length === 1) {
      map.flyTo({ center: [located[0].lastLng, located[0].lastLat], zoom: 12 });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    for (const v of located) bounds.extend([v.lastLng, v.lastLat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 14 });
  }

  function clearMarkers() {
    for (const marker of markers.values()) marker.remove();
    markers.clear();
  }

  function renderMarkers() {
    if (!map || !mapReady || !mapboxgl) return;
    clearMarkers();
    for (const v of locatedVehicles()) {
      const el = document.createElement('div');
      el.className = 'fl-map-marker';
      el.title = v.name;
      el.style.background = statusColor(v.status);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([v.lastLng, v.lastLat])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${v.name}</strong><br>${v.status || 'unknown'}`))
        .addTo(map);
      markers.set(v.id, marker);
    }
    syncEmptyState();
    fitBounds();
  }

  async function ensureMap() {
    const token = (opts.token || window.__mapboxAccessToken || '').trim();
    if (!token || destroyed) return;
    if (map) return;
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
  }

  function setVehicles(next) {
    vehicles = Array.isArray(next) ? next : [];
    syncEmptyState();
    if (mapReady) renderMarkers();
    else void ensureMap();
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
  }

  syncEmptyState();
  void ensureMap();

  return { setVehicles, resize, destroy };
}
