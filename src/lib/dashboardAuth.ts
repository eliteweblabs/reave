import type { APIContext } from 'astro';
import { requireDeploymentOwner } from './deploymentOwner';

/**
 * Require the deployment owner for dashboard API routes.
 * Delegates to requireDeploymentOwner so only the install owner (ADMIN_USERNAME /
 * AGENT_ALERT_USER_ID) can access admin data and actions.
 */
export async function requireDashboardUser(
  context: APIContext,
): Promise<{ userId: string } | Response> {
  return requireDeploymentOwner(context);
}
