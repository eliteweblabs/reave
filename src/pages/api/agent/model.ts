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
import { getAnthropicBalance, type AnthropicBalance } from '../../../lib/anthropicBalance';
import { getAnthropicKeySource, type AnthropicKeySource } from '../../../lib/anthropicKeySource';
import { getLlmRouteInfo, type LlmRouteInfo } from '../../../lib/anthropicEndpoint';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


function payload(
  settings: AgentModelSettings,
  anthropicBalance: AnthropicBalance,
  anthropicKeySource: AnthropicKeySource = getAnthropicKeySource(),
  llmRoute: LlmRouteInfo = getLlmRouteInfo(),
) {
  return {
    ok: true,
    model: settings.model,
    source: settings.source,
    defaultModel: settings.defaultModel,
    envModel: settings.envModel,
    storedModel: settings.storedModel,
    options: settings.options,
    storage: agentModelStorageBackend(),
    anthropicBalance,
    anthropicKeySource,
    llmRoute,
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  const [settings, anthropicBalance] = await Promise.all([
    getAgentModelSettings(),
    getAnthropicBalance(),
  ]);
  return jsonResponse(payload(settings, anthropicBalance));
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const raw = body.model;
  if (raw == null || raw === '') {
    const ok = await setStoredAgentModel(null);
    if (!ok) return jsonResponse({ ok: false, error: 'Failed to reset model' }, 500);
    const [settings, anthropicBalance] = await Promise.all([
      getAgentModelSettings(),
      getAnthropicBalance(),
    ]);
    return jsonResponse(payload(settings, anthropicBalance));
  }

  const model = normalizeAgentModelInput(String(raw));
  if (!model) {
    return jsonResponse({ ok: false, error: 'Unknown model. Try auto, sonnet, opus, or haiku.' }, 400);
  }

  const ok = await setStoredAgentModel(model);
  if (!ok) return jsonResponse({ ok: false, error: 'Failed to save model' }, 500);
  const [settings, anthropicBalance] = await Promise.all([
    getAgentModelSettings(),
    getAnthropicBalance(),
  ]);
  return jsonResponse(payload(settings, anthropicBalance));
}
