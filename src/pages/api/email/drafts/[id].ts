/**
 * PATCH  /api/email/drafts/:id — update draft
 * DELETE /api/email/drafts/:id — remove draft
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  deleteEmailDraft,
  normalizeEmailDraftRecipients,
  updateEmailDraft,
} from '../../../../lib/emailDraftStore';

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
    subject?: string;
    body?: string;
    inReplyToEmailId?: string | null;
  } = {};

  if (body.to !== undefined) patch.to = normalizeEmailDraftRecipients(body.to);
  if (body.subject !== undefined) patch.subject = String(body.subject);
  if (body.body !== undefined) patch.body = String(body.body);
  else if (body.text !== undefined) patch.body = String(body.text);
  if (body.inReplyToEmailId !== undefined) {
    patch.inReplyToEmailId = String(body.inReplyToEmailId).trim() || null;
  } else if (body.in_reply_to_email_id !== undefined) {
    patch.inReplyToEmailId = String(body.in_reply_to_email_id).trim() || null;
  }

  const event = await updateEmailDraft(id, patch);
  if (!event) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, event });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Invalid id' }, 400);

  const deleted = await deleteEmailDraft(id);
  if (!deleted) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, id, deleted: true });
}
