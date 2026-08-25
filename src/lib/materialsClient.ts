/**
 * eliteweblabs/materials-api — live retail materials pricing (Home Depot, etc.)
 * @see https://github.com/eliteweblabs/materials-api
 */
import { createExternalApiClient, type ExternalApiResult } from './externalApiClient';

const materialsApi = createExternalApiClient({
  baseUrlEnv: 'MATERIALS_API_BASE_URL',
  apiKeyEnv: 'MATERIALS_API_KEY',
  notConfiguredError: 'MATERIALS_API_BASE_URL is not set',
});

export function isMaterialsApiConfigured(): boolean {
  return materialsApi.isConfigured();
}

type MaterialsResult<T> = ExternalApiResult<T>;

async function materialsFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<MaterialsResult<T>> {
  return materialsApi.apiFetch<T>(path, init);
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
