/**
 * GET  /api/newsletter/automations — list lifecycle automations (defaults + overrides)
 * POST /api/newsletter/automations — update one { id, enabled?, delayMinutes? }
 */
import type { APIContext } from 'astro';
import { NEWSLETTER_AUTOMATIONS, getAutomationDef, mergeAutomation } from '../../../lib/newsletterAutomations';
import { getAutomationOverrides, setAutomationOverride } from '../../../lib/newsletterStore';
import { ensureNewsletterScheduler } from '../../../lib/newsletterScheduler';
import { isNewsletterEnabled } from '../../../lib/newsletterEngine';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  ensureNewsletterScheduler();
  const overrides = await getAutomationOverrides();
  const automations = NEWSLETTER_AUTOMATIONS.map((def) => mergeAutomation(def, overrides[def.id]));
  return json({ ok: true, enabled: isNewsletterEnabled(), automations });
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

  const id = String(body.id ?? '').trim();
  if (!id || !getAutomationDef(id)) return json({ ok: false, error: 'Unknown automation id' }, 400);

  const override: { enabled?: boolean; delayMinutes?: number } = {};
  if (typeof body.enabled === 'boolean') override.enabled = body.enabled;
  if (body.delayMinutes !== undefined) {
    const n = Number(body.delayMinutes);
    if (!Number.isFinite(n) || n < 0) return json({ ok: false, error: 'delayMinutes must be >= 0' }, 400);
    override.delayMinutes = Math.round(n);
  }
  if (!Object.keys(override).length) return json({ ok: false, error: 'Nothing to update' }, 400);

  const ok = await setAutomationOverride(id, override);
  if (!ok) return json({ ok: false, error: 'Failed to save' }, 500);

  const overrides = await getAutomationOverrides();
  const def = getAutomationDef(id)!;
  return json({ ok: true, automation: mergeAutomation(def, overrides[id]) });
}
