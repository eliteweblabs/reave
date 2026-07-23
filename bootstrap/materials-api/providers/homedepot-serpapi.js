/** @typedef {import('./types').MaterialProduct} MaterialProduct */
/** @typedef {import('./types').SearchOptions} SearchOptions */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSerpProduct(data) {
  const product = data?.product_results ?? data;
  const price = num(product?.price ?? product?.extracted_price);
  const listPrice = num(product?.original_price ?? product?.was_price);

  return {
    provider: 'homedepot',
    id: String(product?.product_id ?? product?.item_id ?? product?.model_number ?? ''),
    title: String(product?.title ?? product?.name ?? 'Unknown product'),
    brand: product?.brand ?? null,
    modelNumber: product?.model_number ?? null,
    sku: product?.product_id ?? product?.item_id ?? null,
    upc: product?.upc ?? null,
    url: product?.link ?? product?.product_link ?? null,
    imageUrl: product?.thumbnail ?? (Array.isArray(product?.images) ? product.images[0] : null),
    offer: {
      price: price ?? 0,
      listPrice,
      currency: product?.currency ?? 'USD',
      inStock: product?.in_stock ?? null,
      availabilityText: product?.availability ?? null,
      storePickup: product?.pickup ?? null,
      shipToHome: product?.delivery ?? null,
    },
    unit: product?.unit ?? null,
    rating: num(product?.rating),
    reviewCount: num(product?.reviews),
    raw: data,
  };
}

async function serpRequest(params) {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) {
    const err = new Error('SERPAPI_API_KEY is not set');
    err.status = 503;
    throw err;
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'home_depot_product');
  url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg = data?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

/** @type {import('./types').MaterialsProvider} */
const homedepotSerpapiProvider = {
  id: 'homedepot-serpapi',
  label: 'Home Depot (SerpApi)',
  isConfigured() {
    return Boolean(process.env.SERPAPI_API_KEY?.trim());
  },
  async search(query, opts = {}) {
    const err = new Error('SerpApi home_depot_product does not support search; use getProduct or lookupUrl');
    err.status = 501;
    throw err;
  },
  async getProduct(id, opts = {}) {
    const data = await serpRequest({ product_id: id, store_id: opts.zip });
    return normalizeSerpProduct(data);
  },
  async lookupUrl(url, opts = {}) {
    const match = String(url).match(/\/p\/(\d+)/);
    const productId = match?.[1];
    if (!productId) {
      const err = new Error('Could not extract Home Depot product id from URL');
      err.status = 400;
      throw err;
    }
    return this.getProduct(productId, opts);
  },
};

module.exports = { homedepotSerpapiProvider, normalizeSerpProduct };
