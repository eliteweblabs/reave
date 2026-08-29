/**
 * POST /api/email/rules/test — dry-run Targets/Exemptions against recent inbox.
 */

import type { APIContext } from 'astro';
import { testEmailRuleAgainstInbox, type RuleApplyDraft } from '../../../../lib/emailRuleApply';
import type { MatchMode, RuleField } from '../../../../lib/emailRules';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

function parseDraft(body: Record<string, unknown>): RuleApplyDraft {
  const phrases = Array.isArray(body.phrases) ? body.phrases.map(String) : [];
  const exceptPhrases = Array.isArray(body.exceptPhrases)
    ? body.exceptPhrases.map(String)
    : Array.isArray(body.except_phrases)
      ? body.except_phrases.map(String)
      : [];
  const fields = (Array.isArray(body.fields) ? body.fields : [])
    .map((f) => String(f).trim().toLowerCase())
    .filter((f): f is RuleField => f === 'from' || f === 'subject' || f === 'body');
  const matchMode = String(body.matchMode || body.match_mode || 'any').toLowerCase() === 'all'
    ? 'all'
    : 'any';
  return {
    phrases,
    exceptPhrases,
    fields,
    matchMode: matchMode as MatchMode,
    status: String(body.status || 'CUSTOM'),
  };
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await testEmailRuleAgainstInbox(parseDraft(body));
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({
    ok: true,
    scanned: result.scanned,
    count: result.matches.length,
    matches: result.matches,
  });
}
