/**
 * POST /api/newsletter/poll — manual or cron-triggered send of due emails.
 *
 * Auth: ?key=<NEWSLETTER_POLL_SECRET> or a Clerk session.
 * ?force=1 sends due emails even outside the configured send window.
 */
import type { APIRoute } from 'astro';
import { hasFeature } from '../../../lib/features';
import { processDueNewsletterSends } from '../../../lib/newsletterEngine';
import { ensureNewsletterScheduler, newsletterPollSecret } from '../../../lib/newsletterScheduler';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function authorizedByKey(key: string | null): boolean {
  const expected = newsletterPollSecret();
  return Boolean(expected && key && key === expected);
}

export const GET: APIRoute = async ({ url, locals }) => {
  const key = url.searchParams.get('key')?.trim() ?? null;
  const { userId } = locals.auth();
  if (!userId && !authorizedByKey(key)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  if (!hasFeature('email_marketing')) {
    return json({ ok: false, error: 'email_marketing not enabled' }, 404);
  }
  ensureNewsletterScheduler();
  const force = url.searchParams.get('force') === '1';
  const result = await processDueNewsletterSends({ limit: 200, ignoreWindow: force });
  return json(result, result.ok ? 200 : 503);
};

export const POST: APIRoute = GET;
