/**
 * eliteweblabs/paulino-wizard — dealership inventory, leads, and test drives.
 * Deployed on Railway (Paulino Auto Group project).
 */
import { serverEnv } from './serverEnv';

function baseUrl(): string | null {
  const raw = serverEnv('PAULINO_WIZARD_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const key = serverEnv('PAULINO_WIZARD_API_KEY')?.trim();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export function isPaulinoWizardConfigured(): boolean {
  return Boolean(baseUrl());
}

type WizardResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function wizardFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<WizardResult<T>> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'PAULINO_WIZARD_API_BASE_URL is not set' };

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

  const errMsg =
    (parsed as { error?: string })?.error ||
    text.slice(0, 300) ||
    res.statusText ||
    `HTTP ${res.status}`;

  if (!res.ok) {
    return { ok: false, error: errMsg, status: res.status };
  }

  if (parsed && typeof parsed === 'object' && (parsed as { success?: boolean }).success === false) {
    return { ok: false, error: errMsg, status: res.status };
  }

  return { ok: true, data: parsed as T };
}

export type DealershipVehicle = {
  id: number;
  site_id: string;
  name: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim_level: string | null;
  price: number | null;
  mileage: number | null;
  color: string | null;
  vin: string | null;
  stock: string | null;
  vehicle_condition: string | null;
  url: string | null;
  image_url: string | null;
  description: string | null;
};

export type DealershipLead = {
  id: string;
  token: string;
  name: string;
  email: string;
  phone: string;
  magicLink?: string;
};

export type DealershipDeal = {
  id: string;
  token: string;
  name: string;
  email: string;
  phone: string;
  vehicle_id: number | null;
  vehicle_name: string;
  vehicle_price: number | null;
  vehicle_image: string | null;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim_level: string | null;
  color: string | null;
  vin: string | null;
  stock: string | null;
  mileage: number | null;
  vehicle_condition: string | null;
  vehicle_url: string | null;
  vehicle_image_live: string | null;
  vehicle_description: string | null;
};

export async function dealershipSearchVehicles(opts?: {
  search?: string;
  make?: string;
  max_price?: number;
  condition?: string;
  limit?: number;
}): Promise<WizardResult<{ vehicles: DealershipVehicle[] }>> {
  const params = new URLSearchParams();
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  if (opts?.make?.trim()) params.set('make', opts.make.trim());
  if (opts?.max_price != null && Number.isFinite(opts.max_price)) {
    params.set('max_price', String(opts.max_price));
  }
  if (opts?.condition?.trim()) params.set('condition', opts.condition.trim());
  params.set('limit', String(opts?.limit ?? 20));
  const qs = params.toString();
  return wizardFetch<{ vehicles: DealershipVehicle[] }>(`/api/vehicles${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export async function dealershipCreateLead(input: {
  name: string;
  phone: string;
  email?: string;
  vehicle_id?: number;
}): Promise<
  WizardResult<{ success: true; token: string; magicLink: string; lead: DealershipLead }>
> {
  if (!input.name?.trim()) return { ok: false, error: 'name is required' };
  if (!input.phone?.trim()) return { ok: false, error: 'phone is required' };
  return wizardFetch<{ success: true; token: string; magicLink: string; lead: DealershipLead }>(
    '/api/leads',
    { method: 'POST', body: input },
  );
}

export async function dealershipGetDeal(
  token: string,
): Promise<WizardResult<DealershipDeal>> {
  const t = token.trim();
  if (!t) return { ok: false, error: 'token is required' };
  return wizardFetch<DealershipDeal>(`/api/deals/${encodeURIComponent(t)}`, { method: 'GET' });
}

export async function dealershipUpdateDeal(
  token: string,
  patch: Record<string, unknown>,
): Promise<WizardResult<{ success: true }>> {
  const t = token.trim();
  if (!t) return { ok: false, error: 'token is required' };
  return wizardFetch<{ success: true }>(`/api/deals/${encodeURIComponent(t)}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function dealershipBookTestDrive(input: {
  leadToken: string;
  name: string;
  phone: string;
  email?: string;
  preferred_time?: string;
  start?: string;
  vehicleName?: string;
  notes?: string;
}): Promise<WizardResult<{ success: true }>> {
  if (!input.leadToken?.trim()) return { ok: false, error: 'leadToken is required' };
  if (!input.name?.trim()) return { ok: false, error: 'name is required' };
  if (!input.phone?.trim()) return { ok: false, error: 'phone is required' };
  if (!input.preferred_time?.trim() && !input.start?.trim()) {
    return { ok: false, error: 'preferred_time or start is required' };
  }
  return wizardFetch<{ success: true }>('/api/booking/create', { method: 'POST', body: input });
}

/** Reachability probe — paulino-wizard has no /health; use public inventory route. */
export async function paulinoWizardPing(): Promise<
  { ok: true; vehicle_count: number } | { ok: false; error: string }
> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'PAULINO_WIZARD_API_BASE_URL is not set' };
  const result = await dealershipSearchVehicles({ limit: 1 });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, vehicle_count: result.data.vehicles.length };
}
