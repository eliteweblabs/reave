/**
 * Resolve Google Maps / Places server API key from env (multi-site + Railway naming).
 * Prefer server-only keys; PUBLIC_* is a last resort for server proxy routes.
 */
import { serverEnv } from './serverEnv';

export function getGoogleMapsApiKey(): string | undefined {
  const candidates = [
    serverEnv('GOOGLE_MAPS_API_KEY'),
    serverEnv('GOOGLE_PLACES_API_KEY'),
    serverEnv('PUBLIC_GOOGLE_MAPS_API_KEY'),
  ];

  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '') {
      return key.trim();
    }
  }

  return undefined;
}
