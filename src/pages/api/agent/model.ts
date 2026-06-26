/**
 * GET  /api/agent/model — current Claude model + options
 * PUT  /api/agent/model — set runtime model { model } or reset { model: null }
 */

import type { APIContext } from 'astro';
import {
  getAgentModelSettings,
  normalizeAgentModelInput,
  type AgentModelSettings,
} from '../../../lib/agentModel';
import { agentModelStorageBackend, setStoredAgentModel } from '../../../lib/agentModelStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function payload(settings: AgentModelSettings) {
  return {
    ok: true,
    model: settings.model,
    source: settings.source,
    defaultModel: settings.defaultModel,
    envModel: settings.envModel,
    storedModel: settings.storedModel,
    options: settings.options,
    storage: agentModelStorageBackend(),
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  return json(payload(await getAgentModelSettings()));
}

export async function PUT(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const raw = body.model;
  if (raw == null || raw === '') {
    const ok = await setStoredAgentModel(null);
    if (!ok) return json({ ok: false, error: 'Failed to reset model' }, 500);
    return json(payload(await getAgentModelSettings()));
  }

  const model = normalizeAgentModelInput(String(raw));
  if (!model) {
    return json({ ok: false, error: 'Unknown model. Try sonnet, opus, or haiku.' }, 400);
  }

  const ok = await setStoredAgentModel(model);
  if (!ok) return json({ ok: false, error: 'Failed to save model' }, 500);
  return json(payload(await getAgentModelSettings()));
}
