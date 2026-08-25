import type { APIContext } from 'astro';
import { jsonResponse } from './apiResponse';
import { requireDashboardUser } from './dashboardAuth';
import { secretMatches } from './secretCompare';

/**
 * Authorize cron poll endpoints: valid ?key= secret OR deployment owner session.
 */
export async function authorizePollOrOwner(
  context: APIContext,
  key: string | null,
  getExpectedSecret: () => string | null | undefined,
): Promise<{ via: 'key' | 'owner'; userId?: string } | Response> {
  const expected = getExpectedSecret()?.trim();
  if (key && !expected) {
    return jsonResponse({ ok: false, error: 'Poll secret is not configured' }, 503);
  }
  if (secretMatches(key, expected)) {
    return { via: 'key' };
  }
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
