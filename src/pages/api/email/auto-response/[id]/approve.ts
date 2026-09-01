/**
 * POST /api/email/auto-response/[id]/approve — owner sends a pending auto-reply
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import {
  approveAutoEmailResponseDraft,
  isAutoEmailResponseFeatureEnabled,
} from '../../../../../lib/autoEmailResponse';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (!isAutoEmailResponseFeatureEnabled()) {
    return jsonResponse({ ok: false, error: 'Module not enabled' }, 404);
  }

  const draftId = String(context.params.id || '').trim();
  if (!draftId) return jsonResponse({ ok: false, error: 'Draft id required' }, 400);

  let body: Record<string, unknown> = {};
  try {
    const raw = await context.request.text();
    if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await approveAutoEmailResponseDraft({
    draftId,
    subject: body.subject != null ? String(body.subject) : undefined,
    body: body.body != null ? String(body.body) : undefined,
    approvedBy: userId,
  });

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, result.status ?? 400);
  }

  return jsonResponse({
    ok: true,
    draft: result.draft,
    resendId: result.resendId ?? null,
  });
}
