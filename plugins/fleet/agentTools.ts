import {
  fleetCreateVehicle,
  fleetLatestLocations,
  fleetListVehicles,
  isFleetApiConfigured,
} from '../../src/lib/fleetClient';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_list_fleet_vehicles(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('fleet_tracking')) {
    return JSON.stringify({ error: 'fleet_tracking not enabled in install config features' });
  }
  if (!isFleetApiConfigured()) {
    return JSON.stringify({ error: 'FLEET_API_BASE_URL is not configured' });
  }
  const result = await fleetLatestLocations();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    total: result.data.total,
    active: result.data.active,
    offline: result.data.offline,
    located: result.data.located,
    vehicles: result.data.vehicles,
  });
}

async function handle_create_fleet_vehicle(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('fleet_tracking')) {
    return JSON.stringify({ error: 'fleet_tracking not enabled in install config features' });
  }
  if (!isFleetApiConfigured()) {
    return JSON.stringify({ error: 'FLEET_API_BASE_URL is not configured' });
  }
  const name = String(args.name ?? '').trim();
  if (!name) return JSON.stringify({ error: 'name is required' });
  const result = await fleetCreateVehicle({
    name,
    plate: args.plate != null ? String(args.plate).trim() : undefined,
    clientUid: args.clientUid != null ? String(args.clientUid).trim() : undefined,
    assignedUserId: args.assignedUserId != null ? String(args.assignedUserId).trim() : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, vehicle: result.data.vehicle });
}

export const fleetModule: AgentToolModule = {
  id: 'fleet',
  enabled: () => hasFeature('fleet_tracking') && isFleetApiConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_fleet_vehicles',
          description:
            'List all fleet vehicles with last known GPS position and status. Requires fleet_tracking feature and FLEET_API_BASE_URL.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_fleet_vehicle',
          description:
            'Add a vehicle to the fleet registry. Optionally assign a Clerk user id so their Reave App session reports GPS for this vehicle.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Vehicle label (e.g. "Van 3", "Truck A")' },
              plate: { type: 'string', description: 'License plate' },
              clientUid: { type: 'string', description: 'Contact uid to link this vehicle to a client' },
              assignedUserId: {
                type: 'string',
                description: 'Clerk user id of the driver — Reave App reports location when they are signed in',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    list_fleet_vehicles: handle_list_fleet_vehicles,
    create_fleet_vehicle: handle_create_fleet_vehicle,
  },
};
