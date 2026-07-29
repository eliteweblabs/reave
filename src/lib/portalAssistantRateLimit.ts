/**
 * Portal assistant rate limit — delegates to shared in-memory limiter.
 */
import { checkInMemoryRateLimit } from './inMemoryRateLimit';

/** Rate limit for public assistant endpoints (portal + site). */
export function checkPortalAssistantRateLimit(
  key: string,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  return checkInMemoryRateLimit(key);
}
