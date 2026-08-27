/**
 * GET    /api/email/scheduled/:id — fetch one scheduled message
 * PATCH  /api/email/scheduled/:id — update content or send time
 * DELETE /api/email/scheduled/:id — cancel (?toDraft=1 converts back to a draft)
 * POST   /api/email/scheduled/:id — send now
 */

import type { APIContext } from 'astro';
import { isImmediateScheduledAt, parseComposeScheduledAt } from '../../../../lib/emailComposeSchedule';
import { normalizeEmailComposeImages } from '../../../../lib/emailComposeImages';
import { normalizeEmailDraftRecipients } from '../../../../lib/emailDraftStore';
import { sendScheduledEmailNow } from '../../../../lib/emailScheduledSend';
import { ensureEmailScheduledScheduler } from '../../../../lib/emailScheduledScheduler';
import {
  cancelScheduledEmailToDraft,
  deleteScheduledEmail,
  getScheduledEmail,
  updateScheduledEmail,
} from '../../../../lib/emailScheduledStore';
import { isEmailSendConfigured } from '../../../../lib/outbound';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseId(raw: string | undefined): string | null {
  const id = String(raw ?? '').trim();
  return id || null;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  const event = await getScheduledEmail(id);
  if (!event || event.status === 'sent' || event.status === 'cancelled') {
    return json({ ok: false, error: 'Not found' }, 404);
  }
  return json({ ok: true, event });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const patch: {
    to?: ReturnType<typeof normalizeEmailDraftRecipients>;
    cc?: ReturnType<typeof normalizeEmailDraftRecipients>;
    subject?: string;
    body?: string;
    images?: ReturnType<typeof normalizeEmailComposeImages>;
    inReplyToEmailId?: string | null;
    scheduledAt?: string;
  } = {};

  if (body.to !== undefined) patch.to = normalizeEmailDraftRecipients(body.to);
  if (body.cc !== undefined) patch.cc = normalizeEmailDraftRecipients(body.cc);
  if (body.subject !== undefined) patch.subject = String(body.subject);
  if (body.body !== undefined) patch.body = String(body.body);
  else if (body.text !== undefined) patch.body = String(body.text);
  if (body.images !== undefined) patch.images = normalizeEmailComposeImages(body.images);
  if (body.inReplyToEmailId !== undefined) {
    patch.inReplyToEmailId = String(body.inReplyToEmailId).trim() || null;
  } else if (body.in_reply_to_email_id !== undefined) {
    patch.inReplyToEmailId = String(body.in_reply_to_email_id).trim() || null;
  }
  if (body.scheduledAt !== undefined || body.scheduled_at !== undefined) {
    try {
      const at = parseComposeScheduledAt(body.scheduledAt ?? body.scheduled_at);
      if (!at || isImmediateScheduledAt(at)) {
        return json({ ok: false, error: 'Choose a send time at least a minute from now' }, 400);
      }
      patch.scheduledAt = at.toISOString();
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : 'Invalid scheduled time' }, 400);
    }
  }

  const event = await updateScheduledEmail(id, patch);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);
  ensureEmailScheduledScheduler();
  return json({ ok: true, event });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  const toDraft = context.url.searchParams.get('toDraft') === '1';
  if (toDraft) {
    const result = await cancelScheduledEmailToDraft(id);
    if (!result) return json({ ok: false, error: 'Not found' }, 404);
    return json({ ok: true, id, deleted: true, draft: result.draft });
  }

  const deleted = await deleteScheduledEmail(id);
  if (!deleted) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, id, deleted: true });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isEmailSendConfigured()) {
    return json({ ok: false, error: 'Outbound email is not configured (RESEND_API_KEY)' }, 503);
  }

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  const event = await getScheduledEmail(id);
  if (!event || event.status === 'sent' || event.status === 'cancelled') {
    return json({ ok: false, error: 'Not found' }, 404);
  }

  const result = await sendScheduledEmailNow(event);
  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, id: result.id, sent: true, scheduledId: event.id });
}
