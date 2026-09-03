const express = require('express');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { getProvider, listProviders, resolveProviderId, searchAll } = require('./providers');
const cache = require('./lib/cache');
const { safeCompare } = require('../lib/safeCompare');
const { checkRateLimit, clientIp } = require('../lib/rateLimit');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? '';
const APP_NAME = process.env.APP_NAME || 'inventory-api';

if (!API_KEY) {
  console.error('[inventory-api] FATAL: API_KEY is required. Refusing to start without authentication.');
  process.exit(1);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

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
  if (req.path === '/health' || req.method === 'OPTIONS') return next();
  const ip = clientIp(req);
  const authLimit = checkRateLimit(`auth:${ip}`, 30, 60_000);
  if (!authLimit.allowed) {
    return res.status(429).json({ ok: false, error: 'Too many requests' });
  }
  const provided = String(req.headers['x-api-key'] || '');
  if (!safeCompare(provided, API_KEY)) {
    return res.status(401).json({ ok: false, error: 'Invalid or missing API key' });
  }
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

app.get('/knowledge', (_req, res) => {
  const path = join(__dirname, 'KNOWLEDGE.md');
  if (!existsSync(path)) {
    return json(res, 404, { ok: false, error: 'KNOWLEDGE.md not found' });
  }
  const content = readFileSync(path, 'utf8');
  const accept = _req.headers.accept || '';
  if (accept.includes('application/json')) {
    return json(res, 200, { ok: true, slug: 'inventory-api', content });
  }
  res.type('text/markdown; charset=utf-8').send(content);
});

app.get('/api/providers', (_req, res) => {
  res.json({ ok: true, providers: listProviders() });
});

app.post('/api/search', async (req, res) => {
  try {
    const { query, provider, limit, page, minPrice, maxPrice, inStockOnly } = req.body || {};
    if (!query || !String(query).trim()) {
      return json(res, 400, { ok: false, error: 'query is required' });
    }

    const resolved = resolveProviderId(provider || 'mock');
    const opts = { limit, page, minPrice, maxPrice, inStockOnly: Boolean(inStockOnly) };
    const cacheParts = { provider: resolved, query: String(query).trim(), ...opts };

    const payload = await cached('search', cacheParts, async () => {
      if (resolved === 'all') {
        const results = await searchAll(String(query).trim(), opts);
        return { results, provider: 'all', query: String(query).trim() };
      }
      const p = getProvider(resolved);
      const results = await p.search(String(query).trim(), opts);
      return { results, provider: p.id, query: String(query).trim() };
    });

    return json(res, 200, { ok: true, ...payload });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/products/:provider/:id', async (req, res) => {
  try {
    const { provider, id } = req.params;
    const p = getProvider(provider);
    const payload = await cached('product', { provider: p.id, id }, async () => {
      const product = await p.getProduct(id);
      return { product, provider: p.id };
    });
    return json(res, 200, { ok: true, ...payload });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/products/:provider/sku/:sku', async (req, res) => {
  try {
    const { provider, sku } = req.params;
    const p = getProvider(provider);
    if (!p.getBySku) {
      return json(res, 501, { ok: false, error: `Provider ${provider} does not support SKU lookup` });
    }
    const product = await p.getBySku(sku);
    if (!product) {
      return json(res, 404, { ok: false, error: `SKU not found: ${sku}` });
    }
    return json(res, 200, { ok: true, product, provider: p.id });
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
