/**
 * POST /api/email/send — send outbound mail from the admin compose UI (Resend).
 * Pass scheduledAt (ISO) to queue a later send instead of delivering now.
 */

import type { APIContext } from 'astro';
import { buildAdminComposeEmail } from '../../../lib/adminComposeEmail';
import { deliverAdminComposeMail } from '../../../lib/deliverAdminCompose';
import { isImmediateScheduledAt, parseComposeScheduledAt } from '../../../lib/emailComposeSchedule';
import { normalizeEmailComposeImages } from '../../../lib/emailComposeImages';
import { createScheduledEmail } from '../../../lib/emailScheduledStore';
import { ensureEmailScheduledScheduler } from '../../../lib/emailScheduledScheduler';
import { normalizeEmailDraftRecipients } from '../../../lib/emailDraftStore';
import { isEmailSendConfigured } from '../../../lib/outbound';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


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

  let scheduledAt: Date | null = null;
  try {
    scheduledAt = parseComposeScheduledAt(body.scheduledAt ?? body.scheduled_at);
  } catch (e) {
    return jsonResponse({ ok: false, error: e instanceof Error ? e.message : 'Invalid scheduled time' }, 400);
  }

  if (scheduledAt && !isImmediateScheduledAt(scheduledAt)) {
    const built = await buildAdminComposeEmail(body, { userId, context });
    if (!built.ok) return jsonResponse({ ok: false, success: false, error: built.error }, built.status);

    const record = await createScheduledEmail({
      to: normalizeEmailDraftRecipients(body.toRecipients ?? body.to),
      cc: normalizeEmailDraftRecipients(body.ccRecipients ?? body.cc),
      subject: String(body.subject ?? ''),
      body: String(body.text ?? body.body ?? ''),
      images: normalizeEmailComposeImages(body.images),
      inReplyToEmailId:
        body.inReplyToEmailId != null
          ? String(body.inReplyToEmailId).trim() || null
          : body.in_reply_to_email_id != null
            ? String(body.in_reply_to_email_id).trim() || null
            : null,
      scheduledAt: scheduledAt.toISOString(),
      createdBy: userId,
    });
    ensureEmailScheduledScheduler();
    return jsonResponse({
      ok: true,
      success: true,
      scheduled: true,
      id: record.id,
      scheduledAt: record.scheduledAt,
    });
  }

  const built = await buildAdminComposeEmail(body, { userId, context });
  if (!built.ok) return jsonResponse({ ok: false, success: false, error: built.error }, built.status);

  const result = await deliverAdminComposeMail(built.mail, userId);
  if (!result.ok) return jsonResponse({ ok: false, success: false, error: result.error }, 502);

  ensureEmailScheduledScheduler();
  return jsonResponse({
    ok: true,
    success: true,
    id: result.id,
    routed: result.routed,
    inReplyToEmailId: result.inReplyToEmailId,
  });
}
