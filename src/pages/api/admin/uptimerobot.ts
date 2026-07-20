/**
 * GET  /api/admin/uptimerobot — UptimeRobot admin plugin status
 * POST /api/admin/uptimerobot — sync monitors from UptimeRobot API
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { hasFeature } from '../../../lib/features';
import { isUptimeRobotConfigured } from '../../../lib/uptimerobotClient';
import { isUptimeDbConfigured } from '../../../lib/pgUptime';
import { syncUptimeMonitorsFromApi } from '../../../lib/uptimeMonitoring';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  return json({
    ok: true,
    featureEnabled: hasFeature('uptime_monitoring'),
    configured: isUptimeRobotConfigured(),
    dbConfigured: isUptimeDbConfigured(),
    note:
      'UptimeRobot sync pulls monitor status from the UptimeRobot API and updates the local database. Requires UPTIMEROBOT_API_KEY and DATABASE_URL.',
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('uptime_monitoring')) {
    return json(
      { ok: false, error: 'Enable "uptime_monitoring" in the install config features array.' },
      403,
    );
  }

  const result = await syncUptimeMonitorsFromApi();

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502);
  }

  return json({
    ok: true,
    synced: result.synced,
  });
}
