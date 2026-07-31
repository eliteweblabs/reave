import type { APIContext } from 'astro';
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
  if (secretMatches(key, getExpectedSecret())) {
    return { via: 'key' };
  }
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
