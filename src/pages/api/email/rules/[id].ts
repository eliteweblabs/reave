/**
 * GET    /api/email/rules/[id]
 * PUT    /api/email/rules/[id]
 * DELETE /api/email/rules/[id]
 */

import type { APIContext } from 'astro';
import {
  emailRulesStorageBackend,
  storeDeleteEmailRule,
  storeGetEmailRule,
  storeUpdateEmailRule,
  type RuleInput,
} from '../../../../lib/emailRuleStore';
import type { MatchMode, RuleField } from '../../../../lib/emailRules';

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
  return {
    title,
    status,
    description: body.description != null ? String(body.description) : undefined,
    phrases,
    matchMode: (body.matchMode === 'all' ? 'all' : 'any') as MatchMode,
    fields,
    notify: body.notify === true || body.notify === 'true',
    enabled: body.enabled !== false && body.enabled !== 'false',
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const rule = await storeGetEmailRule(id);
  if (!rule) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, rule });
}

export async function PUT(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const input = parseRuleInput(body);
  if (!input) return json({ ok: false, error: 'title and status are required' }, 400);

  const rule = await storeUpdateEmailRule(id, input);
  if (!rule) return json({ ok: false, error: 'Not found or save failed' }, 404);
  return json({ ok: true, rule, storage: emailRulesStorageBackend() });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const ok = await storeDeleteEmailRule(id);
  if (!ok) return json({ ok: false, error: 'Not found or delete failed' }, 404);
  return json({ ok: true });
}
