import type { APIRoute } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

/**
 * Legacy Google OAuth entry — redirects authenticated owners to the
 * supported analytic-audit connect flow.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  return context.redirect('/api/admin/analytic-audit/connect', 302);
};
