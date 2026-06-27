/**
 * GET /api/email/inbox — summarized inbound mail for the admin Inbox tab.
 */

import type { APIContext } from 'astro';
import {
  emailInboxStorageBackend,
  storeListEmailInbox,
  computeInboxDigest,
} from '../../../lib/emailInboxStore';
import { isPushConfigured } from '../../../lib/webPush';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 500);
  const showJunk = context.url.searchParams.get('junk') === '1';

  const allForDigest = await storeListEmailInbox(limit, { hideJunk: false, forDigest: true });
  const events = showJunk
    ? allForDigest
    : await storeListEmailInbox(limit, { hideJunk: true });

  return json({
    ok: true,
    events,
    digest: computeInboxDigest(allForDigest, !showJunk),
    storage: emailInboxStorageBackend(),
    pushConfigured: isPushConfigured(),
    pipeline: {
      inbound: 'POST /api/email/inbound (Resend webhook)',
      ingestHint: 'BCC or forward copies to your Resend receiving address (e.g. inbox@mail.reave.app)',
      rules: 'GET /api/email/rules',
    },
  });
}
