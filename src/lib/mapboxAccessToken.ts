import { serverEnv } from './serverEnv';

/**
 * Server-side Mapbox token (geocoding / directions APIs).
 * Prefers MAPBOX_ACCESS_TOKEN; falls back to PUBLIC_MAPBOX_ACCESS_TOKEN.
 */
export function getMapboxAccessToken(): string | undefined {
  const candidates = [
    serverEnv('MAPBOX_ACCESS_TOKEN'),
    serverEnv('PUBLIC_MAPBOX_ACCESS_TOKEN'),
  ];

  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '') return key.trim();
  }

  return undefined;
}

/**
 * Browser-safe Mapbox token for map rendering.
 * Only PUBLIC_MAPBOX_ACCESS_TOKEN — never falls back to server-only MAPBOX_ACCESS_TOKEN.
 */
export function getPublicMapboxAccessToken(): string | undefined {
  const key = serverEnv('PUBLIC_MAPBOX_ACCESS_TOKEN');
  if (typeof key === 'string' && key.trim() !== '') return key.trim();
  return undefined;
}
