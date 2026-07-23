/** @typedef {import('./types').MaterialProduct} MaterialProduct */
/** @typedef {import('./types').SearchOptions} SearchOptions */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(true|yes|in stock|available)$/i.test(v.trim());
  return null;
}

function normalizeUnwrangleProduct(data, fallbackUrl) {
  const price = num(data.price ?? data.price_reduced);
  const listPrice = num(data.list_price);
  const fulfillment = Array.isArray(data.fulfillment_options) ? data.fulfillment_options : [];
  const services = fulfillment.flatMap((f) => (Array.isArray(f?.services) ? f.services : []));
  const locations = services.flatMap((s) => (Array.isArray(s?.locations) ? s.locations : []));
  const inStock = bool(data.in_stock) ?? locations.some((l) => bool(l?.in_stock) === true) ?? null;

  return {
    provider: 'homedepot',
    id: String(data.item_id ?? data.internet_number ?? data.sku ?? data.model_number ?? ''),
    title: String(data.name ?? data.title ?? 'Unknown product'),
    brand: data.brand ?? data.brand_name ?? null,
    modelNumber: data.model_number ?? data.model ?? null,
    sku: data.sku ?? data.internet_number ?? data.item_id ?? null,
    upc: data.upc ?? null,
    url: data.url ?? data.product_url ?? fallbackUrl ?? null,
    imageUrl: Array.isArray(data.images) ? data.images[0] : data.image ?? null,
    offer: {
      price: price ?? 0,
      listPrice,
      currency: data.currency ?? 'USD',
      inStock,
      availabilityText: data.availability ?? data.stock_status ?? null,
      storePickup: services.some((s) => /pickup/i.test(String(s?.type ?? s?.name ?? ''))) || null,
      shipToHome: services.some((s) => /ship|delivery/i.test(String(s?.type ?? s?.name ?? ''))) || null,
    },
    unit: data.unit ?? data.price_unit ?? null,
    rating: num(data.rating),
    reviewCount: num(data.review_count ?? data.reviews),
    raw: data,
  };
}

async function unwrangleFetch(path, params) {
  const key = process.env.UNWRANGLE_API_KEY?.trim();
  if (!key) {
    const err = new Error('UNWRANGLE_API_KEY is not set');
    err.status = 503;
    throw err;
  }

  const url = new URL('https://data.unwrangle.com/api/getter/');
  url.searchParams.set('platform', 'homedepot_detail');
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
    const msg = data?.error || data?.message || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data?.data ?? data;
}

/** @type {import('./types').MaterialsProvider} */
const homedepotUnwrangleProvider = {
  id: 'homedepot-unwrangle',
  label: 'Home Depot (Unwrangle)',
  isConfigured() {
    return Boolean(process.env.UNWRANGLE_API_KEY?.trim());
  },
  async search(query, opts = {}) {
    const err = new Error('Unwrangle homedepot_detail does not support search; use lookupUrl or getProduct');
    err.status = 501;
    throw err;
  },
  async getProduct(id, opts = {}) {
    const url = `https://www.homedepot.com/p/${encodeURIComponent(id)}`;
    return this.lookupUrl(url, opts);
  },
  async lookupUrl(url, opts = {}) {
    const params = { url };
    if (opts.zip) params.zip = opts.zip;
    const data = await unwrangleFetch('', params);
    return normalizeUnwrangleProduct(data, url);
  },
};

module.exports = { homedepotUnwrangleProvider, normalizeUnwrangleProduct };
