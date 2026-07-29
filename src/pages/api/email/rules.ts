/**
 * GET  /api/email/rules — list rules + triage settings
 * POST /api/email/rules — create a rule
 * PATCH /api/email/rules — update notifyOnUnmatched { notifyOnUnmatched: boolean }
 */

import type { APIContext } from 'astro';
import {
  emailRulesStorageBackend,
  parseExpiresAt,
  storeCreateEmailRule,
  storeListEmailRules,
  storeSetNotifyOnUnmatched,
  type RuleInput,
} from '../../../lib/emailRuleStore';
import type { MatchMode, RuleField } from '../../../lib/emailRules';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseRuleInput(body: Record<string, unknown>): RuleInput | null {
  const title = String(body.title ?? '').trim();
  const status = String(body.status ?? '').trim();
  if (!title || !status) return null;
  const phrasesRaw = body.phrases;
  const phrases = Array.isArray(phrasesRaw)
    ? phrasesRaw.map(String)
    : String(phrasesRaw ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
  const fieldsRaw = body.fields;
  const fields = Array.isArray(fieldsRaw) ? (fieldsRaw as RuleField[]) : (['subject', 'body'] as RuleField[]);
  const expiresRaw = body.expiresAt !== undefined ? body.expiresAt : body.expires_at;
  const expiresAt = parseExpiresAt(expiresRaw ?? null);
  if (expiresAt === undefined) return null;
  return {
    title,
    status,
    description: body.description != null ? String(body.description) : undefined,
    phrases,
    matchMode: (body.matchMode === 'all' ? 'all' : 'any') as MatchMode,
    fields,
    notify: body.notify === true || body.notify === 'true',
    enabled: body.enabled !== false && body.enabled !== 'false',
    expiresAt,
    forwardTo:
      body.forwardTo !== undefined
        ? String(body.forwardTo)
        : body.forward_to !== undefined
          ? String(body.forward_to)
          : null,
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

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
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const input = parseRuleInput(body);
  if (!input) return json({ ok: false, error: 'title and status are required' }, 400);

  const rule = await storeCreateEmailRule(input);
  if (!rule) return json({ ok: false, error: 'Failed to create rule' }, 500);
  return json({ ok: true, rule, storage: emailRulesStorageBackend() });
}

export async function PATCH(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

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
