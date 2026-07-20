/**
 * GET /api/uptime/sync/status — poll background site sync progress.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { getUptimePlatformSyncStatus } from '../../../../lib/uptimePlatformSyncJob';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  return json({ ok: true, ...getUptimePlatformSyncStatus() });
};
