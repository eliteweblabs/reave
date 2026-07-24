/**
 * GET /api/email/inbox — summarized inbound mail for the admin Inbox tab.
 */

import type { APIContext } from 'astro';
import {
  emailInboxStorageBackend,
  storeListEmailInbox,
  computeInboxDigest,
  toEmailInboxListRecord,
  type EmailInboxListRecord,
} from '../../../lib/emailInboxStore';
import { getReviewsPendingCount } from '../../../lib/reviewsPendingCount';
import { plainTextForDisplay } from '../../../lib/emailBody';
import { extractMonetaryAmountFromEmail } from '../../../lib/emailMoney';
import { getCompanyBrandContext } from '../../../lib/companyConfig';
import { isPushConfigured } from '../../../lib/webPush';

export const prerender = false;

function enrichEmailEvent(event: EmailInboxListRecord) {
  const monetaryAmount = extractMonetaryAmountFromEmail(event);
  return {
    ...event,
    bodySnippet: plainTextForDisplay(event.bodySnippet),
    summary: event.summary ? plainTextForDisplay(event.summary) : event.summary,
    monetaryAmount,
    hasMonetaryValue: monetaryAmount != null,
  };
}

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

  const allForDigest = await storeListEmailInbox(limit, { hideJunk: true, forDigest: true });
  const events = showJunk
    ? await storeListEmailInbox(limit, { hideJunk: false })
    : allForDigest;

  const brand = await getCompanyBrandContext(context.request);
  const reviewsPending = await getReviewsPendingCount();

  return json({
    ok: true,
    events: events.map((e) => enrichEmailEvent(toEmailInboxListRecord(e))),
    digest: {
      ...computeInboxDigest(allForDigest, !showJunk),
      reviewsPending,
    },
    storage: emailInboxStorageBackend(),
    pushConfigured: isPushConfigured(),
    pipeline: {
      inbound: 'POST /api/email/inbound (Resend webhook)',
      ingestHint: `BCC or forward copies to your Resend receiving address (e.g. ${brand.inboundEmailExample})`,
      rules: 'GET /api/email/rules',
    },
  });
}
