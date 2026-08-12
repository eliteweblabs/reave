/**
 * GET  /api/email/drafts — list unsent compose drafts
 * POST /api/email/drafts — create draft
 */

import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  createEmailDraft,
  listEmailDrafts,
  normalizeEmailDraftRecipients,
} from '../../../../lib/emailDraftStore';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500);
  const events = await listEmailDrafts(limit);

  return json({ ok: true, events });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const draft = await createEmailDraft({
    to: normalizeEmailDraftRecipients(body.to),
    subject: String(body.subject ?? ''),
    body: String(body.body ?? body.text ?? ''),
    inReplyToEmailId:
      body.inReplyToEmailId != null
        ? String(body.inReplyToEmailId).trim() || null
        : body.in_reply_to_email_id != null
          ? String(body.in_reply_to_email_id).trim() || null
          : null,
    createdBy: userId,
  });

  return json({ ok: true, event: draft }, 201);
}
