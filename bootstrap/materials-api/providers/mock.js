/** @typedef {import('./types').MaterialProduct} MaterialProduct */
/** @typedef {import('./types').SearchOptions} SearchOptions */

const MOCK_CATALOG = [
  {
    id: '1001234567',
    title: '2 in. x 4 in. x 8 ft. Premium Kiln-Dried Whitewood Stud',
    brand: 'Generic',
    modelNumber: '058449',
    sku: '1001234567',
    upc: '000000000001',
    url: 'https://www.homedepot.com/p/mock-stud',
    imageUrl: null,
    offer: { price: 3.98, listPrice: 4.48, currency: 'USD', inStock: true, availabilityText: 'In Stock', storePickup: true, shipToHome: true },
    unit: 'each',
    rating: 4.6,
    reviewCount: 1284,
  },
  {
    id: '2002345678',
    title: '5 gal. Interior Flat Ceiling White Paint',
    brand: 'BEHR',
    modelNumber: '55804',
    sku: '2002345678',
    upc: '000000000002',
    url: 'https://www.homedepot.com/p/mock-ceiling-paint',
    imageUrl: null,
    offer: { price: 24.98, listPrice: null, currency: 'USD', inStock: true, availabilityText: 'In Stock', storePickup: true, shipToHome: true },
    unit: 'each',
    rating: 4.4,
    reviewCount: 892,
  },
  {
    id: '3003456789',
    title: '1/2 in. x 4 ft. x 8 ft. Drywall Panel',
    brand: 'Sheetrock',
    modelNumber: '14113406608',
    sku: '3003456789',
    upc: '000000000003',
    url: 'https://www.homedepot.com/p/mock-drywall',
    imageUrl: null,
    offer: { price: 15.48, listPrice: 16.98, currency: 'USD', inStock: true, availabilityText: 'Limited Stock', storePickup: true, shipToHome: false },
    unit: 'each',
    rating: 4.7,
    reviewCount: 431,
  },
];

function withProvider(product) {
  return { provider: 'mock', ...product };
}

/** @type {import('./types').MaterialsProvider} */
const mockProvider = {
  id: 'mock',
  label: 'Mock catalog (dev)',
  isConfigured() {
    return process.env.MOCK_PROVIDER !== '0';
  },
  async search(query, opts = {}) {
    const q = String(query || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
    let results = MOCK_CATALOG;
    if (q) {
      results = MOCK_CATALOG.filter((p) =>
        [p.title, p.brand, p.modelNumber, p.sku, p.id].some((v) => String(v || '').toLowerCase().includes(q))
      );
    }
    if (opts.minPrice != null) results = results.filter((p) => p.offer.price >= Number(opts.minPrice));
    if (opts.maxPrice != null) results = results.filter((p) => p.offer.price <= Number(opts.maxPrice));
    return results.slice(0, limit).map(withProvider);
  },
  async getProduct(id) {
    const found = MOCK_CATALOG.find((p) => p.id === id || p.sku === id || p.modelNumber === id);
    if (!found) {
      const err = new Error(`Product not found: ${id}`);
      err.status = 404;
      throw err;
    }
    return withProvider(found);
  },
  async lookupUrl(url) {
    const match = String(url).match(/\/p\/([^/?#]+)/i);
    const slug = match?.[1];
    const found = MOCK_CATALOG.find((p) => p.url.includes(slug || '__none__'));
    if (!found) {
      const err = new Error(`No mock product for URL: ${url}`);
      err.status = 404;
      throw err;
    }
    return withProvider(found);
  },
};

module.exports = { mockProvider, MOCK_CATALOG };
