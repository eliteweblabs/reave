/**
 * Anthropic Messages endpoint resolution — direct Anthropic, OpenRouter, or OmniRoute gateway.
 *
 * Gateways accept the Anthropic Messages API at `{base}/v1/messages`.
 * - OpenRouter: set OPENROUTER_API_KEY (base defaults to https://openrouter.ai/api).
 * - OmniRoute / other: set ANTHROPIC_BASE_URL (or OMNIROUTE_BASE_URL) to the gateway root with no `/v1`.
 * Prefer OPENROUTER_API_KEY / OMNIROUTE_API_KEY / ANTHROPIC_AUTH_TOKEN for gateway keys; fall back to
 * ANTHROPIC_API_KEY (sent as x-api-key, same as Claude Code).
 */
import { siteOriginFallback } from './requestOrigin';
import { serverEnv } from './serverEnv';

export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api';

export type AnthropicGatewayKind = 'anthropic' | 'openrouter' | 'gateway';

export type AnthropicEndpoint = {
  /** Gateway or Anthropic root — no trailing slash, no `/v1`. */
  baseUrl: string;
  /** Full Messages URL. */
  messagesUrl: string;
  /** Credential for this hop (OpenRouter / OmniRoute key or Anthropic key). */
  apiKey: string;
  /** True when traffic goes through a non-Anthropic base URL. */
  viaGateway: boolean;
  gatewayKind: AnthropicGatewayKind;
  /** Host label for status UI. */
  host: string;
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeGatewayRoot(raw: string): string {
  let url = trimSlash(raw);
  // Callers sometimes paste …/v1; gateways want the root.
  if (url.toLowerCase().endsWith('/v1')) url = url.slice(0, -3);
  return trimSlash(url);
}

function hostFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function isOpenRouterHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'openrouter.ai' || h.endsWith('.openrouter.ai');
}

export function isDirectAnthropicBaseUrl(baseUrl: string): boolean {
  if (!baseUrl || baseUrl === DEFAULT_ANTHROPIC_BASE_URL) return true;
  return hostFromBaseUrl(baseUrl) === 'api.anthropic.com';
}

/** Resolve gateway root from env. Empty / unset → direct Anthropic. */
export function resolveAnthropicBaseUrl(): string {
  const openrouterKey = serverEnv('OPENROUTER_API_KEY')?.trim();
  const openrouterBase = serverEnv('OPENROUTER_BASE_URL')?.trim();
  const anthropicBase = serverEnv('ANTHROPIC_BASE_URL')?.trim();
  const omnirouteBase = serverEnv('OMNIROUTE_BASE_URL')?.trim();

  // OpenRouter key → OpenRouter host unless an explicit OpenRouter base URL is set.
  // Do not honor ANTHROPIC_BASE_URL / OMNIROUTE_BASE_URL here — those are common
  // leftovers and would send sk-or-* keys to api.anthropic.com (401 AUTH_002).
  if (openrouterKey) {
    if (openrouterBase) {
      return normalizeGatewayRoot(openrouterBase) || DEFAULT_OPENROUTER_BASE_URL;
    }
    if (anthropicBase) {
      const normalized = normalizeGatewayRoot(anthropicBase);
      if (isOpenRouterHost(hostFromBaseUrl(normalized))) return normalized;
    }
    return DEFAULT_OPENROUTER_BASE_URL;
  }

  if (openrouterBase) {
    return normalizeGatewayRoot(openrouterBase) || DEFAULT_OPENROUTER_BASE_URL;
  }

  const raw = anthropicBase || omnirouteBase || '';
  if (raw) {
    const normalized = normalizeGatewayRoot(raw);
    return normalized || DEFAULT_ANTHROPIC_BASE_URL;
  }
  return DEFAULT_ANTHROPIC_BASE_URL;
}

export function isOpenRouterGateway(): boolean {
  return isOpenRouterHost(hostFromBaseUrl(resolveAnthropicBaseUrl()));
}

export function resolveAnthropicGatewayKind(): AnthropicGatewayKind {
  if (!isAnthropicGatewayConfigured()) return 'anthropic';
  return isOpenRouterGateway() ? 'openrouter' : 'gateway';
}

/** True when any Anthropic Messages credential is available (direct or gateway). */
export function isAnthropicLlmConfigured(): boolean {
  return Boolean(resolveAnthropicApiKey());
}

export type LlmRouteInfo = {
  /** anthropic = direct API; openrouter | gateway = proxied */
  kind: AnthropicGatewayKind;
  /** Short label for UI chips, null when direct Anthropic. */
  label: string | null;
  host: string | null;
};

/** Resolved LLM routing for admin UI (model switcher chip, health, etc.). */
export function getLlmRouteInfo(): LlmRouteInfo {
  const endpoint = resolveAnthropicEndpoint();
  if (!endpoint?.viaGateway) {
    return { kind: 'anthropic', label: null, host: 'api.anthropic.com' };
  }
  if (endpoint.gatewayKind === 'openrouter') {
    return { kind: 'openrouter', label: 'OpenRouter', host: endpoint.host };
  }
  const host = endpoint.host || 'gateway';
  const short =
    /omniroute/i.test(host) ? 'OmniRoute' : host.length > 28 ? `${host.slice(0, 25)}…` : host;
  return { kind: 'gateway', label: short, host: endpoint.host };
}

export function isAnthropicGatewayConfigured(): boolean {
  return resolveAnthropicBaseUrl() !== DEFAULT_ANTHROPIC_BASE_URL;
}

/**
 * Key used for the Messages hop.
 * When a gateway base URL is set, prefer gateway-specific keys.
 */
export function resolveAnthropicApiKey(): string | undefined {
  const openrouter = serverEnv('OPENROUTER_API_KEY')?.trim();
  if (openrouter) return openrouter;

  const gateway = isAnthropicGatewayConfigured();
  if (gateway) {
    return (
      serverEnv('OMNIROUTE_API_KEY')?.trim() ||
      serverEnv('ANTHROPIC_AUTH_TOKEN')?.trim() ||
      serverEnv('ANTHROPIC_API_KEY')?.trim() ||
      undefined
    );
  }
  return serverEnv('ANTHROPIC_API_KEY')?.trim() || undefined;
}

export function resolveAnthropicEndpoint(): AnthropicEndpoint | null {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) return null;
  const baseUrl = resolveAnthropicBaseUrl();
  const viaGateway = baseUrl !== DEFAULT_ANTHROPIC_BASE_URL;
  const host = hostFromBaseUrl(baseUrl);
  return {
    baseUrl,
    messagesUrl: `${baseUrl}/v1/messages`,
    apiKey,
    viaGateway,
    gatewayKind: resolveAnthropicGatewayKind(),
    host,
  };
}

/** Headers for Anthropic Messages (and gateway-compatible surfaces). */
export function anthropicRequestHeaders(
  apiKey: string,
  viaGateway: boolean,
  gatewayKind: AnthropicGatewayKind = viaGateway ? 'gateway' : 'anthropic',
): Record<string, string> {
  if (gatewayKind === 'openrouter') {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
    const referer = siteOriginFallback();
    if (referer && !/localhost/i.test(referer)) {
      headers['HTTP-Referer'] = referer;
    }
    const title = serverEnv('OPENROUTER_APP_NAME')?.trim() || serverEnv('COMPANY_NAME')?.trim();
    if (title) headers['X-Title'] = title;
    return headers;
  }

  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  // OmniRoute and other gateways accept Bearer; also accepts x-api-key.
  if (viaGateway) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}
