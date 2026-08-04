/**
 * Admin map — Mapbox when configured, otherwise OpenStreetMap (Leaflet).
 */

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';

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

async function loadMapboxGl() {
  ensureStylesheet(MAPBOX_CSS, 'data-cl-mapbox-css');
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then((mod) => mod.default || mod);
  }
  return mapboxLoadPromise;
}

async function loadLeaflet() {
  ensureStylesheet(LEAFLET_CSS, 'data-cl-leaflet-css');
  if (!leafletLoadPromise) {
    leafletLoadPromise = import(/* @vite-ignore */ LEAFLET_JS).then((mod) => mod.default || mod);
  }
  return leafletLoadPromise;
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
 * @param {{ token?: string, lat?: number|null, lng?: number|null, address?: string, emptyHint?: string, showDirections?: boolean }} opts
 */
export function createClientMap(container, opts = {}) {
  /** @type {import('mapbox-gl').Map | import('leaflet').Map | null} */
  let map = null;
  /** @type {import('mapbox-gl').Marker | import('leaflet').Marker | null} */
  let marker = null;
  let destroyed = false;
  /** @type {'mapbox' | 'leaflet' | null} */
  let mapEngine = null;
  const routeSourceId = 'cl-route';
  const routeLayerId = 'cl-route-line';
  let currentGeo = null;
  let currentAddress = (opts.address || '').trim();
  const emptyHint =
    (opts.emptyHint || '').trim() || 'Enter an address to show the map.';
  let mapReady = false;
  let geocodeFailed = false;
  let mapLoadFailed = false;
  let mapLoadError = '';

  const metaEl = document.createElement('div');
  metaEl.className = 'cl-map-meta';
  metaEl.hidden = true;

  const mapShell = document.createElement('div');
  mapShell.className = 'cl-map-shell';

  const mapEl = document.createElement('div');
  mapEl.className = 'cl-map-canvas';
  mapEl.setAttribute('role', 'img');
  mapEl.setAttribute('aria-label', 'Client location map');

  const centerBtn = document.createElement('button');
  centerBtn.type = 'button';
  centerBtn.className = 'cl-map-center-btn';
  centerBtn.title = 'Center on location';
  centerBtn.setAttribute('aria-label', 'Center on location');
  centerBtn.disabled = true;
  centerBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<circle cx="8" cy="8" r="2.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>';

  mapShell.appendChild(mapEl);
  mapShell.appendChild(centerBtn);

  // Keep wheel/trackpad from zooming the map or scrolling the editor panel.
  mapShell.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

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
  container.replaceChildren(metaEl, mapShell, emptyEl, actions);

  if (opts.showDirections === false) {
    directionsBtn.hidden = true;
  }

  function syncEmptyState() {
    const hasGeo = currentGeo && Number.isFinite(currentGeo.lat) && Number.isFinite(currentGeo.lng);
    const mapWorking = hasGeo && mapReady;
    mapEl.hidden = !hasGeo || mapLoadFailed;
    directionsBtn.disabled = !hasGeo || mapEngine !== 'mapbox';
    openMapsBtn.hidden = !hasGeo;
    centerBtn.disabled = !hasGeo || !mapReady;

    if (mapWorking || (hasGeo && !mapLoadFailed)) {
      emptyEl.hidden = true;
    } else if (hasGeo && mapLoadFailed) {
      emptyEl.hidden = false;
      emptyEl.textContent = mapLoadError || 'Could not load map.';
    } else if (currentAddress && !geocodeFailed) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Loading map…';
    } else if (currentAddress && geocodeFailed) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Could not locate this address on the map.';
    } else {
      emptyEl.hidden = false;
      emptyEl.textContent = emptyHint;
    }

    if (hasGeo) {
      openMapsBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${currentGeo.lat},${currentGeo.lng}`,
      )}`;
    }
  }

  function recenterMap() {
    if (!currentGeo || !map) return;
    if (mapEngine === 'leaflet') {
      map.setView([currentGeo.lat, currentGeo.lng], 14);
    } else {
      map.flyTo({ center: [currentGeo.lng, currentGeo.lat], zoom: 14, duration: 500 });
    }
  }

  async function ensureLeafletMap() {
    try {
      const L = await loadLeaflet();
      if (destroyed) return null;

      if (!map) {
        map = L.map(mapEl, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          touchZoom: false,
          boxZoom: false,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        mapEngine = 'leaflet';
        mapShell.classList.add('cl-map-shell--leaflet');
        metaEl.hidden = false;
        metaEl.textContent =
          'OpenStreetMap preview — set MAPBOX_ACCESS_TOKEN for Mapbox tiles and driving directions.';
      }

      mapLoadFailed = false;
      mapLoadError = '';
      return { map, L, engine: 'leaflet' };
    } catch {
      mapLoadFailed = true;
      mapLoadError = 'Could not load map.';
      syncEmptyState();
      return null;
    }
  }

  async function ensureMapboxMap(token) {
    try {
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
          scrollZoom: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
          boxZoom: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        mapShell.classList.add('cl-map-shell--mapbox');
        await new Promise((resolve) => {
          if (map.isStyleLoaded()) resolve();
          else map.once('load', resolve);
        });
        mapEngine = 'mapbox';
        metaEl.hidden = true;
        metaEl.textContent = '';
      }

      mapLoadFailed = false;
      mapLoadError = '';
      return { map, mapboxgl, engine: 'mapbox' };
    } catch {
      mapLoadFailed = true;
      mapLoadError = 'Could not load Mapbox map.';
      syncEmptyState();
      return null;
    }
  }

  async function ensureMap() {
    const token = (opts.token || window.__mapboxAccessToken || '').trim();
    if (token) {
      const ready = await ensureMapboxMap(token);
      if (ready) return ready;
    }
    return ensureLeafletMap();
  }

  async function setLocation(lat, lng, address) {
    if (typeof address === 'string') currentAddress = address.trim();
    const parsedLat = lat == null ? NaN : Number(lat);
    const parsedLng = lng == null ? NaN : Number(lng);
    currentGeo =
      Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
        ? { lat: parsedLat, lng: parsedLng, address: address || currentAddress || '' }
        : null;
    if (!currentGeo) {
      mapReady = false;
      mapLoadFailed = false;
      mapLoadError = '';
    }
    if (currentGeo) {
      geocodeFailed = false;
      mapLoadFailed = false;
      mapLoadError = '';
    }
    syncEmptyState();
    if (!currentGeo) {
      metaEl.hidden = true;
      metaEl.textContent = '';
    }
    clearRoute();

    if (!currentGeo) return;

    const ready = await ensureMap();
    if (!ready || destroyed) return;

    if (ready.engine === 'leaflet') {
      const { map: liveMap, L } = ready;
      liveMap.setView([currentGeo.lat, currentGeo.lng], 14);
      if (!marker) {
        marker = L.marker([currentGeo.lat, currentGeo.lng]).addTo(liveMap);
      } else {
        marker.setLatLng([currentGeo.lat, currentGeo.lng]);
      }
    } else {
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
    }

    mapReady = true;
    syncEmptyState();
    requestAnimationFrame(() => map?.invalidateSize?.() || map?.resize?.());
  }

  function clearRoute() {
    if (!map || mapEngine !== 'mapbox') return;
    if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
    if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);
  }

  async function showDirections() {
    if (!currentGeo) return;
    if (mapEngine !== 'mapbox') {
      metaEl.hidden = false;
      metaEl.textContent = 'Driving directions require MAPBOX_ACCESS_TOKEN.';
      return;
    }
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
      if (!ready || destroyed || ready.engine !== 'mapbox') return;
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
      directionsBtn.disabled = !currentGeo || mapEngine !== 'mapbox';
    }
  }

  directionsBtn.addEventListener('click', () => {
    void showDirections();
  });

  centerBtn.addEventListener('click', () => {
    recenterMap();
  });

  if (opts.lat != null && opts.lng != null) {
    void setLocation(opts.lat, opts.lng, opts.address || '');
  } else {
    syncEmptyState();
  }

  return {
    setLocation,
    setGeocodeFailed(failed = true) {
      geocodeFailed = Boolean(failed);
      syncEmptyState();
    },
    showDirections,
    resize() {
      map?.resize?.();
      map?.invalidateSize?.();
    },
    destroy() {
      destroyed = true;
      mapReady = false;
      clearRoute();
      marker?.remove?.();
      marker = null;
      map?.remove?.();
      map = null;
      mapEngine = null;
      container.replaceChildren();
      container.classList.remove('cl-map-wrap');
    },
  };
}
