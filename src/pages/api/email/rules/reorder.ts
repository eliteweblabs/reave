/**
 * POST /api/email/rules/reorder — persist rule priority order { ids: string[] }
 */

import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import {
  emailRulesStorageBackend,
  storeReorderEmailRules,
} from '../../../../lib/emailRuleStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
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

  const rawIds = body.ids;
  if (!Array.isArray(rawIds)) return json({ ok: false, error: 'ids array required' }, 400);
  const ids = rawIds.map((id) => String(id ?? '').trim()).filter(Boolean);
  if (!ids.length) return json({ ok: false, error: 'ids array required' }, 400);

  const result = await storeReorderEmailRules(ids);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({
    ok: true,
    rules: result.rules,
    storage: emailRulesStorageBackend(),
  });
}
