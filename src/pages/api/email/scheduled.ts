/**
 * GET  /api/email/scheduled — list pending / failed scheduled correspondence
 * POST /api/email/scheduled — queue a compose message for later send
 */

import type { APIContext } from 'astro';
import { buildAdminComposeEmail, parseUseBrandedTemplate } from '../../../lib/adminComposeEmail';
import { isImmediateScheduledAt, parseComposeScheduledAt } from '../../../lib/emailComposeSchedule';
import { normalizeEmailComposeImages } from '../../../lib/emailComposeImages';
import { normalizeEmailDraftRecipients } from '../../../lib/emailDraftStore';
import { createScheduledEmail, listScheduledEmails } from '../../../lib/emailScheduledStore';
import { ensureEmailScheduledScheduler } from '../../../lib/emailScheduledScheduler';
import { isEmailSendConfigured } from '../../../lib/outbound';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  ensureEmailScheduledScheduler();
  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500);
  const events = await listScheduledEmails(limit);
  return jsonResponse({ ok: true, events });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!isEmailSendConfigured()) {
    return jsonResponse({ ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  let scheduledAt: Date | null;
  try {
    scheduledAt = parseComposeScheduledAt(body.scheduledAt ?? body.scheduled_at);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : 'Invalid scheduled time' }, 400);
  }
  if (!scheduledAt || isImmediateScheduledAt(scheduledAt)) {
    return jsonResponse({ ok: false, error: 'Choose a send time at least a minute from now' }, 400);
  }

  const built = await buildAdminComposeEmail(body, { userId, context });
  if (!built.ok) return jsonResponse({ ok: false, error: built.error }, built.status);

  const event = await createScheduledEmail({
    to: normalizeEmailDraftRecipients(body.toRecipients ?? body.to),
    cc: normalizeEmailDraftRecipients(body.ccRecipients ?? body.cc),
    from: String(body.from ?? '').trim(),
    subject: String(body.subject ?? ''),
    body: String(body.text ?? body.body ?? ''),
    images: normalizeEmailComposeImages(body.images),
    inReplyToEmailId:
      body.inReplyToEmailId != null
        ? String(body.inReplyToEmailId).trim() || null
        : body.in_reply_to_email_id != null
          ? String(body.in_reply_to_email_id).trim() || null
          : null,
    useBrandedTemplate: parseUseBrandedTemplate(
      body.useBrandedTemplate ?? body.use_branded_template ?? body.branded,
    ),
    scheduledAt: scheduledAt.toISOString(),
    createdBy: userId,
  });
  ensureEmailScheduledScheduler();
  return jsonResponse({ ok: true, event, scheduled: true }, 201);
}
