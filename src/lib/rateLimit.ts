/**
 * Lightweight in-memory rate limiter for public endpoints.
 * Single-process state matches the long-lived Railway Node container.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  opts: { windowMs: number; maxPerWindow: number },
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const { windowMs, maxPerWindow } = opts;
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (bucket.count >= maxPerWindow) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - bucket.windowStart)) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true };
}
