/**
 * Rate limit for public assistant endpoints (portal + marketing site).
 */

import { checkRateLimit } from './rateLimit';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

export function checkPortalAssistantRateLimit(
  key: string,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  return checkRateLimit(key, { windowMs: WINDOW_MS, maxPerWindow: MAX_PER_WINDOW });
}
