/**
 * inventory-api — multi-channel e-commerce inventory (Shopify, WooCommerce, Square, …)
 * Bootstrap: bootstrap/inventory-api/
 */
import { serverEnv } from './serverEnv';

function baseUrl(): string | null {
  const raw = serverEnv('INVENTORY_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const key = serverEnv('INVENTORY_API_KEY')?.trim();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export function isInventoryApiConfigured(): boolean {
  return Boolean(baseUrl());
}

type InventoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function inventoryFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<InventoryResult<T>> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'INVENTORY_API_BASE_URL is not set' };

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

export type InventoryLocation = {
  id: string;
  name: string;
  quantity: number;
};

export type InventoryProduct = {
  platform: string;
  externalId: string;
  sku: string | null;
  title: string;
  variantTitle?: string | null;
  price: { amount: number; currency: string };
  quantity: number | null;
  inStock: boolean;
  locations?: InventoryLocation[] | null;
  url?: string | null;
  imageUrl?: string | null;
  lastSyncedAt: string;
};

export type InventorySearchInput = {
  query: string;
  provider?: string;
  limit?: number;
  page?: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
};

export type InventorySearchResponse = {
  ok: true;
  results: InventoryProduct[];
  provider: string;
  query: string;
  cached?: boolean;
};

export type InventoryProvidersResponse = {
  ok: true;
  providers: Array<{ id: string; label: string; platform: string; configured: boolean }>;
};

export type InventoryProductResponse = {
  ok: true;
  product: InventoryProduct;
  provider: string;
  cached?: boolean;
};

export async function inventorySearch(input: InventorySearchInput): Promise<InventoryResult<InventorySearchResponse>> {
  return inventoryFetch('/api/search', {
    method: 'POST',
    body: {
      query: input.query,
      provider: input.provider,
      limit: input.limit,
      page: input.page,
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      inStockOnly: input.inStockOnly,
    },
  });
}

export async function inventoryListProviders(): Promise<InventoryResult<InventoryProvidersResponse>> {
  return inventoryFetch('/api/providers', { method: 'GET' });
}

export async function inventoryGetProduct(
  provider: string,
  id: string,
): Promise<InventoryResult<InventoryProductResponse>> {
  const p = encodeURIComponent(provider);
  const i = encodeURIComponent(id);
  return inventoryFetch(`/api/products/${p}/${i}`, { method: 'GET' });
}
