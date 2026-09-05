/**
 * POST /api/email/inbox/[id]/reclassify — re-run live triage on a stored message.
 * Dev/testing helper: updates the row in place with fresh classification + audit.
 */

import type { APIContext } from 'astro';
import { storeGetEmailInbox, storeUpdateEmailInbox } from '../../../../../lib/emailInboxStore';
import { processInboundEmail } from '../../../../../lib/emailProcessor';
import {
  attachClassificationRuleLinks,
  explainReceiptClassification,
  parseClassificationAudit,
  primaryClassificationRule,
  resolveForwardedTo,
} from '../../../../../lib/emailClassificationAudit';
import { storeListEmailRules } from '../../../../../lib/emailRuleStore';
import {
  displayInboxRecipients,
  hasOriginalRecipientHeaders,
  isGenericInboundMailbox,
} from '../../../../../lib/emailOriginalRecipient';
import {
  emailHtmlHasInlineStyles,
  inboxListExcerpt,
  normalizeEmailHtml,
  plainTextForDisplay,
  resolveEmailHtmlForDisplay,
} from '../../../../../lib/emailBody';
import { inboxMonetaryAmount } from '../../../../../lib/emailMoney';
import { parseEmailUnsubscribe, hasListUnsubscribeHeader } from '../../../../../lib/emailUnsubscribe';
import { fetchResendInboundEmail } from '../../../../../lib/resendInboundEmail';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';
import { getReviewsPendingCount } from '../../../../../lib/reviewsPendingCount';
import { resolveMeetingStartFromInbox } from '../../../../../lib/emailMeetingParse';

export const prerender = false;

async function enrichInboxEvent(event: NonNullable<Awaited<ReturnType<typeof storeGetEmailInbox>>>) {
  let headers = event.headers;
  const envelopeTo = Array.isArray(event.to) ? event.to : [];
  const needsOriginalTo =
    envelopeTo.length > 0 &&
    envelopeTo.every((addr) => isGenericInboundMailbox(addr)) &&
    !hasOriginalRecipientHeaders(headers);
  let bodyHtml = event.bodyHtml;
  const needsHeaders = !hasListUnsubscribeHeader(headers) || needsOriginalTo;
  const needsHtmlStyles = Boolean(event.resendEmailId) && !emailHtmlHasInlineStyles(bodyHtml);
  if ((needsHeaders || needsHtmlStyles) && event.resendEmailId) {
    const fresh = await fetchResendInboundEmail(event.resendEmailId);
    if (Object.keys(fresh.headers).length) headers = { ...headers, ...fresh.headers };
    if (needsHtmlStyles && fresh.html?.trim()) {
      bodyHtml = normalizeEmailHtml('', fresh.html);
    }
  }

  const monetaryAmount = inboxMonetaryAmount(event);
  const unsubscribe = parseEmailUnsubscribe(headers);
  const rawAudit =
    event.category === 'receipt'
      ? explainReceiptClassification(event)
      : parseClassificationAudit(event.classificationAudit);
  const rules = (await storeListEmailRules().catch(() => ({ rules: [] }))).rules;
  const classificationAudit = attachClassificationRuleLinks(rawAudit, rules, {
    routeNote: event.routeNote,
  });
  const matchedRule = primaryClassificationRule(classificationAudit);
  const forwardedTo = resolveForwardedTo({
    steps: classificationAudit,
    rules,
    matchedRuleId: matchedRule?.ruleId,
  });
  const toDisplay = displayInboxRecipients(envelopeTo, headers);
  return {
    ...event,
    headers,
    to: envelopeTo,
    toDisplay,
    matchedRuleId: matchedRule?.ruleId ?? null,
    matchedRuleTitle: matchedRule?.ruleTitle ?? null,
    forwardedTo,
    bodyHtml: resolveEmailHtmlForDisplay(bodyHtml, event.bodyText),
    bodyText: plainTextForDisplay(event.bodyText),
    bodySnippet: inboxListExcerpt(event),
    summary: inboxListExcerpt(event) || event.summary,
    monetaryAmount,
    hasMonetaryValue: monetaryAmount != null,
    unsubscribe,
    classificationAudit,
    resolvedMeetingStart:
      resolveMeetingStartFromInbox({
        proposedMeetingStart: event.proposedMeetingStart,
        schedulingNote: event.schedulingNote,
        summary: event.summary,
        subject: event.subject,
        bodyText: event.bodyText,
        bodySnippet: event.bodySnippet,
        bodyHtml: bodyHtml || event.bodyHtml,
        receivedAt: event.receivedAt,
      }) ?? null,
    _fullLoaded: true,
  };
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const existing = await storeGetEmailInbox(id);
  if (!existing) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  await storeUpdateEmailInbox(id, { resetForReclassify: true });

  const result = await processInboundEmail(
    {
      from: existing.from,
      subject: existing.subject,
      text: existing.bodyText,
      html: existing.bodyHtml || undefined,
      to: existing.to,
      cc: existing.cc,
      bcc: existing.bcc,
      replyTo: existing.replyTo,
      headers: existing.headers,
      messageId: existing.messageId,
      resendEmailId: existing.resendEmailId || undefined,
      attachments: existing.attachments,
    },
    {
      existingInboxId: id,
      receivedAt: existing.receivedAt,
      reclassify: true,
    },
  );

  const record = result.record ?? (await storeGetEmailInbox(id));
  if (!record) return jsonResponse({ ok: false, error: 'Reclassify failed' }, 500);

  const event = await enrichInboxEvent(record);
  const badgeCount = await getReviewsPendingCount().catch(() => undefined);
  return jsonResponse({
    ok: true,
    event,
    action: result.action,
    category: result.category,
    status: result.status,
    ...(badgeCount != null ? { badgeCount } : {}),
  });
}
