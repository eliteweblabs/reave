/**
 * GET /api/mapbox/directions — driving route to a destination (admin).
 * Origin defaults to BOOKING_DEFAULT_ADDRESS when configured.
 */
import type { APIRoute } from 'astro';
import { getDrivingDirections, getOfficeCoordinates } from '../../../lib/mapbox';
import { getMapboxAccessToken } from '../../../lib/mapboxAccessToken';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseCoord(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const { userId } = locals.auth?.() ?? {};
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!getMapboxAccessToken()) {
    return json(
      {
        ok: false,
        error: 'Mapbox access token not configured',
        hint: 'Set MAPBOX_ACCESS_TOKEN or PUBLIC_MAPBOX_ACCESS_TOKEN',
      },
      503,
    );
  }

  const toLat = parseCoord(url.searchParams.get('toLat'));
  const toLng = parseCoord(url.searchParams.get('toLng'));
  if (toLat == null || toLng == null) {
    return json({ ok: false, error: 'toLat and toLng are required' }, 400);
  }

  const fromLat = parseCoord(url.searchParams.get('fromLat'));
  const fromLng = parseCoord(url.searchParams.get('fromLng'));
  let origin: { lat: number; lng: number; label?: string } | null = null;

  if (fromLat != null && fromLng != null) {
    origin = { lat: fromLat, lng: fromLng };
  } else {
    origin = await getOfficeCoordinates();
  }

  if (!origin) {
    return json(
      {
        ok: false,
        error: 'Directions origin not configured',
        hint: 'Set BOOKING_DEFAULT_ADDRESS or pass fromLat/fromLng',
      },
      503,
    );
  }

  const destinationLabel = url.searchParams.get('destination')?.trim() || undefined;
  const route = await getDrivingDirections(
    { lat: origin.lat, lng: origin.lng },
    { lat: toLat, lng: toLng },
    { origin: origin.label, destination: destinationLabel },
  );

  if (!route) return json({ ok: false, error: 'Could not compute route' }, 502);

  return json({ ok: true, route });
};
