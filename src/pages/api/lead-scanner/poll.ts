/**
 * GET/POST /api/lead-scanner/poll — daily property lead scan (Railway cron or admin).
 *
 * Auth: ?key=<LEAD_SCANNER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 runs even if disabled or outside scan hour.
 */
import { runLeadScanner } from '../../../lib/leadScannerEngine';
import { ensureLeadScannerScheduler, leadScannerPollSecret } from '../../../lib/leadScannerScheduler';
import { createPollRoute } from '../../../lib/api/pollRoute';

export const prerender = false;

const route = createPollRoute({
  feature: 'real_estate_data',
  secret: leadScannerPollSecret,
  ensureScheduler: ensureLeadScannerScheduler,
  run: async (context, auth) => {
    const force = context.url.searchParams.get('force') === '1';
    const result = await runLeadScanner({
      source: auth.via === 'owner' ? 'admin' : 'cron',
      force,
      ignoreWindow: force,
    });
    return { body: { ...result }, status: 200 };
  },
});

export const GET = route.GET;
export const POST = route.POST;
