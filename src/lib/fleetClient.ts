/**
 * eliteweblabs/fleet-api — multi-vehicle location tracking
 * @see https://github.com/eliteweblabs/fleet-api
 */
import { serverEnv } from './serverEnv';

function baseUrl(): string | null {
  const raw = serverEnv('FLEET_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const key = serverEnv('FLEET_API_KEY')?.trim();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export function isFleetApiConfigured(): boolean {
  return Boolean(baseUrl());
}

type FleetResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function fleetFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<FleetResult<T>> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'FLEET_API_BASE_URL is not set' };

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: authHeaders(),
      body: init.body != null ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }
  }

  if (!res.ok || (parsed && typeof parsed === 'object' && (parsed as { ok?: boolean }).ok === false)) {
    const msg =
      (parsed as { error?: string })?.error ||
      text.slice(0, 300) ||
      res.statusText ||
      `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: parsed as T };
}

export type FleetVehicle = {
  id: string;
  name: string;
  plate: string | null;
  status: string;
  clientUid: string | null;
  assignedUserId: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastHeading: number | null;
  lastSpeed: number | null;
  lastAccuracy: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fleetListVehicles(opts?: {
  assignedUserId?: string;
}): Promise<FleetResult<{ ok: true; vehicles: FleetVehicle[] }>> {
  const qs = opts?.assignedUserId
    ? `?assignedUserId=${encodeURIComponent(opts.assignedUserId)}`
    : '';
  return fleetFetch<{ ok: true; vehicles: FleetVehicle[] }>(`/api/vehicles${qs}`, {
    method: 'GET',
  });
}

export type FleetCreateInput = {
  name: string;
  plate?: string;
  clientUid?: string;
  assignedUserId?: string;
  status?: string;
};

export async function fleetCreateVehicle(
  input: FleetCreateInput,
): Promise<FleetResult<{ ok: true; vehicle: FleetVehicle }>> {
  if (!input.name?.trim()) return { ok: false, error: 'name is required' };
  return fleetFetch<{ ok: true; vehicle: FleetVehicle }>('/api/vehicles', {
    method: 'POST',
    body: input,
  });
}

export type FleetUpdateInput = {
  name?: string;
  plate?: string | null;
  clientUid?: string | null;
  assignedUserId?: string | null;
  status?: string;
};

export async function fleetUpdateVehicle(
  id: string,
  patch: FleetUpdateInput,
): Promise<FleetResult<{ ok: true; vehicle: FleetVehicle }>> {
  return fleetFetch<{ ok: true; vehicle: FleetVehicle }>(`/api/vehicles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function fleetDeleteVehicle(id: string): Promise<FleetResult<{ ok: true }>> {
  return fleetFetch<{ ok: true }>(`/api/vehicles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export type FleetLocationInput = {
  userId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  source?: string;
};

export async function fleetRecordLocation(
  input: FleetLocationInput,
): Promise<FleetResult<{ ok: true; vehicle: FleetVehicle }>> {
  return fleetFetch<{ ok: true; vehicle: FleetVehicle }>('/api/location', {
    method: 'POST',
    body: input,
  });
}

export type FleetSummary = {
  ok: true;
  total: number;
  active: number;
  offline: number;
  located: number;
  vehicles: FleetVehicle[];
};

export async function fleetLatestLocations(): Promise<FleetResult<FleetSummary>> {
  return fleetFetch<FleetSummary>('/api/locations/latest', { method: 'GET' });
}

export type FleetHistoryPoint = {
  id: string;
  vehicleId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
  source: string;
};

export async function fleetVehicleHistory(
  vehicleId: string,
  limit = 50,
): Promise<FleetResult<{ ok: true; vehicleId: string; history: FleetHistoryPoint[] }>> {
  return fleetFetch<{ ok: true; vehicleId: string; history: FleetHistoryPoint[] }>(
    `/api/vehicles/${encodeURIComponent(vehicleId)}/history?limit=${limit}`,
    { method: 'GET' },
  );
}
