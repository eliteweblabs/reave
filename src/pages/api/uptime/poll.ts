/**
 * POST /api/uptime/poll — manual or cron-triggered API sync.
 *
 * Auth: ?key=<UPTIMEROBOT_POLL_SECRET> (falls back to UPTIMEROBOT_WEBHOOK_SECRET)
 * or deployment owner Clerk session.
 */
import type { APIRoute } from 'astro';
import { createPollRoute } from '../../../lib/api/pollRoute';
import { hasFeature } from '../../../lib/features';
import { runUptimePoll, uptimePollSecret, ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';

export const prerender = false;

const poll = createPollRoute({
  getSecret: uptimePollSecret,
  feature: {
    check: () => hasFeature('uptime_monitoring'),
    error: 'uptime_monitoring not enabled',
  },
  ensureScheduler: ensureUptimePollScheduler,
  run: async () => {
    const result = await runUptimePoll();
    if (!result.ok) return { ...result, ok: false };
    return { ok: true, synced: result.synced };
  },
  mapStatus: (result) => {
    if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === true) {
      return 200;
    }
    const error = result && typeof result === 'object' ? (result as { error?: string }).error : undefined;
    return error ? 503 : 500;
  },
});

export const GET: APIRoute = poll;
export const POST: APIRoute = poll;
