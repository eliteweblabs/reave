/**
 * POST /api/uptime/poll — manual or cron-triggered API sync.
 *
 * Auth: ?key=<UPTIMEROBOT_POLL_SECRET> (falls back to UPTIMEROBOT_WEBHOOK_SECRET)
 * or deployment owner Clerk session.
 */
import { runUptimePoll, uptimePollSecret, ensureUptimePollScheduler } from '../../../lib/uptimePollScheduler';
import { createPollRoute } from '../../../lib/api/pollRoute';

export const prerender = false;

const route = createPollRoute({
  feature: 'uptime_monitoring',
  secret: uptimePollSecret,
  ensureScheduler: ensureUptimePollScheduler,
  run: async () => {
    const result = await runUptimePoll();
    if (!result.ok) {
      return { body: { ...result, ok: false }, status: result.error ? 503 : 500 };
    }
    return { body: { ok: true, synced: result.synced } };
  },
});

export const GET = route.GET;
export const POST = route.POST;
