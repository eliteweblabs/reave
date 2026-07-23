/**
 * PATCH /api/fleet/vehicles/:id — update vehicle
 * DELETE /api/fleet/vehicles/:id — remove vehicle
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { fleetDeleteVehicle, fleetUpdateVehicle, isFleetApiConfigured } from '../../../../lib/fleetClient';

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

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const blocked = featureGate();
  if (blocked) return blocked;

  const id = params.id?.trim();
  if (!id) return json({ ok: false, error: 'Vehicle id required' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await fleetUpdateVehicle(id, {
    name: body.name != null ? String(body.name) : undefined,
    plate: body.plate !== undefined ? (body.plate ? String(body.plate) : null) : undefined,
    clientUid: body.clientUid !== undefined ? (body.clientUid ? String(body.clientUid) : null) : undefined,
    assignedUserId:
      body.assignedUserId !== undefined
        ? body.assignedUserId
          ? String(body.assignedUserId)
          : null
        : undefined,
    status: body.status != null ? String(body.status) : undefined,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, vehicle: result.data.vehicle });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const blocked = featureGate();
  if (blocked) return blocked;

  const id = params.id?.trim();
  if (!id) return json({ ok: false, error: 'Vehicle id required' }, 400);

  const result = await fleetDeleteVehicle(id);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true });
};
