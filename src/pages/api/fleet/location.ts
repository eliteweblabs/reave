/**
 * POST /api/fleet/location — GPS ping from signed-in Reave App user
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { fleetRecordLocation, isFleetApiConfigured } from '../../../lib/fleetClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export const POST: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  const { request } = context;
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('fleet_tracking')) {
    return jsonResponse({ ok: false, error: 'fleet_tracking not enabled' }, 404);
  }
  if (!isFleetApiConfigured()) {
    return jsonResponse({ ok: false, error: 'FLEET_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ ok: false, error: 'lat and lng are required numbers' }, 400);
  }

  const result = await fleetRecordLocation({
    userId,
    lat,
    lng,
    heading: body.heading != null ? Number(body.heading) : null,
    speed: body.speed != null ? Number(body.speed) : null,
    accuracy: body.accuracy != null ? Number(body.accuracy) : null,
    source: 'app',
  });

  if (!result.ok) {
    const status = result.status === 404 ? 404 : result.status ?? 502;
    return jsonResponse({ ok: false, error: result.error }, status);
  }
  return jsonResponse({ ok: true, vehicle: result.data.vehicle });
};
