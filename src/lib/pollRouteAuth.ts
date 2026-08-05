import type { APIContext } from 'astro';
import { requireDashboardUser } from './dashboardAuth';
import { secretMatches } from './secretCompare';

/**
 * Authorize cron poll endpoints: valid secret (header or ?key=) OR deployment owner session.
 */
export async function authorizePollOrOwner(
  context: APIContext,
  key: string | null,
  getExpectedSecret: () => string | null | undefined,
): Promise<{ via: 'key' | 'owner'; userId?: string } | Response> {
  const headerSecret =
    context.request.headers.get('X-Poll-Secret')?.trim() ||
    context.request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    null;
  const provided = headerSecret || key;
  if (secretMatches(provided, getExpectedSecret())) {
    return { via: 'key' };
  }
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
