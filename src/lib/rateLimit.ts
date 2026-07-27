/**
 * Lightweight in-memory rate limiter for public endpoints.
 * Single-process only (Railway long-lived Node container).
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
  const now = Date.now();
  sweep(now, opts.windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (bucket.count >= opts.maxPerWindow) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((opts.windowMs - (now - bucket.windowStart)) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true };
}

/** Client IP from forwarded headers (Railway/proxy) or direct connection. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
