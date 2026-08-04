/** @typedef {import('./types').InventoryProduct} InventoryProduct */
/** @typedef {import('./types').SearchOptions} SearchOptions */

const NOW = () => new Date().toISOString();

const MOCK_CATALOG = [
  {
    platform: 'shopify',
    externalId: 'gid://shopify/ProductVariant/1001',
    sku: 'TEE-NAVY-M',
    title: 'Organic Cotton Tee',
    variantTitle: 'Navy / M',
    price: { amount: 32, currency: 'USD' },
    quantity: 48,
    inStock: true,
    locations: [{ id: 'main', name: 'Main warehouse', quantity: 48 }],
    url: 'https://demo-store.myshopify.com/products/organic-cotton-tee',
    imageUrl: null,
  },
  {
    platform: 'woocommerce',
    externalId: 'wc-2044',
    sku: 'MUG-HAND-01',
    title: 'Handmade Ceramic Mug',
    variantTitle: '12 oz',
    price: { amount: 24.5, currency: 'USD' },
    quantity: 12,
    inStock: true,
    locations: [{ id: 'store', name: 'WooCommerce store', quantity: 12 }],
    url: 'https://shop.example.com/product/handmade-ceramic-mug',
    imageUrl: null,
  },
  {
    platform: 'square',
    externalId: 'sq-var-espresso-12',
    sku: 'ESP-12OZ',
    title: 'Espresso Blend',
    variantTitle: '12 oz bag',
    price: { amount: 18, currency: 'USD' },
    quantity: 86,
    inStock: true,
    locations: [
      { id: 'loc-1', name: 'Cafe counter', quantity: 24 },
      { id: 'loc-2', name: 'Back stock', quantity: 62 },
    ],
    url: null,
    imageUrl: null,
  },
  {
    platform: 'shopify',
    externalId: 'gid://shopify/ProductVariant/1002',
    sku: 'HOOD-GRY-L',
    title: 'Fleece Hoodie',
    variantTitle: 'Gray / L',
    price: { amount: 68, currency: 'USD' },
    quantity: 0,
    inStock: false,
    locations: [{ id: 'main', name: 'Main warehouse', quantity: 0 }],
    url: 'https://demo-store.myshopify.com/products/fleece-hoodie',
    imageUrl: null,
  },
  {
    platform: 'woocommerce',
    externalId: 'wc-3099',
    sku: 'CANDLE-LAV',
    title: 'Lavender Soy Candle',
    variantTitle: '8 oz',
    price: { amount: 19, currency: 'USD' },
    quantity: 34,
    inStock: true,
    locations: [{ id: 'store', name: 'WooCommerce store', quantity: 34 }],
    url: 'https://shop.example.com/product/lavender-soy-candle',
    imageUrl: null,
  },
  {
    platform: 'square',
    externalId: 'sq-var-cold-brew',
    sku: 'CB-16OZ',
    title: 'Cold Brew Concentrate',
    variantTitle: '16 oz',
    price: { amount: 14.5, currency: 'USD' },
    quantity: 5,
    inStock: true,
    locations: [{ id: 'loc-1', name: 'Cafe counter', quantity: 5 }],
    url: null,
    imageUrl: null,
  },
];

/** @param {typeof MOCK_CATALOG[number]} row */
function withMeta(row) {
  return { ...row, lastSyncedAt: NOW() };
}

/** @type {import('./types').InventoryProvider} */
const mockProvider = {
  id: 'mock',
  label: 'Mock multi-channel catalog (dev / demos)',
  platform: 'mock',
  isConfigured() {
    return process.env.MOCK_PROVIDER !== '0';
  },
  async search(query, opts = {}) {
    const q = String(query || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
    let results = MOCK_CATALOG;
    if (q) {
      results = MOCK_CATALOG.filter((p) =>
        [p.title, p.variantTitle, p.sku, p.externalId, p.platform].some((v) =>
          String(v || '').toLowerCase().includes(q),
        ),
      );
    }
    if (opts.minPrice != null) results = results.filter((p) => p.price.amount >= Number(opts.minPrice));
    if (opts.maxPrice != null) results = results.filter((p) => p.price.amount <= Number(opts.maxPrice));
    if (opts.inStockOnly) results = results.filter((p) => p.inStock);
    return results.slice(0, limit).map(withMeta);
  },
  async getProduct(id) {
    const found = MOCK_CATALOG.find(
      (p) => p.externalId === id || p.sku === id || String(p.externalId).endsWith(`/${id}`),
    );
    if (!found) {
      const err = new Error(`Product not found: ${id}`);
      err.status = 404;
      throw err;
    }
    return withMeta(found);
  },
  async getBySku(sku) {
    const found = MOCK_CATALOG.find((p) => p.sku === sku);
    return found ? withMeta(found) : null;
  },
};

module.exports = { mockProvider, MOCK_CATALOG };
