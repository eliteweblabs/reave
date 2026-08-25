/**
 * GET/POST /api/lead-scanner/poll — daily property lead scan (Railway cron or admin).
 *
 * Auth: ?key=<LEAD_SCANNER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 runs even if disabled or outside scan hour.
 */
import type { APIRoute } from 'astro';
import { createPollRoute } from '../../../lib/api/pollRoute';
import { hasFeature } from '../../../lib/features';
import { runLeadScanner } from '../../../lib/leadScannerEngine';
import { ensureLeadScannerScheduler, leadScannerPollSecret } from '../../../lib/leadScannerScheduler';

export const prerender = false;

const poll = createPollRoute({
  getSecret: leadScannerPollSecret,
  feature: {
    check: () => hasFeature('real_estate_data'),
    error: 'real_estate_data not enabled',
  },
  ensureScheduler: ensureLeadScannerScheduler,
  run: async (context, auth) => {
    const force = context.url.searchParams.get('force') === '1';
    const result = await runLeadScanner({
      source: auth.via === 'owner' ? 'admin' : 'cron',
      force,
      ignoreWindow: force,
    });
    return { ...result };
  },
});

export const GET: APIRoute = poll;
export const POST: APIRoute = poll;
