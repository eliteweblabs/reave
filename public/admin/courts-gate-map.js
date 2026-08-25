/**
 * Knowledge sidebar — Mapbox office pin + radius/county/state court gate.
 * Uses PUBLIC_MAPBOX_ACCESS_TOKEN (window.__mapboxAccessToken). No Google Maps.
 */

import { adminFetch, readAdminJson, escHtml } from './shared.js?v=20260810a';
import { iosIcon } from './admin-ui.js?v=20260825f';

const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';
const TOPOJSON_JS = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
const ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

/** Default camera: New England (ME, NH, VT, MA, RI, CT). */
const NEW_ENGLAND_BOUNDS = [
  [-73.73, 40.98],
  [-66.88, 47.46],
];

const FIPS_TO_POSTAL = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
};

const POSTAL_TO_FIPS_ID = Object.fromEntries(
  Object.entries(FIPS_TO_POSTAL).map(([fips, postal]) => [postal, Number(fips)]),
);

let mapboxLoadPromise = null;
let atlasLoadPromise = null;
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

function resolveTopoFeature(mod) {
  return mod?.feature || mod?.default?.feature || null;
}

async function loadMapboxGl() {
  ensureStylesheet(MAPBOX_CSS, 'data-kn-mapbox-css');
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then(resolveMapboxGl);
  }
  return mapboxLoadPromise;
}

async function loadAtlas() {
  if (!atlasLoadPromise) {
    atlasLoadPromise = Promise.all([
      import(/* @vite-ignore */ TOPOJSON_JS).then(resolveTopoFeature),
      fetch(ATLAS_URL).then((res) => {
        if (!res.ok) throw new Error('Could not load US map');
        return res.json();
      }),
    ]).then(([feature, topo]) => {
      if (typeof feature !== 'function' || !topo?.objects?.states || !topo?.objects?.counties) {
        throw new Error('Could not load US map');
      }
      return {
        states: normalizeStatesGeo(feature(topo, topo.objects.states)),
        counties: normalizeCountiesGeo(feature(topo, topo.objects.counties)),
      };
    });
  }
  return atlasLoadPromise;
}

function fipsId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatesGeo(geo) {
  const features = [];
  for (const f of geo.features || []) {
    const fips = String(f.id ?? '').padStart(2, '0');
    const state = FIPS_TO_POSTAL[fips];
    const id = fipsId(fips);
    if (!state || id == null) continue;
    features.push({
      type: 'Feature',
      id,
      properties: {
        fips,
        state,
        name: f.properties?.name || state,
      },
      geometry: f.geometry,
    });
  }
  return { type: 'FeatureCollection', features };
}

function normalizeCountiesGeo(geo) {
  const features = [];
  for (const f of geo.features || []) {
    const fips = String(f.id ?? '').padStart(5, '0');
    const state = FIPS_TO_POSTAL[fips.slice(0, 2)];
    const id = fipsId(fips);
    const name = String(f.properties?.name || '').trim();
    if (!state || !name || id == null) continue;
    features.push({
      type: 'Feature',
      id,
      properties: {
        fips,
        state,
        name,
        key: `${name}, ${state}`,
        label: `${name}, ${state}`,
      },
      geometry: f.geometry,
    });
  }
  return { type: 'FeatureCollection', features };
}

function parseCountyKey(raw, fallbackState = 'MA') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const withState = trimmed.match(/^(.*?)(?:,\s*([A-Za-z]{2}))$/);
  const name = (withState ? withState[1] : trimmed).replace(/\s+county$/i, '').trim();
  const state = (withState ? withState[2] : fallbackState).toUpperCase();
  return name ? `${name}, ${state}` : '';
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
  const selectedStates = new Set((gate.states || []).map((s) => String(s).toUpperCase()).filter(Boolean));
  const selectedCounties = new Set((gate.counties || []).map((c) => parseCountyKey(c)).filter(Boolean));
  const selectedAreas = new Set(
    (gate.practiceAreas?.length ? gate.practiceAreas : [gate.practiceArea || 'bankruptcy']).map((id) =>
      String(id).toLowerCase(),
    ),
  );
  const mode = modes.some((row) => row.id === gate.gateMode) ? gate.gateMode : 'radius';
  const courtCount = Array.isArray(data.courts) ? data.courts.length : 0;
  const token = (window.__mapboxAccessToken || '').trim();
  const stateLabels = new Map(usStates.map((row) => [String(row.id).toUpperCase(), row.label]));

  host.innerHTML =
    `<div class="kn-courts-map">` +
    `<div class="kn-courts-map-head">` +
    `<span class="kn-courts-map-title">${iosIcon('map-pin', 14)} Courts</span>` +
    `<span class="kn-courts-map-count">${courtCount} in gate</span>` +
    `</div>` +
    `<div class="kn-courts-map-canvas-wrap">` +
    `<div class="kn-courts-map-canvas" role="img" aria-label="Map of geographic targets"></div>` +
    `<button type="button" class="kn-courts-map-home" title="Show New England" hidden>NE</button>` +
    `<div class="kn-courts-map-tip" hidden></div>` +
    `</div>` +
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
    `<div class="kn-courts-map-field"${mode === 'state' ? '' : ' hidden'} data-kn-states-field>` +
    `<span>States <em>click the map</em></span>` +
    `<div class="kn-courts-map-chips" data-kn-states></div>` +
    `</div>` +
    `<div class="kn-courts-map-field">` +
    `<span>Departments</span>` +
    `<div class="kn-courts-map-counties kn-courts-map-areas" data-kn-areas>` +
    areas
      .map((row) => {
        const on = selectedAreas.has(String(row.id).toLowerCase());
        return (
          `<label class="kn-courts-map-county">` +
          `<input type="checkbox" value="${escHtml(row.id)}"${on ? ' checked' : ''} />` +
          `${escHtml(row.label)}` +
          `</label>`
        );
      })
      .join('') +
    `</div>` +
    `</div>` +
    `<div class="kn-courts-map-field"${mode === 'counties' ? '' : ' hidden'} data-kn-counties-field>` +
    `<span>Counties <em>click the map</em></span>` +
    `<div class="kn-courts-map-chips" data-kn-counties></div>` +
    `</div>` +
    `<div class="kn-courts-map-field" hidden data-kn-states-fallback-field>` +
    `<span>States</span>` +
    `<div class="kn-courts-map-counties kn-courts-map-states" data-kn-states-fallback>` +
    usStates
      .map((row) => {
        const on = selectedStates.has(String(row.id).toUpperCase());
        return (
          `<label class="kn-courts-map-county">` +
          `<input type="checkbox" value="${escHtml(row.id)}"${on ? ' checked' : ''} />` +
          `${escHtml(row.label)}` +
          `</label>`
        );
      })
      .join('') +
    `</div>` +
    `</div>` +
    `<div class="kn-courts-map-field" hidden data-kn-counties-fallback-field>` +
    `<span>Counties</span>` +
    `<div class="kn-courts-map-counties" data-kn-counties-fallback>` +
    counties
      .map((name) => {
        const key = parseCountyKey(name);
        const on = selectedCounties.has(key) || selectedCounties.has(String(name));
        return (
          `<label class="kn-courts-map-county">` +
          `<input type="checkbox" value="${escHtml(name)}"${on ? ' checked' : ''} />` +
          `${escHtml(name)}` +
          `</label>`
        );
      })
      .join('') +
    `</div>` +
    `</div>` +
    `<p class="kn-courts-map-status"></p>` +
    `</div>`;

  const meta = host.querySelector('.kn-courts-map-meta');
  const status = host.querySelector('.kn-courts-map-status');
  const canvas = host.querySelector('.kn-courts-map-canvas');
  const homeBtn = host.querySelector('.kn-courts-map-home');
  const tip = host.querySelector('.kn-courts-map-tip');

  live = {
    map: null,
    gl: null,
    container: canvas,
    markers: [],
    host,
    status,
    mode,
    data,
    selectedStates,
    selectedCounties,
    stateLabels,
    paintedStateIds: new Set(),
    paintedCountyIds: new Set(),
    hoverKey: null,
    save: null,
    geoReady: false,
    useFallback: !token,
  };

  renderChips(host, 'states', selectedStates, (id) => stateLabels.get(id) || id);
  renderChips(host, 'counties', selectedCounties, (id) => id);

  if (data.origin) {
    meta.textContent = data.origin.label;
  } else {
    meta.textContent = 'Set the office address in Company so Mapbox can drop the pin.';
  }

  let timer = 0;
  const save = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void putGate(host, status), 400);
  };
  live.save = save;

  host.querySelector('[data-kn-radius]')?.addEventListener('input', (e) => {
    const miles = host.querySelector('.kn-courts-map-miles');
    if (miles) miles.textContent = `${e.target.value} mi`;
    save();
  });
  host.querySelector('[data-kn-mode]')?.addEventListener('change', (e) => {
    const next = e.target.value;
    live.mode = next;
    applyModeUi(host, next);
    if (live.map) {
      setPickerLayers(live.map, next);
      fitCamera(live.map, live.gl, live.data, next);
    }
    save();
  });
  host.querySelectorAll('[data-kn-areas] input').forEach((el) => el.addEventListener('change', save));
  host.querySelectorAll('[data-kn-states-fallback] input, [data-kn-counties-fallback] input').forEach((el) =>
    el.addEventListener('change', save),
  );
  host.querySelector('[data-kn-states]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-geo-id]');
    if (!btn) return;
    toggleSelection('states', btn.dataset.geoId);
  });
  host.querySelector('[data-kn-counties]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-geo-id]');
    if (!btn) return;
    toggleSelection('counties', btn.dataset.geoId);
  });
  homeBtn?.addEventListener('click', () => {
    if (!live?.map || !live.gl) return;
    live.map.fitBounds(NEW_ENGLAND_BOUNDS, { padding: 18, duration: 500, maxZoom: 8 });
  });

  if (token && canvas) {
    void drawMap(canvas, data, tip, homeBtn, status);
  } else if (canvas) {
    enableFallback(host, canvas, token);
  }
}

function enableFallback(host, canvas, token) {
  host.setAttribute('data-kn-geo-fallback', '1');
  live.useFallback = true;
  canvas.classList.add('is-empty');
  canvas.textContent = token
    ? 'Could not load the state / county map. Use the lists below.'
    : 'Add PUBLIC_MAPBOX_ACCESS_TOKEN for the map picker.';
  applyModeUi(host, live.mode);
}

function applyModeUi(host, mode) {
  const radiusField = host.querySelector('[data-kn-radius]')?.closest('.kn-courts-map-field');
  const stateField = host.querySelector('[data-kn-states-field]');
  const countyField = host.querySelector('[data-kn-counties-field]');
  const fallbackState = host.querySelector('[data-kn-states-fallback-field]');
  const fallbackCounty = host.querySelector('[data-kn-counties-fallback-field]');
  const useFallback = host.hasAttribute('data-kn-geo-fallback');
  if (radiusField) radiusField.hidden = mode !== 'radius';
  if (stateField) stateField.hidden = useFallback || mode !== 'state';
  if (countyField) countyField.hidden = useFallback || mode !== 'counties';
  if (fallbackState) fallbackState.hidden = !(useFallback && mode === 'state');
  if (fallbackCounty) fallbackCounty.hidden = !(useFallback && mode === 'counties');
}

function renderChips(host, kind, selected, labelFn) {
  const el = host.querySelector(kind === 'states' ? '[data-kn-states]' : '[data-kn-counties]');
  if (!el) return;
  const ids = [...selected];
  if (!ids.length) {
    el.innerHTML = `<span class="kn-courts-map-chips-empty">${
      kind === 'states' ? 'Click a state to add it' : 'Click a county to add it'
    }</span>`;
    return;
  }
  el.innerHTML = ids
    .map((id) => {
      const label = labelFn(id) || id;
      return (
        `<button type="button" class="kn-courts-map-chip" data-geo-id="${escHtml(id)}" title="Remove">` +
        `${escHtml(label)}${iosIcon('x', 12)}` +
        `</button>`
      );
    })
    .join('');
}

function toggleSelection(kind, rawId) {
  if (!live) return;
  const id = kind === 'states' ? String(rawId || '').toUpperCase() : parseCountyKey(rawId);
  if (!id) return;
  const set = kind === 'states' ? live.selectedStates : live.selectedCounties;
  if (set.has(id)) set.delete(id);
  else set.add(id);
  if (kind === 'states') {
    renderChips(live.host, 'states', live.selectedStates, (key) => live.stateLabels.get(key) || key);
  } else {
    renderChips(live.host, 'counties', live.selectedCounties, (key) => key);
  }
  if (live.map && live.geoReady) syncGeoSelection(live.map);
  live.save?.();
}

function readForm(host) {
  const radius = Number(host.querySelector('[data-kn-radius]')?.value);
  const mode = host.querySelector('[data-kn-mode]')?.value || 'radius';
  const practiceAreas = [...host.querySelectorAll('[data-kn-areas] input:checked')].map((el) => el.value);
  const useFallback = host.hasAttribute('data-kn-geo-fallback');
  const counties = useFallback
    ? [...host.querySelectorAll('[data-kn-counties-fallback] input:checked')].map((el) => el.value)
    : [...(live?.selectedCounties || [])];
  const states = useFallback
    ? [...host.querySelectorAll('[data-kn-states-fallback] input:checked')].map((el) => el.value)
    : [...(live?.selectedStates || [])];
  return {
    radiusMi: radius,
    gateMode: mode,
    practiceAreas,
    practiceArea: practiceAreas[0] || 'bankruptcy',
    counties,
    states,
  };
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
    if (live) live.data = data;
    if (live?.map && live.gl) {
      syncPinsAndRadius(live.map, live.gl, data);
    }
    if (status) status.textContent = '';
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? err.message : 'Could not save gate';
  }
}

async function drawMap(canvas, data, tip, homeBtn, status) {
  const token = (window.__mapboxAccessToken || '').trim();
  const gl = await loadMapboxGl();
  if (!gl || !canvas.isConnected || live?.container !== canvas) return;
  gl.accessToken = token;
  const map = new gl.Map({
    container: canvas,
    style: 'mapbox://styles/mapbox/streets-v12',
    bounds: NEW_ENGLAND_BOUNDS,
    fitBoundsOptions: { padding: 18 },
    minZoom: 3,
    maxZoom: 11,
    attributionControl: true,
    dragRotate: false,
    pitchWithRotate: false,
    cooperativeGestures: true,
  });
  if (live) {
    live.map = map;
    live.gl = gl;
  }
  map.addControl(new gl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
  map.on('load', () => {
    if (live?.map !== map) return;
    void setupPicker(map, gl, data, tip, homeBtn, status);
  });
}

async function setupPicker(map, gl, data, tip, homeBtn, status) {
  syncPinsAndRadius(map, gl, data);
  try {
    const atlas = await loadAtlas();
    if (live?.map !== map) return;
    addGeoLayers(map, atlas);
    live.geoReady = true;
    live.countyKeyToId = new Map(
      atlas.counties.features.map((f) => [String(f.properties?.key || '').toLowerCase(), f.id]),
    );
    syncGeoSelection(map);
    bindPickerEvents(map, tip);
    if (homeBtn) homeBtn.hidden = false;
    applyModeUi(live.host, live.mode);
    setPickerLayers(map, live.mode);
    fitCamera(map, gl, data, live.mode);
    map.resize();
  } catch (err) {
    enableFallback(live.host, live.container, true);
    if (status) status.textContent = err instanceof Error ? err.message : 'Could not load US map';
    setPickerLayers(map, 'radius');
    fitCamera(map, gl, data, 'radius');
    map.resize();
  }
}

function addGeoLayers(map, atlas) {
  if (!map.getSource('kn-states')) {
    map.addSource('kn-states', { type: 'geojson', data: atlas.states });
  }
  if (!map.getSource('kn-counties')) {
    map.addSource('kn-counties', { type: 'geojson', data: atlas.counties });
  }
  const fillPaint = {
    'fill-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      '#2563eb',
      ['boolean', ['feature-state', 'hover'], false],
      '#3b82f6',
      '#64748b',
    ],
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      0.42,
      ['boolean', ['feature-state', 'hover'], false],
      0.26,
      0.08,
    ],
  };
  const linePaint = {
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      '#1d4ed8',
      '#475569',
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      1.7,
      0.7,
    ],
    'line-opacity': 0.85,
  };
  if (!map.getLayer('kn-states-fill')) {
    map.addLayer({ id: 'kn-states-fill', type: 'fill', source: 'kn-states', paint: fillPaint });
  }
  if (!map.getLayer('kn-states-line')) {
    map.addLayer({ id: 'kn-states-line', type: 'line', source: 'kn-states', paint: linePaint });
  }
  if (!map.getLayer('kn-counties-fill')) {
    map.addLayer({ id: 'kn-counties-fill', type: 'fill', source: 'kn-counties', paint: fillPaint, layout: { visibility: 'none' } });
  }
  if (!map.getLayer('kn-counties-line')) {
    map.addLayer({ id: 'kn-counties-line', type: 'line', source: 'kn-counties', paint: linePaint, layout: { visibility: 'none' } });
  }
}

function setPickerLayers(map, mode) {
  const setVis = (id, vis) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
  };
  const picking = mode === 'state' || mode === 'counties';
  setVis('kn-states-fill', picking ? 'visible' : 'none');
  setVis('kn-states-line', picking ? 'visible' : 'none');
  setVis('kn-counties-fill', mode === 'counties' ? 'visible' : 'none');
  setVis('kn-counties-line', mode === 'counties' ? 'visible' : 'none');
  setVis('kn-radius-fill', mode === 'radius' ? 'visible' : 'none');
  setVis('kn-radius-line', mode === 'radius' ? 'visible' : 'none');
  if (map.getLayer('kn-states-fill')) {
    map.setPaintProperty(
      'kn-states-fill',
      'fill-opacity',
      mode === 'counties'
        ? [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.18,
            ['boolean', ['feature-state', 'hover'], false],
            0.12,
            0.04,
          ]
        : [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.42,
            ['boolean', ['feature-state', 'hover'], false],
            0.26,
            0.08,
          ],
    );
  }
  const canvas = map.getCanvas();
  if (canvas) canvas.style.cursor = picking ? 'pointer' : '';
  live?.container?.classList.toggle('is-picking', picking);
}

function bindPickerEvents(map, tip) {
  const showTip = (text) => {
    if (!tip) return;
    if (!text) {
      tip.hidden = true;
      tip.textContent = '';
      return;
    }
    tip.hidden = false;
    tip.textContent = text;
  };
  const hover = (source, id, on) => {
    if (live.hoverKey) {
      const [prevSource, prevId] = live.hoverKey.split(':');
      try {
        map.setFeatureState({ source: prevSource, id: Number(prevId) }, { hover: false });
      } catch {
        /* source removed */
      }
      live.hoverKey = null;
    }
    if (on && id != null) {
      map.setFeatureState({ source, id }, { hover: true });
      live.hoverKey = `${source}:${id}`;
    }
  };

  map.on('mousemove', 'kn-states-fill', (e) => {
    if (live?.mode !== 'state') return;
    const f = e.features?.[0];
    if (!f) return;
    hover('kn-states', f.id, true);
    showTip(f.properties?.name || f.properties?.state || '');
  });
  map.on('mouseleave', 'kn-states-fill', () => {
    hover('kn-states', null, false);
    if (live?.mode === 'state') showTip('');
  });
  map.on('click', 'kn-states-fill', (e) => {
    if (live?.mode !== 'state') return;
    const postal = e.features?.[0]?.properties?.state;
    if (postal) toggleSelection('states', postal);
  });

  map.on('mousemove', 'kn-counties-fill', (e) => {
    if (live?.mode !== 'counties') return;
    const f = e.features?.[0];
    if (!f) return;
    hover('kn-counties', f.id, true);
    showTip(f.properties?.label || f.properties?.name || '');
  });
  map.on('mouseleave', 'kn-counties-fill', () => {
    hover('kn-counties', null, false);
    if (live?.mode === 'counties') showTip('');
  });
  map.on('click', 'kn-counties-fill', (e) => {
    if (live?.mode !== 'counties') return;
    const key = e.features?.[0]?.properties?.key;
    if (key) toggleSelection('counties', key);
  });
}

function syncGeoSelection(map) {
  if (!live) return;
  const nextStates = new Set();
  for (const postal of live.selectedStates) {
    const id = POSTAL_TO_FIPS_ID[postal];
    if (id != null) nextStates.add(id);
  }
  for (const id of live.paintedStateIds) {
    if (!nextStates.has(id)) map.setFeatureState({ source: 'kn-states', id }, { selected: false });
  }
  for (const id of nextStates) {
    map.setFeatureState({ source: 'kn-states', id }, { selected: true });
  }
  live.paintedStateIds = nextStates;

  const keyToId = live.countyKeyToId || new Map();
  const nextCounties = new Set();
  for (const key of live.selectedCounties) {
    const id = keyToId.get(String(key).toLowerCase());
    if (id != null) nextCounties.add(id);
  }
  for (const id of live.paintedCountyIds) {
    if (!nextCounties.has(id)) map.setFeatureState({ source: 'kn-counties', id }, { selected: false });
  }
  for (const id of nextCounties) {
    map.setFeatureState({ source: 'kn-counties', id }, { selected: true });
  }
  live.paintedCountyIds = nextCounties;
}

function fitCamera(map, gl, data, mode) {
  if (mode === 'radius' && data?.origin) {
    const bounds = new gl.LngLatBounds();
    bounds.extend([data.origin.lng, data.origin.lat]);
    for (const court of data.courts || []) bounds.extend([court.lng, court.lat]);
    if (data.circle?.coordinates?.[0]) {
      for (const pair of data.circle.coordinates[0]) bounds.extend(pair);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 28, maxZoom: 10, duration: 450 });
      return;
    }
  }
  map.fitBounds(NEW_ENGLAND_BOUNDS, { padding: 18, duration: 450, maxZoom: 8 });
}

function syncPinsAndRadius(map, gl, data) {
  const origin = data.origin;
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
  if (origin) {
    const officeEl = document.createElement('div');
    officeEl.className = 'kn-courts-map-pin kn-courts-map-pin--office';
    officeEl.title = origin.label;
    markers.push(new gl.Marker({ element: officeEl, anchor: 'center' }).setLngLat([origin.lng, origin.lat]).addTo(map));
  }
  for (const court of data.courts || []) {
    const el = document.createElement('div');
    el.className = 'kn-courts-map-pin kn-courts-map-pin--court';
    el.title = `${court.name} · ${court.miles} mi`;
    markers.push(new gl.Marker({ element: el, anchor: 'center' }).setLngLat([court.lng, court.lat]).addTo(map));
  }
  if (live) live.markers = markers;
}
