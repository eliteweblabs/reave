import { serverEnv } from './serverEnv';

/**
 * Resolve Mapbox access token from env (server-side geocoding / directions).
 * PUBLIC_MAPBOX_ACCESS_TOKEN is used for client map rendering when set.
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

/** Token safe to expose to authenticated admin UI (map rendering). */
export function getPublicMapboxAccessToken(): string | undefined {
  const candidates = [
    serverEnv('PUBLIC_MAPBOX_ACCESS_TOKEN'),
    serverEnv('MAPBOX_ACCESS_TOKEN'),
  ];

  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '') return key.trim();
  }

  return undefined;
}
