/**
 * POST /api/email/auto-response/[id]/reject — discard a pending auto-reply draft
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import {
  isAutoEmailResponseFeatureEnabled,
  rejectAutoEmailResponseDraft,
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

  const result = await rejectAutoEmailResponseDraft(draftId, userId);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, result.status ?? 400);
  }

  return jsonResponse({ ok: true, draft: result.draft });
}
