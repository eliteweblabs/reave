/**
 * Lightweight in-memory rate limit for the public client-portal assistant
 * endpoint (no auth — gated only by the unguessable /c/<uid> link). Keeps a
 * single process's worth of state, which is fine here: the app runs as one
 * long-lived Node container (Railway), not serverless, matching the pattern
 * used by `agentProgress.ts` / `agentRunControl.ts`.
 */

type Bucket = { count: number; windowStart: number };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const SWEEP_INTERVAL_MS = WINDOW_MS;

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key);
  }
}

export function checkPortalAssistantRateLimit(
  key: string,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true };
}
