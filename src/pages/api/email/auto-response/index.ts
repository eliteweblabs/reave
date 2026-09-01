/**
 * GET  /api/email/auto-response — pending auto-reply drafts + policy
 * POST /api/email/auto-response — queue a draft for an inbox message (hand review)
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  autoEmailResponsePolicy,
  isAutoEmailResponseFeatureEnabled,
  listAutoEmailResponseQueue,
  queueAutoEmailResponseDraft,
} from '../../../../lib/autoEmailResponse';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isAutoEmailResponseFeatureEnabled()) {
    return jsonResponse({ ok: false, error: 'Module not enabled' }, 404);
  }

  const limitRaw = context.url.searchParams.get('limit');
  const limit = Math.min(Math.max(Number(limitRaw) || 100, 1), 500);
  const drafts = await listAutoEmailResponseQueue(limit);

  return jsonResponse({
    ok: true,
    policy: autoEmailResponsePolicy(),
    drafts,
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!isAutoEmailResponseFeatureEnabled()) {
    return jsonResponse({ ok: false, error: 'Module not enabled' }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const inboxEmailId = String(body.inboxEmailId ?? body.inbox_email_id ?? '').trim();
  const staffNotes = body.staffNotes != null ? String(body.staffNotes) : undefined;

  const result = await queueAutoEmailResponseDraft({
    inboxEmailId,
    staffNotes,
    createdBy: userId,
  });

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, result.status ?? 400);
  }

  return jsonResponse({ ok: true, draft: result.draft, policy: autoEmailResponsePolicy() }, 201);
}
