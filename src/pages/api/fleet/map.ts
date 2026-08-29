/**
 * GET /api/fleet/map — fleet summary + latest vehicle positions
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { fleetLatestLocations, isFleetApiConfigured } from '../../../lib/fleetClient';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!hasFeature('fleet_tracking')) {
    return jsonResponse({ ok: false, error: 'fleet_tracking not enabled' }, 404);
  }
  if (!isFleetApiConfigured()) {
    return jsonResponse({ ok: false, error: 'FLEET_API_BASE_URL is not configured' }, 503);
  }

  const result = await fleetLatestLocations();
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  return jsonResponse({
    ok: true,
    configured: true,
    summary: {
      total: result.data.total,
      active: result.data.active,
      offline: result.data.offline,
      located: result.data.located,
    },
    vehicles: result.data.vehicles,
  });
};
