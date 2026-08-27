/**
 * GET  /api/email/rules — list rules + triage settings
 * POST /api/email/rules — create a rule
 * PATCH /api/email/rules — update notifyOnUnmatched { notifyOnUnmatched: boolean }
 */

import type { APIContext } from 'astro';
import {
  emailRulesStorageBackend,
  parseEmailRuleInput,
  storeCreateEmailRule,
  storeEmailRuleWriteHttpStatus,
  storeListEmailRules,
  storeSetNotifyOnUnmatched,
} from '../../../lib/emailRuleStore';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const config = await storeListEmailRules();
  return json({
    ok: true,
    ...config,
    storage: emailRulesStorageBackend(),
    pipeline: {
      inbound: 'POST /api/email/inbound (Resend webhook)',
      handler: 'classifyEmail() → handleInboundEmail()',
    },
  });
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

  const input = parseEmailRuleInput(body);
  if (!input) return json({ ok: false, error: 'status is required' }, 400);

  const result = await storeCreateEmailRule(input);
  if (!result.ok) {
    return json(
      { ok: false, error: result.error, colliding: result.colliding },
      storeEmailRuleWriteHttpStatus(result),
    );
  }
  return json({ ok: true, rule: result.rule, storage: emailRulesStorageBackend() });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  if (typeof body.notifyOnUnmatched !== 'boolean') {
    return json({ ok: false, error: 'notifyOnUnmatched boolean required' }, 400);
  }

  const ok = await storeSetNotifyOnUnmatched(body.notifyOnUnmatched);
  if (!ok) return json({ ok: false, error: 'Failed to save settings' }, 500);
  return json({ ok: true, notifyOnUnmatched: body.notifyOnUnmatched });
}
