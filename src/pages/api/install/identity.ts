/**
 * GET /api/install/identity — public install defaults from the reΛVe.app node
 * (name, username, email, icon). Siblings and the Cal.com pickup use this
 * instead of re-typing onboarding fields.
 */
import type { APIRoute } from 'astro';
import { resolveInstallIdentity } from '../../../lib/installIdentity';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const rate = checkInMemoryRateLimit(`install-identity:${clientIp(request)}`, {
    windowMs: 60_000,
    maxPerWindow: 30,
  });
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many requests' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const identity = await resolveInstallIdentity(request);
  return jsonResponse({ ok: true, identity }, 200, { cache: 'public, max-age=60' });
};
