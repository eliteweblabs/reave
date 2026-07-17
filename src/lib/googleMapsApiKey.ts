/**
 * Resolve Google Maps / Places server API key from env (multi-site + Railway naming).
 * Prefer server-only keys; PUBLIC_* is a last resort for server proxy routes.
 */
export function getGoogleMapsApiKey(): string | undefined {
  const candidates = [
    import.meta.env.GOOGLE_MAPS_API_KEY,
    import.meta.env.GOOGLE_PLACES_API_KEY,
    import.meta.env.PUBLIC_GOOGLE_MAPS_API_KEY,
    typeof process !== 'undefined' ? process.env.GOOGLE_MAPS_API_KEY : undefined,
    typeof process !== 'undefined' ? process.env.GOOGLE_PLACES_API_KEY : undefined,
    typeof process !== 'undefined' ? process.env.PUBLIC_GOOGLE_MAPS_API_KEY : undefined,
  ];

  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '') {
      return key.trim();
    }
  }

  return undefined;
}
