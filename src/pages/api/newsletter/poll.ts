/**
 * GET/POST /api/newsletter/poll — manual or cron-triggered send of due emails.
 *
 * Auth: ?key=<NEWSLETTER_POLL_SECRET> or deployment owner Clerk session.
 * ?force=1 sends due emails even outside the configured send window.
 */
import { processDueNewsletterSends } from '../../../lib/newsletterEngine';
import { ensureNewsletterScheduler, newsletterPollSecret } from '../../../lib/newsletterScheduler';
import { createPollRoute } from '../../../lib/api/pollRoute';

export const prerender = false;

const route = createPollRoute({
  feature: 'email_marketing',
  secret: newsletterPollSecret,
  ensureScheduler: ensureNewsletterScheduler,
  run: async (context) => {
    const force = context.url.searchParams.get('force') === '1';
    const result = await processDueNewsletterSends({ limit: 200, ignoreWindow: force });
    return { body: result, status: result.ok ? 200 : 503 };
  },
});

export const GET = route.GET;
export const POST = route.POST;
