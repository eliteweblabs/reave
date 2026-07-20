/**
 * POST /api/uptime/monitors/batch — create multiple UptimeRobot monitors at once.
 *
 * Body: { monitors: [{ url, friendlyName? }, ...] }
 * Returns per-monitor success/failure so a partial batch can still succeed.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../../lib/features';
import { createUptimeMonitor } from '../../../../lib/uptimeMonitoring';
import { uptimeStatusLabel } from '../../../../lib/uptimerobotClient';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type BatchInput = { url?: unknown; friendlyName?: unknown };

export const POST: APIRoute = async ({ request, locals }) => {
  const { userId } = locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!hasFeature('uptime_monitoring')) {
    return json({ ok: false, error: 'uptime_monitoring not enabled' }, 404);
  }

  let body: { monitors?: unknown };
  try {
    body = (await request.json()) as { monitors?: unknown };
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.monitors) || body.monitors.length === 0) {
    return json({ ok: false, error: 'monitors must be a non-empty array' }, 400);
  }

  const results: Array<
    | { ok: true; url: string; monitor: Record<string, unknown> }
    | { ok: false; url: string | null; error: string }
  > = [];

  for (const raw of body.monitors as BatchInput[]) {
    const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
    const friendlyName = typeof raw?.friendlyName === 'string' ? raw.friendlyName.trim() : undefined;

    if (!url) {
      results.push({ ok: false, url: null, error: 'url is required' });
      continue;
    }

    const result = await createUptimeMonitor({ url, friendlyName: friendlyName || undefined });
    if (!result.ok) {
      results.push({ ok: false, url, error: result.error });
      continue;
    }

    const m = result.monitor;
    results.push({
      ok: true,
      url,
      monitor: {
        ...m,
        status_label: uptimeStatusLabel(m.status),
        is_down: m.status === 8 || m.status === 9,
      },
    });
  }

  const created = results.filter((r) => r.ok).length;
  const failed = results.length - created;

  return json({
    ok: failed === 0,
    total: results.length,
    created,
    failed,
    results,
  });
};
