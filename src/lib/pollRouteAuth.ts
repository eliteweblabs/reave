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
  const expected = getExpectedSecret()?.trim();
  if (key && !expected) {
    return new Response(
      JSON.stringify({ ok: false, error: 'poll secret not configured' }),
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
