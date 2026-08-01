/**
 * GET/POST /api/lead-scanner/poll — daily property lead scan (Railway cron or admin).
 *
 * Auth: ?key=<LEAD_SCANNER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 runs even if disabled or outside scan hour.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { runLeadScanner } from '../../../lib/leadScannerEngine';
import { ensureLeadScannerScheduler, leadScannerPollSecret } from '../../../lib/leadScannerScheduler';
import { authorizePollOrOwner } from '../../../lib/pollRouteAuth';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async (context) => {
  const key = context.url.searchParams.get('key')?.trim() ?? null;
  const auth = await authorizePollOrOwner(context, key, leadScannerPollSecret);
  if (auth instanceof Response) return auth;

  if (!hasFeature('real_estate_data')) {
    return json({ ok: false, error: 'real_estate_data not enabled' }, 404);
  }

  ensureLeadScannerScheduler();
  const force = context.url.searchParams.get('force') === '1';
  const result = await runLeadScanner({
    source: auth.via === 'owner' ? 'admin' : 'cron',
    force,
    ignoreWindow: force,
  });

  return json({ ...result }, result.ok ? 200 : 200);
};

export const POST: APIRoute = GET;
