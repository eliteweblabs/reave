/**
 * GET /api/fleet/vehicles — list fleet vehicles
 * POST /api/fleet/vehicles — create vehicle
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { fleetCreateVehicle, fleetListVehicles, isFleetApiConfigured } from '../../../lib/fleetClient';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function featureGate(): Response | null {
  if (!hasFeature('fleet_tracking')) {
    return json({ ok: false, error: 'fleet_tracking not enabled' }, 404);
  }
  if (!isFleetApiConfigured()) {
    return json({ ok: false, error: 'FLEET_API_BASE_URL is not configured' }, 503);
  }
  return null;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const blocked = featureGate();
  if (blocked) return blocked;

  const mine = url.searchParams.get('mine') === '1';
  const result = await fleetListVehicles(mine ? { assignedUserId: userId } : undefined);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, vehicles: result.data.vehicles });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const blocked = featureGate();
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await fleetCreateVehicle({
    name: String(body.name ?? ''),
    plate: body.plate != null ? String(body.plate) : undefined,
    clientUid: body.clientUid != null ? String(body.clientUid) : undefined,
    assignedUserId: body.assignedUserId != null ? String(body.assignedUserId) : undefined,
    status: body.status != null ? String(body.status) : undefined,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, vehicle: result.data.vehicle }, 201);
};
