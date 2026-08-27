/**
 * GET    /api/email/rules/[id]
 * PUT    /api/email/rules/[id]
 * DELETE /api/email/rules/[id]
 */

import type { APIContext } from 'astro';
import {
  emailRulesStorageBackend,
  parseEmailRuleInput,
  storeDeleteEmailRule,
  storeGetEmailRule,
  storeEmailRuleWriteHttpStatus,
  storeUpdateEmailRule,
} from '../../../../lib/emailRuleStore';
import { isRepoCatalogRule } from '../../../../lib/emailRules';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { isCanonicalReaveInstall } from '../../../../lib/installConfig';

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
          'Catalog rules come from DEFAULT_RULES in the repo and update on every deploy. Only the reΛVe.app install can edit them.',
      },
      403,
    );
  }

  const input = parseEmailRuleInput(body);
  if (!input) return json({ ok: false, error: 'status is required' }, 400);

  const result = await storeUpdateEmailRule(id, input);
  if (!result.ok) {
    return json(
      { ok: false, error: result.error, colliding: result.colliding },
      storeEmailRuleWriteHttpStatus(result),
    );
  }
  return json({ ok: true, rule: result.rule, storage: emailRulesStorageBackend() });
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
