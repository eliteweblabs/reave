/**
 * POST /api/email/simulate — dry-run inbound triage.
 * Full path: processInboundEmail (no inbox/push/booking writes).
 * rulesOnly: evaluateEmailRules only (live lab test).
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { normalizeEmailAttachments } from '../../../lib/emailAttachments';
import { simulateInboundEmail } from '../../../lib/emailSimulate';
import type { InboundEmail } from '../../../lib/emailRules';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function asStringList(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  return s
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const from = String(body.from ?? '').trim();
  if (!from) return json({ ok: false, error: 'from is required' }, 400);

  const subject = String(body.subject ?? '');
  const text = String(body.text ?? body.body ?? '');
  const html = body.html != null ? String(body.html) : undefined;

  const email: InboundEmail = {
    from,
    subject,
    text,
    html,
    to: asStringList(body.to),
    cc: asStringList(body.cc),
    bcc: asStringList(body.bcc),
    replyTo: asStringList(body.replyTo ?? body.reply_to),
    messageId: body.messageId != null ? String(body.messageId) : undefined,
    attachments: normalizeEmailAttachments(body.attachments),
  };

  if (body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.headers as Record<string, unknown>)) {
      if (v != null) headers[k] = String(v);
    }
    email.headers = headers;
  }

  const ruleOrder = Array.isArray(body.ruleOrder)
    ? body.ruleOrder.map((id) => String(id))
    : Array.isArray(body.rule_order)
      ? (body.rule_order as unknown[]).map((id) => String(id))
      : undefined;

  const skipGates = body.skipGates === true || body.skip_gates === true;
  const rulesOnly = body.rulesOnly === true || body.rules_only === true;

  try {
    const result = await simulateInboundEmail({ email, ruleOrder, skipGates, rulesOnly });
    return json(result);
  } catch (e) {
    console.error('[email/simulate] failed', e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : 'Simulate failed' },
      500,
    );
  }
}
