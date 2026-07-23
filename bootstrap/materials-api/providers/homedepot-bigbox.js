/** @typedef {import('./types').MaterialProduct} MaterialProduct */
/** @typedef {import('./types').SearchOptions} SearchOptions */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBigBoxProduct(data) {
  const product = data?.product ?? data;
  const buybox = product?.buybox_winner ?? product?.buybox ?? product;
  const price = num(buybox?.price ?? product?.price ?? product?.current_price);
  const listPrice = num(buybox?.was_price ?? product?.list_price ?? product?.was_price);

  return {
    provider: 'homedepot',
    id: String(product?.item_id ?? product?.product_id ?? product?.sku ?? ''),
    title: String(product?.title ?? product?.name ?? 'Unknown product'),
    brand: product?.brand ?? null,
    modelNumber: product?.model_number ?? product?.model ?? null,
    sku: product?.sku ?? product?.item_id ?? null,
    upc: product?.upc ?? product?.gtin ?? null,
    url: product?.link ?? product?.url ?? null,
    imageUrl: product?.main_image?.link ?? product?.image ?? (Array.isArray(product?.images) ? product.images[0] : null),
    offer: {
      price: price ?? 0,
      listPrice,
      currency: buybox?.currency ?? product?.currency ?? 'USD',
      inStock: buybox?.availability ?? product?.in_stock ?? null,
      availabilityText: buybox?.availability_text ?? product?.availability ?? null,
      storePickup: buybox?.pickup ?? null,
      shipToHome: buybox?.delivery ?? null,
    },
    unit: product?.unit ?? null,
    rating: num(product?.rating ?? product?.average_rating),
    reviewCount: num(product?.total_reviews ?? product?.review_count),
    raw: data,
  };
}

async function bigboxRequest(params) {
  const key = process.env.BIGBOX_API_KEY?.trim();
  if (!key) {
    const err = new Error('BIGBOX_API_KEY is not set');
    err.status = 503;
    throw err;
  }

  const url = new URL('https://api.bigboxapi.com/request');
  url.searchParams.set('api_key', key);
  url.searchParams.set('type', 'product');
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

  if (!res.ok || data?.request_info?.success === false) {
    const msg = data?.request_info?.message || data?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

/** @type {import('./types').MaterialsProvider} */
const homedepotBigboxProvider = {
  id: 'homedepot-bigbox',
  label: 'Home Depot (BigBox API)',
  isConfigured() {
    return Boolean(process.env.BIGBOX_API_KEY?.trim());
  },
  async search(query, opts = {}) {
    const data = await bigboxRequest({
      search_term: query,
      zip: opts.zip,
      page: opts.page || 1,
      min_price: opts.minPrice,
      max_price: opts.maxPrice,
    });
    const results = Array.isArray(data?.search_results) ? data.search_results : [];
    return results.map((item) => normalizeBigBoxProduct({ product: item }));
  },
  async getProduct(id, opts = {}) {
    const data = await bigboxRequest({ item_id: id, zip: opts.zip });
    return normalizeBigBoxProduct(data);
  },
  async lookupUrl(url, opts = {}) {
    const data = await bigboxRequest({ url, zip: opts.zip });
    return normalizeBigBoxProduct(data);
  },
};

module.exports = { homedepotBigboxProvider, normalizeBigBoxProduct };
