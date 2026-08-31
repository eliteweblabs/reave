/**
 * GET    /api/email/drafts/:id — fetch one draft
 * PATCH  /api/email/drafts/:id — update draft
 * DELETE /api/email/drafts/:id — remove draft
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { normalizeEmailComposeImages } from '../../../../lib/emailComposeImages';
import {
  deleteEmailDraft,
  getEmailDraft,
  normalizeEmailDraftRecipients,
  updateEmailDraft,
} from '../../../../lib/emailDraftStore';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


function parseId(raw: string | undefined): string | null {
  const id = String(raw ?? '').trim();
  return id || null;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Invalid id' }, 400);

  const event = await getEmailDraft(id);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, event });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Invalid id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const patch: {
    to?: ReturnType<typeof normalizeEmailDraftRecipients>;
    cc?: ReturnType<typeof normalizeEmailDraftRecipients>;
    from?: string;
    subject?: string;
    body?: string;
    images?: ReturnType<typeof normalizeEmailComposeImages>;
    inReplyToEmailId?: string | null;
  } = {};

  if (body.to !== undefined) patch.to = normalizeEmailDraftRecipients(body.to);
  if (body.cc !== undefined) patch.cc = normalizeEmailDraftRecipients(body.cc);
  if (body.from !== undefined) patch.from = String(body.from).trim();
  if (body.subject !== undefined) patch.subject = String(body.subject);
  if (body.body !== undefined) patch.body = String(body.body);
  else if (body.text !== undefined) patch.body = String(body.text);
  if (body.images !== undefined) patch.images = normalizeEmailComposeImages(body.images);
  if (body.inReplyToEmailId !== undefined) {
    patch.inReplyToEmailId = String(body.inReplyToEmailId).trim() || null;
  } else if (body.in_reply_to_email_id !== undefined) {
    patch.inReplyToEmailId = String(body.in_reply_to_email_id).trim() || null;
  }

  const event = await updateEmailDraft(id, patch);
  if (!event) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, event });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return jsonResponse({ ok: false, error: 'Invalid id' }, 400);

  const deleted = await deleteEmailDraft(id);
  if (!deleted) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  return jsonResponse({ ok: true, id, deleted: true });
}
