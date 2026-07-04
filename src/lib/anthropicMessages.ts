import { serverEnv } from './serverEnv';

export type AnthropicCacheControl = { type: 'ephemeral'; ttl?: '5m' | '1h' };

export const ANTHROPIC_PROMPT_CACHE: AnthropicCacheControl = { type: 'ephemeral' };

export type AnthropicUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
};

export type AnthropicMessagesResponse = {
  stop_reason?: string;
  content?: unknown[];
  usage?: AnthropicUsage;
};

export function anthropicApiHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
}

/** Mark the last tool so the full tools array prefix is cached. */
export function withToolPromptCaching<T extends Record<string, unknown>>(
  tools: T[],
): Array<T & { cache_control?: AnthropicCacheControl }> {
  if (!tools.length) return tools;
  return tools.map((tool, i) =>
    i === tools.length - 1 ? { ...tool, cache_control: ANTHROPIC_PROMPT_CACHE } : tool,
  );
}

/**
 * Static instructions (cached) plus an optional dynamic suffix that must not
 * be cached — e.g. current date/time that changes every request.
 */
export function cachedSystemBlocks(
  staticText: string,
  dynamicSuffix?: string,
): Array<{ type: 'text'; text: string; cache_control?: AnthropicCacheControl }> {
  const blocks: Array<{ type: 'text'; text: string; cache_control?: AnthropicCacheControl }> = [
    { type: 'text', text: staticText, cache_control: ANTHROPIC_PROMPT_CACHE },
  ];
  const tail = dynamicSuffix?.trim();
  if (tail) blocks.push({ type: 'text', text: tail });
  return blocks;
}

function logPromptCacheUsage(usage?: AnthropicUsage): void {
  if (!usage) return;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  if (read > 0 || write > 0) {
    console.info('[anthropic] prompt cache', {
      read,
      write,
      input: usage.input_tokens ?? 0,
    });
  }
}

export async function createAnthropicMessage(
  body: Record<string, unknown>,
): Promise<
  { ok: true; data: AnthropicMessagesResponse } | { ok: false; status: number; text: string }
> {
  const apiKey = serverEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { ok: false, status: 0, text: 'ANTHROPIC_API_KEY not set' };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicApiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, text: await res.text().catch(() => res.statusText) };
  }

  const data = (await res.json()) as AnthropicMessagesResponse;
  logPromptCacheUsage(data.usage);
  return { ok: true, data };
}
