import {
  isMaterialsApiConfigured,
  materialsListProviders,
  materialsLookupUrl,
  materialsQuote,
  materialsSearch,
  type MaterialsQuoteItem,
} from '../../src/lib/materialsClient';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

function featureError(): string {
  return JSON.stringify({ error: 'materials_pricing not enabled in install config features' });
}

function configError(): string {
  return JSON.stringify({ error: 'MATERIALS_API_BASE_URL is not configured' });
}

async function handle_search_materials(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('materials_pricing')) return featureError();
  if (!isMaterialsApiConfigured()) return configError();

  const query = String(args.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'query is required' });

  const result = await materialsSearch({
    query,
    provider: args.provider != null ? String(args.provider) : undefined,
    zip: args.zip != null ? String(args.zip) : undefined,
    limit: args.limit != null ? Number(args.limit) : 10,
    page: args.page != null ? Number(args.page) : undefined,
    minPrice: args.min_price != null ? Number(args.min_price) : undefined,
    maxPrice: args.max_price != null ? Number(args.max_price) : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    provider: result.data.provider,
    count: result.data.results.length,
    products: result.data.results,
  });
}

async function handle_lookup_materials_url(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('materials_pricing')) return featureError();
  if (!isMaterialsApiConfigured()) return configError();

  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });

  const result = await materialsLookupUrl({
    url,
    provider: args.provider != null ? String(args.provider) : undefined,
    zip: args.zip != null ? String(args.zip) : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, product: result.data.product, provider: result.data.provider });
}

async function handle_quote_materials(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('materials_pricing')) return featureError();
  if (!isMaterialsApiConfigured()) return configError();

  const rawItems = args.items;
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return JSON.stringify({ error: 'items array is required' });
  }

  const items: MaterialsQuoteItem[] = rawItems.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      query: o.query != null ? String(o.query) : undefined,
      url: o.url != null ? String(o.url) : undefined,
      id: o.id != null ? String(o.id) : undefined,
      sku: o.sku != null ? String(o.sku) : undefined,
      quantity: o.quantity != null ? Number(o.quantity) : undefined,
      label: o.label != null ? String(o.label) : undefined,
    };
  });

  const result = await materialsQuote({
    items,
    provider: args.provider != null ? String(args.provider) : undefined,
    zip: args.zip != null ? String(args.zip) : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    provider: result.data.provider,
    currency: result.data.currency,
    subtotal: result.data.subtotal,
    lineItems: result.data.lineItems,
  });
}

async function handle_list_materials_providers(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('materials_pricing')) return featureError();
  if (!isMaterialsApiConfigured()) return configError();

  const result = await materialsListProviders();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, providers: result.data.providers });
}

export const materialsModule: AgentToolModule = {
  id: 'materials',
  enabled: () => hasFeature('materials_pricing') && isMaterialsApiConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_materials',
          description:
            'Search retail materials (Home Depot, etc.) by keyword. Requires materials_pricing feature and MATERIALS_API_BASE_URL. Pass zip for store-specific pricing.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Product name, SKU, or material type' },
              provider: { type: 'string', description: 'Retailer provider id (default homedepot)' },
              zip: { type: 'string', description: 'US ZIP for local store pricing' },
              limit: { type: 'number', description: 'Max results (default 10)' },
              min_price: { type: 'number', description: 'Minimum unit price filter' },
              max_price: { type: 'number', description: 'Maximum unit price filter' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'lookup_materials_url',
          description: 'Look up live price and availability for a retailer product URL (e.g. homedepot.com).',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Full product page URL' },
              provider: { type: 'string', description: 'Retailer provider id' },
              zip: { type: 'string', description: 'US ZIP for local store pricing' },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'quote_materials',
          description:
            'Build a materials quote with quantities. Each item can use query, url, id, or sku. Map line items to Crater invoices via billing tools.',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    url: { type: 'string' },
                    id: { type: 'string' },
                    sku: { type: 'string' },
                    quantity: { type: 'number' },
                    label: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
              provider: { type: 'string' },
              zip: { type: 'string' },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_materials_providers',
          description: 'List materials-api retailers (Home Depot, etc.) and whether each upstream is configured.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
    ];
  },
  handlers: {
    search_materials: handle_search_materials,
    lookup_materials_url: handle_lookup_materials_url,
    quote_materials: handle_quote_materials,
    list_materials_providers: handle_list_materials_providers,
  },
};
