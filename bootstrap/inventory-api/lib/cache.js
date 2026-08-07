const cache = new Map();

const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES) || 500;

function ttlSeconds() {
  const raw = process.env.CACHE_TTL_SECONDS;
  if (raw == null || raw === '') return 300;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

function cacheKey(prefix, parts) {
  return `${prefix}:${JSON.stringify(parts)}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, hit] of cache.entries()) {
    if (now > hit.expiresAt) cache.delete(key);
  }
}

function evictOldest() {
  let oldestKey = null;
  let oldestAt = Infinity;
  for (const [key, hit] of cache.entries()) {
    if (hit.expiresAt < oldestAt) {
      oldestAt = hit.expiresAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
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
  pruneExpired();
  while (cache.size >= MAX_ENTRIES) evictOldest();
  const key = cacheKey(prefix, parts);
  cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  return value;
}

function stats() {
  return { entries: cache.size, ttlSeconds: ttlSeconds(), maxEntries: MAX_ENTRIES };
}

module.exports = { get, set, stats };
