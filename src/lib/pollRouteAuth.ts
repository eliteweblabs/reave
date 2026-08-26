import type { APIContext } from 'astro';
import { requireDashboardUser } from './dashboardAuth';
import { jsonResponse } from './apiResponse';
import { secretMatches } from './secretCompare';

/**
 * Authorize cron poll endpoints: valid ?key= secret OR deployment owner session.
 * Returns 503 when ?key= is present but the poll secret env var is unset (misconfigured cron).
 */
export async function authorizePollOrOwner(
  context: APIContext,
  key: string | null,
  getExpectedSecret: () => string | null | undefined,
): Promise<{ via: 'key' | 'owner'; userId?: string } | Response> {
  const expected = getExpectedSecret()?.trim() ?? '';
  if (key) {
    if (!expected) {
      return jsonResponse({ ok: false, error: 'Poll secret is not configured on this service' }, 503);
    }
    if (secretMatches(key, expected)) return { via: 'key' };
  }
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
