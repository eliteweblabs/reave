/**
 * Lazy-load Mapbox GL and Leaflet for admin map panels.
 */

export const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css';
export const MAPBOX_JS = 'https://cdn.jsdelivr.net/npm/mapbox-gl@3.9.0/+esm';
export const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';

let mapboxLoadPromise = null;
let leafletLoadPromise = null;

export function ensureStylesheet(href, attr) {
  if (document.querySelector(`link[${attr}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(attr, '1');
  document.head.appendChild(link);
}

export async function loadMapboxGl() {
  ensureStylesheet(MAPBOX_CSS, 'data-cl-mapbox-css');
  if (!mapboxLoadPromise) {
    mapboxLoadPromise = import(/* @vite-ignore */ MAPBOX_JS).then((mod) => mod.default || mod);
  }
  return mapboxLoadPromise;
}

export async function loadLeaflet() {
  ensureStylesheet(LEAFLET_CSS, 'data-cl-leaflet-css');
  if (!leafletLoadPromise) {
    leafletLoadPromise = import(/* @vite-ignore */ LEAFLET_JS).then((mod) => mod.default || mod);
  }
  return leafletLoadPromise;
}

/** Fleet map uses a distinct stylesheet marker. */
export function ensureMapboxCss(attr = 'data-fl-mapbox-css') {
  ensureStylesheet(MAPBOX_CSS, attr);
}
