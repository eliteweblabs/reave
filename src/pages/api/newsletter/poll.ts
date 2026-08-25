/**
 * GET/POST /api/newsletter/poll — manual or cron-triggered send of due emails.
 *
 * Auth: ?key=<NEWSLETTER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 sends due emails even outside the configured send window.
 */
import type { APIRoute } from 'astro';
import { createPollRoute } from '../../../lib/api/pollRoute';
import { hasFeature } from '../../../lib/features';
import { processDueNewsletterSends } from '../../../lib/newsletterEngine';
import { ensureNewsletterScheduler, newsletterPollSecret } from '../../../lib/newsletterScheduler';

export const prerender = false;

const poll = createPollRoute({
  getSecret: newsletterPollSecret,
  feature: {
    check: () => hasFeature('email_marketing'),
    error: 'email_marketing not enabled',
  },
  ensureScheduler: ensureNewsletterScheduler,
  run: async (context) => {
    const force = context.url.searchParams.get('force') === '1';
    return processDueNewsletterSends({ limit: 200, ignoreWindow: force });
  },
  mapStatus: (result) => {
    const ok = result && typeof result === 'object' && (result as { ok?: boolean }).ok === true;
    return ok ? 200 : 503;
  },
});

export const GET: APIRoute = poll;
export const POST: APIRoute = poll;
