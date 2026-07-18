/**
 * Mapbox map for the admin client detail pane — marker + driving directions overlay.
 */

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://esm.sh/mapbox-gl@3.9.0';

let mapboxLoadPromise = null;

function ensureMapboxCss() {
  if (document.querySelector('link[data-cl-mapbox-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPBOX_CSS;
  link.setAttribute('data-cl-mapbox-css', '1');
  document.head.appendChild(link);
}

async function loadMapboxGl() {
  ensureMapboxCss();
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then((mod) => mod.default || mod);
  }
  return mapboxLoadPromise;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * @param {HTMLElement} container
 * @param {{ token?: string, lat?: number|null, lng?: number|null, address?: string }} opts
 */
export function createClientMap(container, opts = {}) {
  /** @type {import('mapbox-gl').Map | null} */
  let map = null;
  /** @type {import('mapbox-gl').Marker | null} */
  let marker = null;
  let destroyed = false;
  const routeSourceId = 'cl-route';
  const routeLayerId = 'cl-route-line';
  let currentGeo = null;
  let currentAddress = (opts.address || '').trim();
  let mapReady = false;

  const metaEl = document.createElement('div');
  metaEl.className = 'cl-map-meta';
  metaEl.hidden = true;

  const mapEl = document.createElement('div');
  mapEl.className = 'cl-map-canvas';
  mapEl.setAttribute('role', 'img');
  mapEl.setAttribute('aria-label', 'Client location map');

  const emptyEl = document.createElement('div');
  emptyEl.className = 'cl-map-empty';
  emptyEl.textContent = 'Enter an address to show the map.';

  const actions = document.createElement('div');
  actions.className = 'cl-map-actions';

  const directionsBtn = document.createElement('button');
  directionsBtn.type = 'button';
  directionsBtn.className = 'de-btn cl-map-directions-btn';
  directionsBtn.textContent = 'Directions';
  directionsBtn.disabled = true;

  const openMapsBtn = document.createElement('a');
  openMapsBtn.className = 'de-btn cl-map-open-btn';
  openMapsBtn.textContent = 'Open in Maps';
  openMapsBtn.target = '_blank';
  openMapsBtn.rel = 'noopener noreferrer';
  openMapsBtn.hidden = true;

  actions.appendChild(directionsBtn);
  actions.appendChild(openMapsBtn);

  container.classList.add('cl-map-wrap');
  container.replaceChildren(metaEl, mapEl, emptyEl, actions);

  if (opts.showDirections === false) {
    directionsBtn.hidden = true;
  }

  function syncEmptyState() {
    const hasGeo = currentGeo && Number.isFinite(currentGeo.lat) && Number.isFinite(currentGeo.lng);
    const mapWorking = hasGeo && mapReady;
    const hideEmpty = mapWorking;
    emptyEl.hidden = hideEmpty;
    mapEl.hidden = !hasGeo;
    directionsBtn.disabled = !hasGeo;
    openMapsBtn.hidden = !hasGeo;
    if (!hideEmpty && !hasGeo && currentAddress) {
      emptyEl.textContent = 'Loading map…';
    } else if (!hideEmpty && !hasGeo) {
      emptyEl.textContent = 'Enter an address to show the map.';
    }
    if (hasGeo) {
      openMapsBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${currentGeo.lat},${currentGeo.lng}`,
      )}`;
    }
  }

  async function ensureMap() {
    const token = opts.token || window.__mapboxAccessToken;
    if (!token) {
      emptyEl.textContent = 'Mapbox token not configured.';
      emptyEl.hidden = false;
      mapEl.hidden = true;
      return null;
    }

    const mapboxgl = await loadMapboxGl();
    if (destroyed) return null;

    if (!map) {
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: mapEl,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-71.0589, 42.3601],
        zoom: 11,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      await new Promise((resolve) => {
        if (map.isStyleLoaded()) resolve();
        else map.once('load', resolve);
      });
    }

    return { map, mapboxgl };
  }

  async function setLocation(lat, lng, address) {
    if (typeof address === 'string') currentAddress = address.trim();
    currentGeo =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat: Number(lat), lng: Number(lng), address: address || currentAddress || '' }
        : null;
    if (!currentGeo) mapReady = false;
    syncEmptyState();
    metaEl.hidden = true;
    metaEl.textContent = '';
    clearRoute();

    if (!currentGeo) return;

    const ready = await ensureMap();
    if (!ready || destroyed) return;
    const { map: liveMap, mapboxgl } = ready;

    liveMap.setCenter([currentGeo.lng, currentGeo.lat]);
    liveMap.setZoom(14);

    if (!marker) {
      marker = new mapboxgl.Marker({ color: '#0a84ff' })
        .setLngLat([currentGeo.lng, currentGeo.lat])
        .addTo(liveMap);
    } else {
      marker.setLngLat([currentGeo.lng, currentGeo.lat]);
    }

    mapReady = true;
    syncEmptyState();
  }

  function clearRoute() {
    if (!map) return;
    if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
    if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);
  }

  async function showDirections() {
    if (!currentGeo) return;
    metaEl.hidden = false;
    metaEl.textContent = 'Loading route…';
    directionsBtn.disabled = true;

    try {
      const params = new URLSearchParams({
        toLat: String(currentGeo.lat),
        toLng: String(currentGeo.lng),
      });
      if (currentGeo.address) params.set('destination', currentGeo.address);

      const res = await fetch(`/api/mapbox/directions?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const ready = await ensureMap();
      if (!ready || destroyed) return;
      const { map: liveMap } = ready;
      clearRoute();

      liveMap.addSource(routeSourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: data.route.geometry,
        },
      });
      liveMap.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeSourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#0a84ff', 'line-width': 4, 'line-opacity': 0.85 },
      });

      const coords = data.route.geometry.coordinates || [];
      if (coords.length) {
        const mapboxgl = await loadMapboxGl();
        const bounds = coords.reduce(
          (b, coord) => b.extend(coord),
          new mapboxgl.LngLatBounds(coords[0], coords[0]),
        );
        liveMap.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 600 });
      }

      const dist = formatDistance(data.route.distanceMeters);
      const dur = formatDuration(data.route.durationSeconds);
      metaEl.textContent = dist && dur ? `${dist} · ${dur} drive` : 'Route loaded';
    } catch (e) {
      metaEl.textContent = e.message || 'Could not load directions';
    } finally {
      directionsBtn.disabled = !currentGeo;
    }
  }

  directionsBtn.addEventListener('click', () => {
    void showDirections();
  });

  if (opts.lat != null && opts.lng != null) {
    void setLocation(opts.lat, opts.lng, opts.address || '');
  } else {
    syncEmptyState();
  }

  return {
    setLocation,
    showDirections,
    destroy() {
      destroyed = true;
      mapReady = false;
      clearRoute();
      marker?.remove();
      marker = null;
      map?.remove();
      map = null;
      container.replaceChildren();
      container.classList.remove('cl-map-wrap');
    },
  };
}
