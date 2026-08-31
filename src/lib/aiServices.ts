/**
 * Built-in AI-related platform services + shared types for custom entries.
 * API keys stay in env/Railway — this layer only reports status and stores
 * admin-managed custom service records (name, provider, purpose, notes).
 */
import { getAgentModelSettings, type AgentModelSettings } from './agentModel';
import { getAnthropicBalance, type AnthropicBalance } from './anthropicBalance';
import {
  isAnthropicGatewayConfigured,
  isOpenRouterGateway,
  resolveAnthropicApiKey,
  resolveAnthropicBaseUrl,
  resolveAnthropicEndpoint,
} from './anthropicEndpoint';
import { getAnthropicKeySource, type AnthropicKeySource } from './anthropicKeySource';
import { isBraveConfigured } from './braveClient';
import { hasFeature } from './features';
import { isPexelsConfigured } from './pexelsClient';
import { serverEnv } from './serverEnv';
import { isVapiAdminConfigured, isVapiAdminPluginEnabled } from './vapiPlugin';

export const AI_SERVICE_PROVIDERS = [
  'anthropic',
  'openrouter',
  'omniroute',
  'openai',
  'google',
  'xai',
  'vapi',
  'telnyx',
  'pexels',
  'brave',
  'other',
] as const;
export type AiServiceProvider = (typeof AI_SERVICE_PROVIDERS)[number];

export const AI_SERVICE_PURPOSES = [
  'chat',
  'voice',
  'search',
  'images',
  'embeddings',
  'other',
] as const;
export type AiServicePurpose = (typeof AI_SERVICE_PURPOSES)[number];

export type AiServiceStatus = 'configured' | 'missing' | 'feature_off';

export type BuiltinAiService = {
  id: string;
  kind: 'builtin';
  name: string;
  provider: AiServiceProvider;
  purpose: AiServicePurpose;
  status: AiServiceStatus;
  detail: string;
  /** Optional account-menu tab for deeper settings (e.g. Vapi). */
  manageTab?: string;
};

export type CustomAiService = {
  id: string;
  kind: 'custom';
  name: string;
  provider: AiServiceProvider;
  purpose: AiServicePurpose;
  model: string | null;
  notes: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiServicesSnapshot = {
  builtins: BuiltinAiService[];
  custom: CustomAiService[];
  model: AgentModelSettings;
  anthropicBalance: AnthropicBalance;
  anthropicKeySource: AnthropicKeySource;
};

export function isAiServiceProvider(raw: unknown): raw is AiServiceProvider {
  return typeof raw === 'string' && (AI_SERVICE_PROVIDERS as readonly string[]).includes(raw);
}

export function isAiServicePurpose(raw: unknown): raw is AiServicePurpose {
  return typeof raw === 'string' && (AI_SERVICE_PURPOSES as readonly string[]).includes(raw);
}

export function labelForProvider(provider: AiServiceProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic';
    case 'openrouter':
      return 'OpenRouter';
    case 'omniroute':
      return 'OmniRoute';
    case 'openai':
      return 'OpenAI';
    case 'google':
      return 'Google';
    case 'xai':
      return 'xAI';
    case 'vapi':
      return 'Vapi';
    case 'telnyx':
      return 'Telnyx';
    case 'pexels':
      return 'Pexels';
    case 'brave':
      return 'Brave';
    default:
      return 'Other';
  }
}

export function labelForPurpose(purpose: AiServicePurpose): string {
  switch (purpose) {
    case 'chat':
      return 'Chat / agent';
    case 'voice':
      return 'Voice';
    case 'search':
      return 'Search';
    case 'images':
      return 'Images';
    case 'embeddings':
      return 'Embeddings';
    default:
      return 'Other';
  }
}

function anthropicBuiltin(model: AgentModelSettings, keySource: AnthropicKeySource): BuiltinAiService {
  if (!resolveAnthropicApiKey()) {
    return {
      id: 'anthropic',
      kind: 'builtin',
      name: 'Claude (Anthropic)',
      provider: 'anthropic',
      purpose: 'chat',
      status: 'missing',
      detail: isAnthropicGatewayConfigured()
        ? 'Gateway key not set (OPENROUTER_API_KEY / OMNIROUTE_API_KEY / ANTHROPIC_AUTH_TOKEN)'
        : 'ANTHROPIC_API_KEY not set',
    };
  }
  const endpoint = resolveAnthropicEndpoint();
  const sourceLabel =
    keySource === 'reave' ? 'reave key' : keySource === 'client' ? 'install key' : 'key set';
  const via = endpoint?.viaGateway ? ` via ${endpoint.host}` : '';
  return {
    id: 'anthropic',
    kind: 'builtin',
    name: 'Claude (Anthropic)',
    provider: 'anthropic',
    purpose: 'chat',
    status: 'configured',
    detail: `Model ${model.model} (${model.source}) · ${sourceLabel}${via}`,
  };
}

function openrouterBuiltin(): BuiltinAiService {
  const base = {
    id: 'openrouter',
    kind: 'builtin' as const,
    name: 'OpenRouter gateway',
    provider: 'openrouter' as const,
    purpose: 'chat' as const,
  };
  if (!isOpenRouterGateway()) {
    return {
      ...base,
      status: 'missing',
      detail: 'Set OPENROUTER_API_KEY to route Claude through OpenRouter',
    };
  }
  if (!resolveAnthropicApiKey()) {
    return {
      ...base,
      status: 'missing',
      detail: `Gateway ${resolveAnthropicBaseUrl()} · missing OPENROUTER_API_KEY`,
    };
  }
  const endpoint = resolveAnthropicEndpoint();
  return {
    ...base,
    status: 'configured',
    detail: `Routing Messages API via ${endpoint?.host ?? 'openrouter.ai'}`,
  };
}

function omnirouteBuiltin(): BuiltinAiService {
  const base = {
    id: 'omniroute',
    kind: 'builtin' as const,
    name: 'OmniRoute gateway',
    provider: 'omniroute' as const,
    purpose: 'chat' as const,
  };
  if (!isAnthropicGatewayConfigured() || isOpenRouterGateway()) {
    return {
      ...base,
      status: 'missing',
      detail: 'Set ANTHROPIC_BASE_URL (or OMNIROUTE_BASE_URL) to route Claude through OmniRoute',
    };
  }
  if (!resolveAnthropicApiKey()) {
    return {
      ...base,
      status: 'missing',
      detail: `Gateway ${resolveAnthropicBaseUrl()} · missing OMNIROUTE_API_KEY`,
    };
  }
  const endpoint = resolveAnthropicEndpoint();
  return {
    ...base,
    status: 'configured',
    detail: `Routing Messages API via ${endpoint?.host ?? 'gateway'}`,
  };
}

function vapiBuiltin(): BuiltinAiService {
  const base = {
    id: 'vapi',
    kind: 'builtin' as const,
    name: 'Vapi voice',
    provider: 'vapi' as const,
    purpose: 'voice' as const,
    manageTab: 'vapi',
  };
  if (!hasFeature('vapi')) {
    return { ...base, status: 'feature_off', detail: 'vapi module not enabled — request via Add-ons' };
  }
  if (!isVapiAdminPluginEnabled()) {
    return { ...base, status: 'feature_off', detail: 'Vapi plugin disabled' };
  }
  if (!isVapiAdminConfigured()) {
    return {
      ...base,
      status: 'missing',
      detail: 'Set VAPI_API_KEY and assistant ID (Account → Vapi)',
    };
  }
  return { ...base, status: 'configured', detail: 'Ready to sync assistant branding' };
}

function telnyxBuiltin(): BuiltinAiService {
  const base = {
    id: 'telnyx-voice',
    kind: 'builtin' as const,
    name: 'Telnyx phone AI',
    provider: 'telnyx' as const,
    purpose: 'voice' as const,
  };
  if (!hasFeature('voice')) {
    return { ...base, status: 'feature_off', detail: 'voice module not enabled — request via Add-ons' };
  }
  if (!serverEnv('TELNYX_API_KEY')?.trim()) {
    return { ...base, status: 'missing', detail: 'TELNYX_API_KEY not set' };
  }
  const voiceOn = serverEnv('VOICE_AGENT_ENABLED') === '1';
  return {
    ...base,
    status: 'configured',
    detail: voiceOn ? 'Voice agent enabled' : 'API key set · VOICE_AGENT_ENABLED is off',
  };
}

function pexelsBuiltin(): BuiltinAiService {
  const base = {
    id: 'pexels',
    kind: 'builtin' as const,
    name: 'Pexels stock photos',
    provider: 'pexels' as const,
    purpose: 'images' as const,
  };
  if (!hasFeature('stock_photos')) {
    return {
      ...base,
      status: 'feature_off',
      detail: 'stock_photos module not enabled — request via Add-ons',
    };
  }
  if (!isPexelsConfigured()) {
    return { ...base, status: 'missing', detail: 'PEXELS_API_KEY not set' };
  }
  return { ...base, status: 'configured', detail: 'Stock photo search enabled' };
}

function braveBuiltin(): BuiltinAiService {
  if (!isBraveConfigured()) {
    return {
      id: 'brave',
      kind: 'builtin',
      name: 'Brave Search',
      provider: 'brave',
      purpose: 'search',
      status: 'missing',
      detail: 'BRAVE_API_KEY not set — agent web search unavailable',
    };
  }
  return {
    id: 'brave',
    kind: 'builtin',
    name: 'Brave Search',
    provider: 'brave',
    purpose: 'search',
    status: 'configured',
    detail: 'Agent web search enabled',
  };
}

export async function listBuiltinAiServices(): Promise<{
  builtins: BuiltinAiService[];
  model: AgentModelSettings;
  anthropicBalance: AnthropicBalance;
  anthropicKeySource: AnthropicKeySource;
}> {
  const [model, anthropicBalance] = await Promise.all([
    getAgentModelSettings(),
    getAnthropicBalance(),
  ]);
  const anthropicKeySource = getAnthropicKeySource();
  return {
    builtins: [
      openrouterBuiltin(),
      omnirouteBuiltin(),
      anthropicBuiltin(model, anthropicKeySource),
      vapiBuiltin(),
      telnyxBuiltin(),
      pexelsBuiltin(),
      braveBuiltin(),
    ],
    model,
    anthropicBalance,
    anthropicKeySource,
  };
}
