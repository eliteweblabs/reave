import type { APIContext } from 'astro';
import { requireDashboardUser } from './dashboardAuth';
import { secretMatches } from './secretCompare';
import { serverEnv } from './serverEnv';

/**
 * Authorize contact CRUD routes: deployment owner Clerk session OR
 * `X-Dashboard-Key` header matching `DASHBOARD_KEY` (agent / Siri integrations).
 */
export async function authorizeContactRoute(
  context: APIContext,
): Promise<{ via: 'owner' | 'key'; userId?: string } | Response> {
  const expected = serverEnv('DASHBOARD_KEY')?.trim();
  if (expected) {
    const provided = context.request.headers.get('x-dashboard-key');
    if (secretMatches(provided, expected)) {
      return { via: 'key' };
    }
  }

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return { via: 'owner', userId: auth.userId };
}
