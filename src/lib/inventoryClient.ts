/**
 * inventory-api — multi-channel e-commerce inventory (Shopify, WooCommerce, Square, …)
 * Bootstrap: bootstrap/inventory-api/
 */
import { createExternalApiClient, type ExternalApiResult } from './externalApiClient';

const inventoryApi = createExternalApiClient({
  baseUrlEnv: 'INVENTORY_API_BASE_URL',
  apiKeyEnv: 'INVENTORY_API_KEY',
  notConfiguredError: 'INVENTORY_API_BASE_URL is not set',
});

export function isInventoryApiConfigured(): boolean {
  return inventoryApi.isConfigured();
}

type InventoryResult<T> = ExternalApiResult<T>;

async function inventoryFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<InventoryResult<T>> {
  return inventoryApi.apiFetch<T>(path, init);
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
