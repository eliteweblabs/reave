/**
 * Anthropic Messages endpoint resolution — direct Anthropic or OmniRoute gateway.
 *
 * OmniRoute accepts the Anthropic Messages API at `{base}/v1/messages`.
 * Set ANTHROPIC_BASE_URL (or OMNIROUTE_BASE_URL) to the gateway root with no `/v1`.
 * Prefer OMNIROUTE_API_KEY / ANTHROPIC_AUTH_TOKEN for the gateway key; fall back to
 * ANTHROPIC_API_KEY (sent as x-api-key, same as Claude Code).
 */
import { serverEnv } from './serverEnv';

export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export type AnthropicEndpoint = {
  /** Gateway or Anthropic root — no trailing slash, no `/v1`. */
  baseUrl: string;
  /** Full Messages URL. */
  messagesUrl: string;
  /** Credential for this hop (OmniRoute key or Anthropic key). */
  apiKey: string;
  /** True when traffic goes through a non-Anthropic base URL (typically OmniRoute). */
  viaGateway: boolean;
  /** Host label for status UI. */
  host: string;
};

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Resolve gateway root from env. Empty / unset → direct Anthropic. */
export function resolveAnthropicBaseUrl(): string {
  const raw =
    serverEnv('ANTHROPIC_BASE_URL')?.trim() ||
    serverEnv('OMNIROUTE_BASE_URL')?.trim() ||
    '';
  if (!raw) return DEFAULT_ANTHROPIC_BASE_URL;
  let url = trimSlash(raw);
  // Callers sometimes paste …/v1; Claude Code / OmniRoute want the root.
  if (url.toLowerCase().endsWith('/v1')) url = url.slice(0, -3);
  return trimSlash(url) || DEFAULT_ANTHROPIC_BASE_URL;
}

export function isAnthropicGatewayConfigured(): boolean {
  return resolveAnthropicBaseUrl() !== DEFAULT_ANTHROPIC_BASE_URL;
}

/**
 * Key used for the Messages hop.
 * When a gateway base URL is set, prefer OmniRoute / auth-token keys.
 */
export function resolveAnthropicApiKey(): string | undefined {
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
  let host = 'api.anthropic.com';
  try {
    host = new URL(baseUrl).host || host;
  } catch {
    host = baseUrl;
  }
  return {
    baseUrl,
    messagesUrl: `${baseUrl}/v1/messages`,
    apiKey,
    viaGateway,
    host,
  };
}

/** Headers for Anthropic Messages (and OmniRoute’s Anthropic-compatible surface). */
export function anthropicRequestHeaders(apiKey: string, viaGateway: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  // OmniRoute prefers Bearer; also accepts x-api-key (v3.8+). Send both when gateway.
  if (viaGateway) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}
