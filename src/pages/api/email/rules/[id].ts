/**
 * GET    /api/email/rules/[id]
 * PUT    /api/email/rules/[id]
 * DELETE /api/email/rules/[id]
 */

import type { APIContext } from 'astro';
import {
  emailRulesStorageBackend,
  parseExpiresAt,
  storeDeleteEmailRule,
  storeGetEmailRule,
  storeUpdateEmailRule,
  type RuleInput,
} from '../../../../lib/emailRuleStore';
import type { MatchMode, RuleField, RuleNotifyAction } from '../../../../lib/emailRules';
import {
  coalesceRuleNotifyFields,
  isRepoCatalogRule,
  normalizeEmailRuleScope,
  normalizeNotifyActions,
} from '../../../../lib/emailRules';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { isCanonicalReaveInstall } from '../../../../lib/installConfig';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parsePhraseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRuleInput(body: Record<string, unknown>): RuleInput | null {
  const title = String(body.title ?? '').trim();
  const status = String(body.status ?? '').trim();
  if (!title || !status) return null;
  const phrases = parsePhraseList(body.phrases);
  const exceptRaw = body.exceptPhrases !== undefined ? body.exceptPhrases : body.except_phrases;
  const exceptPhrases = parsePhraseList(exceptRaw);
  const fieldsRaw = body.fields;
  const fields = Array.isArray(fieldsRaw) ? (fieldsRaw as RuleField[]) : (['subject', 'body'] as RuleField[]);
  const expiresRaw = body.expiresAt !== undefined ? body.expiresAt : body.expires_at;
  const expiresAt = parseExpiresAt(expiresRaw ?? null);
  if (expiresAt === undefined) return null;
  const actionsRaw = body.notifyActions !== undefined ? body.notifyActions : body.notify_actions;
  const notifyFields = coalesceRuleNotifyFields({
    notify: body.notify === true || body.notify === 'true',
    notifyPush:
      body.notifyPush !== undefined
        ? body.notifyPush === true || body.notifyPush === 'true'
        : body.notify_push !== undefined
          ? body.notify_push === true || body.notify_push === 'true'
          : null,
    notifyDashboard:
      body.notifyDashboard !== undefined
        ? body.notifyDashboard === true || body.notifyDashboard === 'true'
        : body.notify_dashboard !== undefined
          ? body.notify_dashboard === true || body.notify_dashboard === 'true'
          : null,
    notifyActions: actionsRaw,
  });
  const hasChannelKey =
    body.notifyPush !== undefined ||
    body.notify_push !== undefined ||
    body.notifyDashboard !== undefined ||
    body.notify_dashboard !== undefined;
  const legacyNotify = body.notify === true || body.notify === 'true';
  const hasScope = body.scope !== undefined && body.scope !== null && body.scope !== '';
  return {
    title,
    status,
    description: body.description != null ? String(body.description) : undefined,
    phrases,
    exceptPhrases,
    matchMode: (body.matchMode === 'all' ? 'all' : 'any') as MatchMode,
    fields,
    notify: hasChannelKey ? notifyFields.notify : legacyNotify,
    notifyPush: hasChannelKey ? notifyFields.notifyPush : legacyNotify,
    notifyDashboard: hasChannelKey ? notifyFields.notifyDashboard : legacyNotify,
    notifyActions: normalizeNotifyActions(actionsRaw) as RuleNotifyAction[],
    enabled: body.enabled !== false && body.enabled !== 'false',
    expiresAt,
    forwardTo:
      body.forwardTo !== undefined
        ? String(body.forwardTo)
        : body.forward_to !== undefined
          ? String(body.forward_to)
          : null,
    createProject:
      body.createProject === true ||
      body.createProject === 'true' ||
      body.create_project === true ||
      body.create_project === 'true',
    ...(hasScope ? { scope: normalizeEmailRuleScope(body.scope, 'personal') } : {}),
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const rule = await storeGetEmailRule(id);
  if (!rule) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, rule });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const existing = await storeGetEmailRule(id);
  if (!existing) return json({ ok: false, error: 'Not found' }, 404);
  if (isRepoCatalogRule(existing) && !isCanonicalReaveInstall()) {
    return json(
      {
        ok: false,
        error:
          'Catalog rules come from DEFAULT_RULES in the repo and update on every deploy. Only the REΛVE install can edit them.',
      },
      403,
    );
  }

  const input = parseRuleInput(body);
  if (!input) return json({ ok: false, error: 'title and status are required' }, 400);

  const rule = await storeUpdateEmailRule(id, input);
  if (!rule) return json({ ok: false, error: 'Not found or save failed' }, 404);
  return json({ ok: true, rule, storage: emailRulesStorageBackend() });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const id = context.params.id?.trim();
  if (!id) return json({ ok: false, error: 'Missing id' }, 400);

  const existing = await storeGetEmailRule(id);
  if (!existing) return json({ ok: false, error: 'Not found' }, 404);
  if (isRepoCatalogRule(existing)) {
    return json(
      {
        ok: false,
        error: 'Catalog rules are defined in the repo and cannot be deleted on this install.',
      },
      403,
    );
  }

  const ok = await storeDeleteEmailRule(id);
  if (!ok) return json({ ok: false, error: 'Not found or delete failed' }, 404);
  return json({ ok: true });
}
