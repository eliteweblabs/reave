const { mockProvider } = require('./mock');
const { shopifyProvider } = require('./shopify');
const { woocommerceProvider } = require('./woocommerce');
const { squareProvider } = require('./square');

const ALL_PROVIDERS = [shopifyProvider, woocommerceProvider, squareProvider, mockProvider];

const PROVIDER_MAP = Object.fromEntries(ALL_PROVIDERS.map((p) => [p.id, p]));

const PLATFORM_ALIASES = {
  shopify: 'shopify',
  woo: 'woocommerce',
  woocommerce: 'woocommerce',
  square: 'square',
  mock: 'mock',
  all: 'all',
};

function providerOrder() {
  const raw = process.env.INVENTORY_PROVIDER_ORDER?.trim();
  if (!raw) return ['shopify', 'woocommerce', 'square', 'mock'];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function resolveProviderId(input) {
  const key = String(input || 'mock').trim().toLowerCase();
  if (PROVIDER_MAP[key]) return key;
  const alias = PLATFORM_ALIASES[key];
  if (alias === 'all') return 'all';
  if (alias && PROVIDER_MAP[alias]) {
    const p = PROVIDER_MAP[alias];
    if (p.isConfigured()) return alias;
    if (alias === 'mock' || mockProvider.isConfigured()) return 'mock';
    return alias;
  }
  return key;
}

function getProvider(id) {
  const resolved = resolveProviderId(id);
  if (resolved === 'all') return null;
  const provider = PROVIDER_MAP[resolved];
  if (!provider) {
    const err = new Error(`Unknown provider: ${id}`);
    err.status = 400;
    throw err;
  }
  if (!provider.isConfigured()) {
    const err = new Error(`Provider not configured: ${provider.id}`);
    err.status = 503;
    throw err;
  }
  return provider;
}

function listProviders() {
  return ALL_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    platform: p.platform,
    configured: p.isConfigured(),
  }));
}

async function searchAll(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
  const merged = [];
  const seen = new Set();
  for (const id of providerOrder()) {
    const p = PROVIDER_MAP[id];
    if (!p?.isConfigured()) continue;
    try {
      const batch = await p.search(query, { ...opts, limit });
      for (const item of batch) {
        const key = `${item.platform}:${item.externalId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
        if (merged.length >= limit) return merged;
      }
    } catch (e) {
      if (e.status === 501) continue;
      throw e;
    }
  }
  return merged;
}

module.exports = {
  ALL_PROVIDERS,
  getProvider,
  listProviders,
  resolveProviderId,
  searchAll,
};
