import {
  inventoryGetProduct,
  inventoryListProviders,
  inventorySearch,
  isInventoryApiConfigured,
} from '../../src/lib/inventoryClient';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

function featureError(): string {
  return JSON.stringify({ error: 'inventory_sync not enabled in install config features' });
}

function configError(): string {
  return JSON.stringify({ error: 'INVENTORY_API_BASE_URL is not configured' });
}

async function handle_search_inventory(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('inventory_sync')) return featureError();
  if (!isInventoryApiConfigured()) return configError();

  const query = String(args.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'query is required' });

  const result = await inventorySearch({
    query,
    provider: args.provider != null ? String(args.provider) : undefined,
    limit: args.limit != null ? Number(args.limit) : 10,
    inStockOnly: args.in_stock_only === true || args.inStockOnly === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    provider: result.data.provider,
    count: result.data.results.length,
    products: result.data.results,
  });
}

async function handle_get_inventory_product(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('inventory_sync')) return featureError();
  if (!isInventoryApiConfigured()) return configError();

  const provider = String(args.provider ?? 'mock').trim();
  const id = String(args.id ?? args.external_id ?? '').trim();
  if (!id) return JSON.stringify({ error: 'id (external product ID) is required' });

  const result = await inventoryGetProduct(provider, id);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, product: result.data.product });
}

async function handle_list_inventory_channels(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('inventory_sync')) return featureError();
  if (!isInventoryApiConfigured()) return configError();

  const result = await inventoryListProviders();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, providers: result.data.providers });
}

export const inventoryModule: AgentToolModule = {
  id: 'inventory',
  enabled: () => hasFeature('inventory_sync') && isInventoryApiConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_inventory',
          description:
            'Search e-commerce inventory across Shopify, WooCommerce, Square, or all configured channels. Requires inventory_sync feature and INVENTORY_API_BASE_URL.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Keyword, product name, or SKU' },
              provider: {
                type: 'string',
                description: 'Platform id: shopify, woocommerce, square, mock, or all',
              },
              limit: { type: 'number', description: 'Max results (default 10)' },
              in_stock_only: { type: 'boolean', description: 'Only return in-stock items' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_inventory_product',
          description: 'Fetch a single inventory item by platform provider id and external product id.',
          parameters: {
            type: 'object',
            properties: {
              provider: { type: 'string', description: 'Platform id, e.g. shopify, woocommerce, square, mock' },
              id: { type: 'string', description: 'External product or variant id on that platform' },
            },
            required: ['provider', 'id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_inventory_channels',
          description: 'List inventory platforms (Shopify, WooCommerce, Square, etc.) and whether each is configured.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
    ];
  },
  handlers: {
    search_inventory: handle_search_inventory,
    get_inventory_product: handle_get_inventory_product,
    list_inventory_channels: handle_list_inventory_channels,
  },
};
