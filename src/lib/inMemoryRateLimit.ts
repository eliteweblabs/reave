/**
 * In-memory sliding-window rate limiter.
 *
 * Keyed by any string (IP, user id, API key prefix, etc.).
 * Uses a circular bucket approach: timestamps outside the window are discarded
 * on each check so memory stays bounded.
 *
 * NOT shared across Railway replicas — intentional for low-overhead single-instance
 * protection (brute-force, credential-stuffing). For multi-replica deployments
 * swap the store for a Redis-backed implementation.
 */

interface Window {
  timestamps: number[];
}

const store = new Map<string, Window>();

/**
 * Check (and record) a hit for `key`.
 *
 * @param key        Unique identifier for the rate-limited entity.
 * @param limit      Maximum requests allowed in `windowMs`.
 * @param windowMs   Sliding window size in milliseconds (default 60 000 = 1 min).
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs: number }`.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  let win = store.get(key);
  if (!win) {
    win = { timestamps: [] };
    store.set(key, win);
  }

  // Evict expired timestamps.
  win.timestamps = win.timestamps.filter((t) => t > cutoff);

  if (win.timestamps.length >= limit) {
    // Oldest timestamp in window → tells caller when a slot opens.
    const oldest = win.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  win.timestamps.push(now);
  return { allowed: true };
}

/**
 * Reset the rate-limit counter for a key (e.g. after a successful auth).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Purge all entries older than their window from the global store.
 * Call periodically (e.g. every 5 min) to prevent unbounded growth.
 */
export function pruneRateLimitStore(windowMs = 60_000): void {
  const cutoff = Date.now() - windowMs;
  for (const [key, win] of store.entries()) {
    win.timestamps = win.timestamps.filter((t) => t > cutoff);
    if (win.timestamps.length === 0) store.delete(key);
  }
}
