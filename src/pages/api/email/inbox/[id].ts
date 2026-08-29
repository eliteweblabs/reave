/**
 * GET    /api/email/inbox/[id] — full stored email (body + headers)
 * PATCH  /api/email/inbox/[id] — update category/action (e.g. mark junk)
 * DELETE /api/email/inbox/[id] — remove from inbox log
 */

import type { APIContext } from 'astro';
import {
  storeDeleteEmailInbox,
  storeGetEmailInbox,
  storeUpdateEmailInbox,
  type EmailInboxPatch,
} from '../../../../lib/emailInboxStore';
import { dismissEmailRelatedNotifications } from '../../../../lib/emailNotificationSync';
import { patchForMarkJunk } from '../../../../lib/emailJunkNotifyInvariant';
import type { EmailCategory } from '../../../../lib/emailProcessor';
import {
  emailHtmlHasInlineStyles,
  inboxListExcerpt,
  normalizeEmailHtml,
  plainTextForDisplay,
  resolveEmailHtmlForDisplay,
} from '../../../../lib/emailBody';
import { extractMonetaryAmountFromEmail } from '../../../../lib/emailMoney';
import { parseEmailUnsubscribe, hasListUnsubscribeHeader } from '../../../../lib/emailUnsubscribe';
import { fetchResendInboundEmail } from '../../../../lib/resendInboundEmail';
import { unlinkProjectItem } from '../../../../lib/projectLinks';
import { scheduleReviewsBadgePush } from '../../../../lib/pushBadgeSync';
import { getReviewsPendingCount } from '../../../../lib/reviewsPendingCount';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  attachClassificationRuleLinks,
  explainReceiptClassification,
  parseClassificationAudit,
  primaryClassificationRule,
  resolveForwardedTo,
} from '../../../../lib/emailClassificationAudit';
import { storeListEmailRules } from '../../../../lib/emailRuleStore';
import {
  displayInboxRecipients,
  hasOriginalRecipientHeaders,
  isGenericInboundMailbox,
} from '../../../../lib/emailOriginalRecipient';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


const CATEGORIES = new Set<EmailCategory>([
  'junk',
  'auto_deleted',
  'client',
  'alert',
  'internal',
  'review',
  'receipt',
  'project',
  'otp',
  'auth_link',
]);

function parsePatch(body: unknown): EmailInboxPatch | null {
  if (!body || typeof body !== 'object') return null;
  const rec = body as Record<string, unknown>;
  const patch: EmailInboxPatch = {};
  if (rec.rejectProjectMatch === true) {
    return { rejectProjectMatch: true };
  }
  if (rec.category != null) {
    const cat = String(rec.category).toLowerCase() as EmailCategory;
    if (!CATEGORIES.has(cat)) return null;
    patch.category = cat;
  }
  if (rec.action != null) patch.action = String(rec.action);
  if (rec.status != null) patch.status = String(rec.status);
  if (rec.routeNote != null) patch.routeNote = String(rec.routeNote);
  if (rec.classificationAudit !== undefined) {
    patch.classificationAudit = parseClassificationAudit(rec.classificationAudit);
  }
  if (rec.bookingUid !== undefined) {
    patch.bookingUid = rec.bookingUid == null ? null : String(rec.bookingUid);
  }
  if (rec.bookingStart !== undefined) {
    patch.bookingStart = rec.bookingStart == null ? null : String(rec.bookingStart);
  }
  if (rec.seen === true || rec.markSeen === true) patch.markSeen = true;
  if (rec.markAutomationAck === true || rec.automationAck === true) patch.markAutomationAck = true;
  if (rec.acceptAutomationDecision === true) patch.acceptAutomationDecision = true;
  return Object.keys(patch).length ? patch : null;
}

function isEmailArchivedOrRemoved(patch: EmailInboxPatch): boolean {
  const action = String(patch.action || '').toLowerCase();
  const status = String(patch.status || '').toLowerCase();
  return (
    patch.category === 'junk' ||
    patch.category === 'auto_deleted' ||
    action === 'filed' ||
    action === 'junk' ||
    action === 'deleted' ||
    status === 'filed'
  );
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  const event = await storeGetEmailInbox(id);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);

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

  const monetaryAmount = extractMonetaryAmountFromEmail(event);
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
  return jsonResponse({
    ok: true,
    event: {
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
    },
  });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const patch = parsePatch(body);
  if (!patch) return jsonResponse({ ok: false, error: 'Nothing to update' }, 400);

  const existing = await storeGetEmailInbox(id);
  if (!existing) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  if (patch.rejectProjectMatch) {
    const slug = existing.jobSlug?.trim();
    if (slug) {
      await unlinkProjectItem(slug, 'email', id).catch(() => undefined);
    }
    const event = await storeUpdateEmailInbox(id, {
      jobSlug: null,
      jobTitle: null,
      automationKind: null,
      action: 'review',
      status: 'UNMATCHED',
      routeNote: 'Project match dismissed',
      acceptAutomationDecision: true,
      markAutomationAck: true,
    });
    if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);
    await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);
    const monetaryAmount = extractMonetaryAmountFromEmail(event);
    const badgeCount = await getReviewsPendingCount().catch(() => undefined);
    return jsonResponse({
      ok: true,
      event: { ...event, monetaryAmount, hasMonetaryValue: monetaryAmount != null },
      ...(badgeCount != null ? { badgeCount } : {}),
    });
  }

  const { rejectProjectMatch: _reject, ...storePatch } = patch;
  if (isEmailArchivedOrRemoved(storePatch)) {
    storePatch.markAutomationAck = true;
  }
  // Hard rule: marking junk dismisses dashboard alerts and strips client-reply urgency.
  const markingJunk =
    storePatch.category === 'junk' ||
    String(storePatch.action || '').toLowerCase() === 'junk' ||
    String(storePatch.status || '').toUpperCase() === 'JUNK';
  const event = await storeUpdateEmailInbox(
    id,
    markingJunk ? { ...storePatch, ...patchForMarkJunk(existing) } : storePatch,
  );
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  const clearedReviewSurface =
    Boolean(storePatch.markAutomationAck) ||
    isEmailArchivedOrRemoved(storePatch) ||
    markingJunk;
  if (clearedReviewSurface) {
    await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);
    // dismissEmailRelatedNotifications schedules a badge push; ensure ack-only
    // paths still fire even when there were no sibling push alerts to clear.
    scheduleReviewsBadgePush();
  }
  const monetaryAmount = extractMonetaryAmountFromEmail(event);
  const badgeCount = clearedReviewSurface
    ? await getReviewsPendingCount().catch(() => undefined)
    : undefined;
  return jsonResponse({
    ok: true,
    event: { ...event, monetaryAmount, hasMonetaryValue: monetaryAmount != null },
    ...(badgeCount != null ? { badgeCount } : {}),
  });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = context.params.id?.trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400);

  await dismissEmailRelatedNotifications(id, { markAutomationAck: false }).catch(() => undefined);
  const deleted = await storeDeleteEmailInbox(id);
  if (!deleted) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  const badgeCount = await getReviewsPendingCount().catch(() => undefined);
  return jsonResponse({ ok: true, ...(badgeCount != null ? { badgeCount } : {}) });
}
