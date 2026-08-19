/**
 * Knowledge sidebar — Mapbox office pin + radius/county court gate.
 * Uses PUBLIC_MAPBOX_ACCESS_TOKEN (window.__mapboxAccessToken). No Google Maps.
 */

import { adminFetch, readAdminJson, escHtml } from './shared.js?v=20260810a';
import { iosIcon } from './admin-ui.js?v=20260819a';

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';

let mapboxLoadPromise = null;
let live = null;

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
  ensureStylesheet(MAPBOX_CSS, 'data-kn-mapbox-css');
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then(resolveMapboxGl);
  }
  return mapboxLoadPromise;
}

export function destroyCourtsGateMap() {
  if (live?.map) {
    try {
      live.map.remove();
    } catch {
      /* already torn down with the sidebar */
    }
  }
  live = null;
}

export function mountCourtsGateMap(host) {
  if (!host) return;
  destroyCourtsGateMap();
  host.replaceChildren();
  host.hidden = true;
  void renderGate(host);
}

async function renderGate(host) {
  let data;
  try {
    const res = await adminFetch('/api/admin/practice-gate');
    data = await readAdminJson(res, 'practice-gate');
  } catch {
    return;
  }
  if (!data?.ok || data.industry !== 'law') return;
  if (!host.isConnected) return;
  host.hidden = false;
  paintCard(host, data);
}

function paintCard(host, data) {
  const gate = data.gate || { radiusMi: 60, counties: [], states: [], practiceArea: 'bankruptcy', gateMode: 'radius' };
  const areas = Array.isArray(data.practiceAreas) ? data.practiceAreas : [];
  const modes = Array.isArray(data.gateModes)
    ? data.gateModes
    : [
        { id: 'radius', label: 'Distance from office' },
        { id: 'counties', label: 'County' },
        { id: 'state', label: 'State' },
      ];
  const usStates = Array.isArray(data.usStates) ? data.usStates : [];
  const counties = Array.isArray(data.counties) ? data.counties : [];
  const selected = new Set((gate.counties || []).map((c) => String(c).toLowerCase()));
  const selectedState = String(gate.states?.[0] || '').toUpperCase();
  const mode = modes.some((row) => row.id === gate.gateMode) ? gate.gateMode : 'radius';
  const courtCount = Array.isArray(data.courts) ? data.courts.length : 0;
  const token = (window.__mapboxAccessToken || '').trim();

  host.innerHTML =
    `<div class="kn-courts-map">` +
    `<div class="kn-courts-map-head">` +
    `<span class="kn-courts-map-title">${iosIcon('map-pin', 14)} Courts</span>` +
    `<span class="kn-courts-map-count">${courtCount} in gate</span>` +
    `</div>` +
    `<div class="kn-courts-map-canvas" role="img" aria-label="Mapbox office pin and court radius"></div>` +
    `<p class="kn-courts-map-meta"></p>` +
    `<label class="kn-courts-map-field">` +
    `<span>Knowledge</span>` +
    `<select data-kn-mode>${modes
      .map(
        (row) =>
          `<option value="${escHtml(row.id)}"${row.id === mode ? ' selected' : ''}>${escHtml(row.label)}</option>`,
      )
      .join('')}</select>` +
    `</label>` +
    `<label class="kn-courts-map-field"${mode === 'radius' ? '' : ' hidden'}>` +
    `<span>Radius <em class="kn-courts-map-miles">${escHtml(String(gate.radiusMi))} mi</em></span>` +
    `<input type="range" min="10" max="150" step="5" value="${escHtml(String(gate.radiusMi))}" data-kn-radius />` +
    `</label>` +
    `<label class="kn-courts-map-field"${mode === 'state' ? '' : ' hidden'}>` +
    `<span>State</span>` +
    `<select data-kn-state>` +
    `<option value="">Select state…</option>` +
    usStates
      .map(
        (row) =>
          `<option value="${escHtml(row.id)}"${row.id === selectedState ? ' selected' : ''}>${escHtml(row.label)}</option>`,
      )
      .join('') +
    `</select>` +
    `</label>` +
    `<label class="kn-courts-map-field">` +
    `<span>Department</span>` +
    `<select data-kn-area>${areas
      .map(
        (row) =>
          `<option value="${escHtml(row.id)}"${row.id === gate.practiceArea ? ' selected' : ''}>${escHtml(row.label)}</option>`,
      )
      .join('')}</select>` +
    `</label>` +
    `<div class="kn-courts-map-counties"${mode === 'counties' ? '' : ' hidden'}>` +
    counties
      .map((name) => {
        const on = selected.has(String(name).toLowerCase());
        return (
          `<label class="kn-courts-map-county">` +
          `<input type="checkbox" value="${escHtml(name)}"${on ? ' checked' : ''} />` +
          `${escHtml(name)}` +
          `</label>`
        );
      })
      .join('') +
    `</div>` +
    `<p class="kn-courts-map-status"></p>` +
    `</div>`;

  const meta = host.querySelector('.kn-courts-map-meta');
  const status = host.querySelector('.kn-courts-map-status');
  if (data.origin) {
    meta.textContent = data.origin.label;
  } else {
    meta.textContent = 'Set the office address in Company so Mapbox can drop the pin.';
  }

  const canvas = host.querySelector('.kn-courts-map-canvas');
  if (data.origin && token && canvas) {
    void drawMap(canvas, data);
  } else if (canvas && !token) {
    canvas.classList.add('is-empty');
    canvas.textContent = 'Add PUBLIC_MAPBOX_ACCESS_TOKEN for the Mapbox pin.';
  } else if (canvas && !data.origin) {
    canvas.classList.add('is-empty');
    canvas.textContent = 'No office pin yet.';
  }

  let timer = 0;
  const save = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void putGate(host, status), 400);
  };
  host.querySelector('[data-kn-radius]')?.addEventListener('input', (e) => {
    const miles = host.querySelector('.kn-courts-map-miles');
    if (miles) miles.textContent = `${e.target.value} mi`;
    save();
  });
  host.querySelector('[data-kn-mode]')?.addEventListener('change', (e) => {
    const next = e.target.value;
    const radiusField = host.querySelector('[data-kn-radius]')?.closest('.kn-courts-map-field');
    const stateField = host.querySelector('[data-kn-state]')?.closest('.kn-courts-map-field');
    const countyBox = host.querySelector('.kn-courts-map-counties');
    if (radiusField) radiusField.hidden = next !== 'radius';
    if (stateField) stateField.hidden = next !== 'state';
    if (countyBox) countyBox.hidden = next !== 'counties';
    save();
  });
  host.querySelector('[data-kn-state]')?.addEventListener('change', save);
  host.querySelector('[data-kn-area]')?.addEventListener('change', save);
  host.querySelectorAll('.kn-courts-map-county input').forEach((el) => el.addEventListener('change', save));
}

function readForm(host) {
  const radius = Number(host.querySelector('[data-kn-radius]')?.value);
  const mode = host.querySelector('[data-kn-mode]')?.value || 'radius';
  const practiceArea = host.querySelector('[data-kn-area]')?.value || 'bankruptcy';
  const counties = [...host.querySelectorAll('.kn-courts-map-county input:checked')].map((el) => el.value);
  const state = host.querySelector('[data-kn-state]')?.value?.trim().toUpperCase() || '';
  return { radiusMi: radius, gateMode: mode, practiceArea, counties, states: state ? [state] : [] };
}

async function putGate(host, status) {
  if (status) status.textContent = 'Saving…';
  try {
    const res = await adminFetch('/api/admin/practice-gate', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readForm(host)),
    });
    const data = await readAdminJson(res, 'practice-gate');
    if (!data?.ok) throw new Error(data?.error || 'Could not save');
    const count = host.querySelector('.kn-courts-map-count');
    if (count) count.textContent = `${data.courts?.length ?? 0} in gate`;
    const canvas = host.querySelector('.kn-courts-map-canvas');
    if (canvas && !canvas.classList.contains('is-empty') && live?.map) {
      syncMap(live.map, live.gl, data);
    }
    if (status) status.textContent = '';
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? err.message : 'Could not save gate';
  }
}

async function drawMap(canvas, data) {
  const token = (window.__mapboxAccessToken || '').trim();
  const gl = await loadMapboxGl();
  if (!gl || !canvas.isConnected || !data.origin) return;
  gl.accessToken = token;
  const map = new gl.Map({
    container: canvas,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [data.origin.lng, data.origin.lat],
    zoom: 8,
    attributionControl: true,
  });
  live = { map, gl, container: canvas };
  map.on('load', () => {
    if (live?.map !== map) return;
    syncMap(map, gl, data);
    map.resize();
  });
}

function syncMap(map, gl, data) {
  const origin = data.origin;
  if (!origin) return;
  if (data.circle) {
    const geo = { type: 'Feature', geometry: data.circle, properties: {} };
    const src = map.getSource('kn-radius');
    if (src) src.setData(geo);
    else {
      map.addSource('kn-radius', { type: 'geojson', data: geo });
      map.addLayer({
        id: 'kn-radius-fill',
        type: 'fill',
        source: 'kn-radius',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'kn-radius-line',
        type: 'line',
        source: 'kn-radius',
        paint: { 'line-color': '#2563eb', 'line-width': 1.5, 'line-opacity': 0.65 },
      });
    }
  }
  if (live?.markers) {
    for (const marker of live.markers) marker.remove();
  }
  const markers = [];
  const officeEl = document.createElement('div');
  officeEl.className = 'kn-courts-map-pin kn-courts-map-pin--office';
  officeEl.title = origin.label;
  markers.push(new gl.Marker({ element: officeEl, anchor: 'center' }).setLngLat([origin.lng, origin.lat]).addTo(map));
  for (const court of data.courts || []) {
    const el = document.createElement('div');
    el.className = 'kn-courts-map-pin kn-courts-map-pin--court';
    el.title = `${court.name} · ${court.miles} mi`;
    markers.push(new gl.Marker({ element: el, anchor: 'center' }).setLngLat([court.lng, court.lat]).addTo(map));
  }
  if (live) live.markers = markers;
  const bounds = new gl.LngLatBounds();
  bounds.extend([origin.lng, origin.lat]);
  for (const court of data.courts || []) bounds.extend([court.lng, court.lat]);
  if (data.circle?.coordinates?.[0]) {
    for (const pair of data.circle.coordinates[0]) bounds.extend(pair);
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 28, maxZoom: 10, duration: 0 });
  }
}
