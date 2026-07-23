/**
 * eliteweblabs/materials-api — live retail materials pricing (Home Depot, etc.)
 * @see https://github.com/eliteweblabs/materials-api
 */
import { serverEnv } from './serverEnv';

function baseUrl(): string | null {
  const raw = serverEnv('MATERIALS_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const key = serverEnv('MATERIALS_API_KEY')?.trim();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export function isMaterialsApiConfigured(): boolean {
  return Boolean(baseUrl());
}

type MaterialsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function materialsFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<MaterialsResult<T>> {
  const base = baseUrl();
  if (!base) return { ok: false, error: 'MATERIALS_API_BASE_URL is not set' };

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

export type MaterialsSearchInput = {
  query: string;
  provider?: string;
  zip?: string;
  limit?: number;
  page?: number;
  minPrice?: number;
  maxPrice?: number;
};

export type MaterialsProduct = {
  provider: string;
  id: string;
  title: string;
  brand?: string | null;
  modelNumber?: string | null;
  sku?: string | null;
  upc?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  offer: {
    price: number;
    listPrice?: number | null;
    currency: string;
    inStock?: boolean | null;
    availabilityText?: string | null;
    storePickup?: boolean | null;
    shipToHome?: boolean | null;
  };
  unit?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
};

export type MaterialsSearchResponse = {
  ok: true;
  results: MaterialsProduct[];
  provider: string;
  query: string;
  zip: string | null;
  cached?: boolean;
};

export async function materialsSearch(
  input: MaterialsSearchInput,
): Promise<MaterialsResult<MaterialsSearchResponse>> {
  if (!input.query?.trim()) return { ok: false, error: 'query is required' };
  return materialsFetch<MaterialsSearchResponse>('/api/search', {
    method: 'POST',
    body: input,
  });
}

export type MaterialsLookupInput = {
  url: string;
  provider?: string;
  zip?: string;
};

export type MaterialsLookupResponse = {
  ok: true;
  product: MaterialsProduct;
  provider: string;
  url: string;
  zip: string | null;
  cached?: boolean;
};

export async function materialsLookupUrl(
  input: MaterialsLookupInput,
): Promise<MaterialsResult<MaterialsLookupResponse>> {
  if (!input.url?.trim()) return { ok: false, error: 'url is required' };
  return materialsFetch<MaterialsLookupResponse>('/api/products/lookup', {
    method: 'POST',
    body: input,
  });
}

export type MaterialsQuoteItem = {
  query?: string;
  url?: string;
  id?: string;
  sku?: string;
  quantity?: number;
  label?: string;
};

export type MaterialsQuoteInput = {
  items: MaterialsQuoteItem[];
  provider?: string;
  zip?: string;
};

export type MaterialsQuoteLineItem = {
  label: string;
  quantity: number;
  unitPrice: number;
  extended: number;
  product: MaterialsProduct;
};

export type MaterialsQuoteResponse = {
  ok: true;
  provider: string;
  zip: string | null;
  currency: string;
  lineItems: MaterialsQuoteLineItem[];
  subtotal: number;
};

export async function materialsQuote(
  input: MaterialsQuoteInput,
): Promise<MaterialsResult<MaterialsQuoteResponse>> {
  if (!input.items?.length) return { ok: false, error: 'items is required' };
  return materialsFetch<MaterialsQuoteResponse>('/api/prices/quote', {
    method: 'POST',
    body: input,
  });
}

export type MaterialsProviderInfo = {
  id: string;
  label: string;
  configured: boolean;
  retailer: string;
};

export async function materialsListProviders(): Promise<
  MaterialsResult<{ ok: true; providers: MaterialsProviderInfo[] }>
> {
  return materialsFetch<{ ok: true; providers: MaterialsProviderInfo[] }>('/api/providers', {
    method: 'GET',
  });
}
