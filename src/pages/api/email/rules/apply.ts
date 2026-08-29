/**
 * POST /api/email/rules/apply — run a rule's filing action on inbox ids from Test.
 */

import type { APIContext } from 'astro';
import { applyEmailRuleToInbox } from '../../../../lib/emailRuleApply';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const idsRaw = body.ids;
  const ids = Array.isArray(idsRaw) ? idsRaw.map((id) => String(id)) : [];
  const result = await applyEmailRuleToInbox({
    ruleId: body.ruleId != null ? String(body.ruleId) : body.rule_id != null ? String(body.rule_id) : null,
    status: String(body.status || ''),
    ids,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({
    ok: true,
    applied: result.applied,
    skipped: result.skipped,
    matches: result.matches,
  });
}
