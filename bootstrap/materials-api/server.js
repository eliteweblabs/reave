const express = require('express');
const { getProvider, listProviders, withDefaultZip } = require('./providers');
const cache = require('./lib/cache');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';
const APP_NAME = process.env.APP_NAME || 'materials-api';

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const allowed = ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.path === '/health' || req.method === 'OPTIONS') return next();
  const provided = req.headers['x-api-key'] || req.query.apiKey;
  if (provided !== API_KEY) return res.status(401).json({ ok: false, error: 'Invalid or missing API key' });
  next();
});

function json(res, status, body) {
  return res.status(status).json(body);
}

function handleError(res, err) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  return json(res, status, { ok: false, error: err.message || 'Internal error' });
}

async function cached(prefix, parts, fn) {
  const hit = cache.get(prefix, parts);
  if (hit) return { ...hit, cached: true };
  const value = await fn();
  cache.set(prefix, parts, value);
  return { ...value, cached: false };
}

app.get('/health', (_req, res) => {
  const providers = listProviders();
  const configured = providers.filter((p) => p.configured);
  res.json({
    ok: true,
    service: APP_NAME,
    providers: {
      total: providers.length,
      configured: configured.length,
      items: providers,
    },
    cache: cache.stats(),
    checkedAt: new Date().toISOString(),
  });
});

app.get('/api/providers', (_req, res) => {
  res.json({ ok: true, providers: listProviders() });
});

app.post('/api/search', async (req, res) => {
  try {
    const { query, provider, zip, limit, page, minPrice, maxPrice } = req.body || {};
    if (!query || !String(query).trim()) {
      return json(res, 400, { ok: false, error: 'query is required' });
    }

    const p = getProvider(provider || 'homedepot');
    const opts = withDefaultZip({ zip, limit, page, minPrice, maxPrice });
    const cacheParts = { provider: p.id, query: String(query).trim(), ...opts };
    const payload = await cached('search', cacheParts, async () => {
      const results = await p.search(String(query).trim(), opts);
      return { results, provider: p.id, query: String(query).trim(), zip: opts.zip || null };
    });

    return json(res, 200, { ok: true, ...payload });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/products/:provider/:id', async (req, res) => {
  try {
    const { provider, id } = req.params;
    const zip = req.query.zip ? String(req.query.zip) : undefined;
    const p = getProvider(provider);
    const opts = withDefaultZip({ zip });
    const payload = await cached('product', { provider: p.id, id, zip: opts.zip }, async () => {
      const product = await p.getProduct(id, opts);
      return { product, provider: p.id, zip: opts.zip || null };
    });
    return json(res, 200, { ok: true, ...payload });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/products/lookup', async (req, res) => {
  try {
    const { url, provider, zip } = req.body || {};
    if (!url || !String(url).trim()) {
      return json(res, 400, { ok: false, error: 'url is required' });
    }

    const p = getProvider(provider || 'homedepot');
    const opts = withDefaultZip({ zip });
    const payload = await cached('lookup', { provider: p.id, url: String(url).trim(), zip: opts.zip }, async () => {
      const product = await p.lookupUrl(String(url).trim(), opts);
      return { product, provider: p.id, url: String(url).trim(), zip: opts.zip || null };
    });
    return json(res, 200, { ok: true, ...payload });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/prices/quote', async (req, res) => {
  try {
    const { items, provider, zip } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return json(res, 400, { ok: false, error: 'items array is required' });
    }
    if (items.length > 50) {
      return json(res, 400, { ok: false, error: 'Maximum 50 items per quote' });
    }

    const p = getProvider(provider || 'homedepot');
    const opts = withDefaultZip({ zip });
    const lineItems = [];
    let subtotal = 0;

    for (const item of items) {
      const quantity = Math.max(Number(item.quantity) || 1, 0.01);
      let product;
      if (item.url) {
        product = await p.lookupUrl(String(item.url).trim(), opts);
      } else if (item.id || item.sku) {
        product = await p.getProduct(String(item.id || item.sku), opts);
      } else if (item.query) {
        const results = await p.search(String(item.query).trim(), { ...opts, limit: 1 });
        product = results[0];
        if (!product) {
          const err = new Error(`No product found for query: ${item.query}`);
          err.status = 404;
          throw err;
        }
      } else {
        return json(res, 400, { ok: false, error: 'Each item needs id, sku, url, or query' });
      }

      const unitPrice = Number(product.offer?.price) || 0;
      const extended = Math.round(unitPrice * quantity * 100) / 100;
      subtotal += extended;
      lineItems.push({
        label: item.label || product.title,
        quantity,
        unitPrice,
        extended,
        product,
      });
    }

    return json(res, 200, {
      ok: true,
      provider: p.id,
      zip: opts.zip || null,
      currency: lineItems[0]?.product?.offer?.currency || 'USD',
      lineItems,
      subtotal: Math.round(subtotal * 100) / 100,
    });
  } catch (err) {
    return handleError(res, err);
  }
});

app.use((_req, res) => json(res, 404, { ok: false, error: 'Not found' }));

app.listen(PORT, HOST, () => {
  const configured = listProviders().filter((p) => p.configured).map((p) => p.id);
  console.log(`[${APP_NAME}] listening on http://${HOST}:${PORT}`);
  console.log(`[${APP_NAME}] configured providers: ${configured.join(', ') || '(none)'}`);
});
