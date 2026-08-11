import type { APIContext } from 'astro';
import { requireDashboardUser } from './dashboardAuth';
import { secretMatches } from './secretCompare';

/**
 * Authorize cron poll endpoints: valid ?key= secret OR deployment owner session.
 * When a key is supplied but the poll secret is not configured, reject with 503
 * instead of falling through to owner auth (avoids confusing 401s from cron jobs).
 */
export async function authorizePollOrOwner(
  context: APIContext,
  key: string | null,
  getExpectedSecret: () => string | null | undefined,
): Promise<{ via: 'key' | 'owner'; userId?: string } | Response> {
  const expected = getExpectedSecret()?.trim();
  if (key?.trim() && !expected) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Poll secret is not configured on this service' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  }
  if (secretMatches(key, expected)) {
    return { via: 'key' };
  }
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
