const cache = new Map();

function ttlSeconds() {
  const raw = process.env.CACHE_TTL_SECONDS;
  if (raw == null || raw === '') return 300;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

function cacheKey(prefix, parts) {
  return `${prefix}:${JSON.stringify(parts)}`;
}

function get(prefix, parts) {
  const ttl = ttlSeconds();
  if (ttl === 0) return null;
  const key = cacheKey(prefix, parts);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function set(prefix, parts, value) {
  const ttl = ttlSeconds();
  if (ttl === 0) return value;
  const key = cacheKey(prefix, parts);
  cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  return value;
}

function stats() {
  return { entries: cache.size, ttlSeconds: ttlSeconds() };
}

module.exports = { get, set, stats };
