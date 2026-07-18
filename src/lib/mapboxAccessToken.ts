/**
 * Resolve Mapbox access token from env (server-side geocoding / directions).
 * PUBLIC_MAPBOX_ACCESS_TOKEN is used for client map rendering when set.
 */
export function getMapboxAccessToken(): string | undefined {
  const candidates = [
    import.meta.env.MAPBOX_ACCESS_TOKEN,
    import.meta.env.PUBLIC_MAPBOX_ACCESS_TOKEN,
    typeof process !== 'undefined' ? process.env.MAPBOX_ACCESS_TOKEN : undefined,
    typeof process !== 'undefined' ? process.env.PUBLIC_MAPBOX_ACCESS_TOKEN : undefined,
  ];

  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '') return key.trim();
  }

  return undefined;
}

/** Token safe to expose to authenticated admin UI (map rendering). */
export function getPublicMapboxAccessToken(): string | undefined {
  const candidates = [
    import.meta.env.PUBLIC_MAPBOX_ACCESS_TOKEN,
    import.meta.env.MAPBOX_ACCESS_TOKEN,
    typeof process !== 'undefined' ? process.env.PUBLIC_MAPBOX_ACCESS_TOKEN : undefined,
    typeof process !== 'undefined' ? process.env.MAPBOX_ACCESS_TOKEN : undefined,
  ];

  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '') return key.trim();
  }

  return undefined;
}
