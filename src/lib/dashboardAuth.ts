import type { APIContext } from 'astro';
import { requireDashboardUser as requireDashboardUserImpl } from './staffAuth';

/**
 * Require a signed-in dashboard user: deployment owner OR active staff.
 * Owner-only install management should call requireDeploymentOwner instead.
 */
export async function requireDashboardUser(
  context: APIContext,
): Promise<{ userId: string; role?: 'owner' | 'staff' } | Response> {
  const auth = await requireDashboardUserImpl(context);
  if (auth instanceof Response) return auth;
  return { userId: auth.userId, role: auth.role };
}
