/**
 * GET /api/email/inbox — summarized inbound mail for the admin Inbox tab.
 */

import type { APIContext } from 'astro';
import {
  emailInboxStorageBackend,
  storeListEmailInbox,
  computeInboxDigest,
  toEmailInboxListRecord,
  type EmailInboxRecord,
} from '../../../lib/emailInboxStore';
import { getReviewsPendingCount } from '../../../lib/reviewsPendingCount';
import { inboxListExcerpt } from '../../../lib/emailBody';
import { inboxMonetaryAmount } from '../../../lib/emailMoney';
import {
  extractForwardedToFromAudit,
  parseClassificationAudit,
} from '../../../lib/emailClassificationAudit';
import { getCompanyBrandContext } from '../../../lib/companyConfig';
import { isPushConfigured } from '../../../lib/webPush';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { ensureEmailCleanupScheduler } from '../../../lib/emailCleanupScheduler';
import { ensureSeededInboxClearedOnLiveEmail } from '../../../lib/seededInboxCleanup';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;

function enrichEmailEvent(event: EmailInboxRecord) {
  const monetaryAmount = inboxMonetaryAmount(event);
  const forwardedTo =
    extractForwardedToFromAudit(parseClassificationAudit(event.classificationAudit)) || undefined;
  const excerpt = inboxListExcerpt(event);
  return {
    ...toEmailInboxListRecord(event),
    bodySnippet: excerpt,
    summary: excerpt || event.summary,
    monetaryAmount,
    hasMonetaryValue: monetaryAmount != null,
    ...(forwardedTo ? { forwardedTo } : {}),
  };
}


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  ensureEmailCleanupScheduler();
  await ensureSeededInboxClearedOnLiveEmail().catch(() => undefined);
  const { userId } = auth;

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 500);
  const showJunk = context.url.searchParams.get('junk') === '1';

  const events = await storeListEmailInbox(limit, { hideJunk: !showJunk });

  const brand = await getCompanyBrandContext(context.request);
  const reviewsPending = await getReviewsPendingCount();

  return jsonResponse({
    ok: true,
    events: events.map((e) => enrichEmailEvent(e)),
    digest: {
      ...computeInboxDigest(events, !showJunk),
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
