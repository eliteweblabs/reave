/**
 * GET /api/fleet/map — fleet summary + latest vehicle positions
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { fleetLatestLocations, isFleetApiConfigured } from '../../../lib/fleetClient';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('fleet_tracking')) {
    return json({ ok: false, error: 'fleet_tracking not enabled' }, 404);
  }
  if (!isFleetApiConfigured()) {
    return json({ ok: false, error: 'FLEET_API_BASE_URL is not configured' }, 503);
  }

  const result = await fleetLatestLocations();
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  return json({
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
