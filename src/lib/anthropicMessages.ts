import { serverEnv } from './serverEnv';
import { renderButton } from './chatResponseRenderer';
import { getAgentContext } from './agentContext';
import { isSleepModeActive } from './pushQuietHours';
import {
  anthropicRequestHeaders,
  resolveAnthropicEndpoint,
} from './anthropicEndpoint';

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

const LOW_CREDIT_BALANCE_RE = /credit balance is too low/i;

/**
 * Turn a failed Anthropic API response into chat-friendly text. The "credit
 * balance is too low" error is common (prepaid credits ran out) and useless
 * as raw JSON, so swap it for a plain message plus a button straight to the
 * billing page instead of the generic `Anthropic error (400): {...}` dump.
 */
export function formatAnthropicApiError(status: number, text: string): string {
  if (LOW_CREDIT_BALANCE_RE.test(text)) {
    return [
      "Your Anthropic API credit balance is too low, so the agent can't respond right now.",
      renderButton('Add Anthropic credits', 'https://console.anthropic.com/settings/billing'),
    ].join('\n\n');
  }
  return `Anthropic error (${status}): ${text.slice(0, 500)}`;
}

/**
 * Largest `max_tokens` each model actually accepts, learned from the API rather
 * than hardcoded.
 *
 * The agent needs a big output budget because a `write_file` call carries the
 * entire file body in its arguments, and those count as output tokens — too small
 * a budget truncates the call mid-argument and nothing gets written. But the real
 * ceiling differs per model and changes as Anthropic ships new ones, so instead
 * of guessing we ask for what we want and let a rejection teach us the limit.
 */
const learnedOutputCaps = new Map<string, number>();

/** e.g. "max_tokens: 32000 > 8192, which is the maximum allowed…" */
const MAX_TOKENS_LIMIT_RE = /max_tokens:\s*\d+\s*>\s*(\d+)/i;
const MAX_TOKENS_LIMIT_FALLBACK_RE =
  /maximum allowed number of output tokens[^0-9]{0,40}(\d{3,7})/i;

function modelOf(body: Record<string, unknown>): string {
  return typeof body.model === 'string' ? body.model : '';
}

/** Clamp `max_tokens` to this model's known ceiling before sending. */
function withLearnedOutputCap(body: Record<string, unknown>): Record<string, unknown> {
  const cap = learnedOutputCaps.get(modelOf(body));
  const requested = typeof body.max_tokens === 'number' ? body.max_tokens : 0;
  if (!cap || !requested || requested <= cap) return body;
  return { ...body, max_tokens: cap };
}

/**
 * Record the ceiling named in a rejection and report the value to retry with,
 * or null when this was not a max_tokens problem.
 */
function learnOutputCapFromError(
  body: Record<string, unknown>,
  status: number,
  text: string,
): number | null {
  if (status !== 400) return null;
  const match = MAX_TOKENS_LIMIT_RE.exec(text) ?? MAX_TOKENS_LIMIT_FALLBACK_RE.exec(text);
  const limit = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(limit) || limit < 1024) return null;
  const model = modelOf(body);
  const requested = typeof body.max_tokens === 'number' ? body.max_tokens : 0;
  if (requested && limit >= requested) return null;
  learnedOutputCaps.set(model, limit);
  console.info('[anthropic] learned max output tokens', { model, limit });
  return limit;
}

/** Internals exercised by scripts/verify-chat-resilience.ts. */
export const __testables = { learnOutputCapFromError, withLearnedOutputCap };

export function anthropicApiHeaders(apiKey: string): Record<string, string> {
  return anthropicRequestHeaders(apiKey, false);
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

function missingKeyMessage(): string {
  if (serverEnv('ANTHROPIC_BASE_URL')?.trim() || serverEnv('OMNIROUTE_BASE_URL')?.trim()) {
    return 'LLM gateway key not set (OMNIROUTE_API_KEY / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY)';
  }
  return 'ANTHROPIC_API_KEY not set';
}

export async function createAnthropicMessage(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<
  { ok: true; data: AnthropicMessagesResponse } | { ok: false; status: number; text: string }
> {
  const endpoint = resolveAnthropicEndpoint();
  if (!endpoint) {
    return { ok: false, status: 0, text: missingKeyMessage() };
  }
  if ((await isSleepModeActive()) && !getAgentContext().bypassSleepMode) {
    return { ok: false, status: 0, text: 'sleep_mode' };
  }

  const send = (payload: Record<string, unknown>) =>
    fetch(endpoint.messagesUrl, {
      method: 'POST',
      headers: anthropicRequestHeaders(endpoint.apiKey, endpoint.viaGateway),
      body: JSON.stringify(payload),
      signal,
    });

  let payload = withLearnedOutputCap(body);
  let res = await send(payload);

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const retryMax = learnOutputCapFromError(payload, res.status, text);
    if (retryMax == null) return { ok: false, status: res.status, text };
    payload = { ...payload, max_tokens: retryMax };
    res = await send(payload);
    if (!res.ok) {
      return { ok: false, status: res.status, text: await res.text().catch(() => res.statusText) };
    }
  }

  const data = (await res.json()) as AnthropicMessagesResponse;
  logPromptCacheUsage(data.usage);
  return { ok: true, data };
}

type AnthropicStreamResult = {
  stop_reason?: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  usage?: AnthropicUsage;
};

function parseAnthropicSseBlock(block: string): Record<string, unknown> | null {
  const dataLine = block
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim();
  if (!dataLine || dataLine === '[DONE]') return null;
  try {
    return JSON.parse(dataLine) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Stream a single Anthropic message turn. Yields cumulative assistant text as it arrives.
 * Returns structured content (text and/or tool_use blocks) when the stream completes.
 */
export async function streamAnthropicMessage(
  body: Record<string, unknown>,
  opts: {
    signal?: AbortSignal;
    onText?: (text: string) => void;
  } = {},
): Promise<
  { ok: true; data: AnthropicStreamResult } | { ok: false; status: number; text: string }
> {
  const endpoint = resolveAnthropicEndpoint();
  if (!endpoint) {
    return { ok: false, status: 0, text: missingKeyMessage() };
  }
  if ((await isSleepModeActive()) && !getAgentContext().bypassSleepMode) {
    return { ok: false, status: 0, text: 'sleep_mode' };
  }

  const send = (payload: Record<string, unknown>) =>
    fetch(endpoint.messagesUrl, {
      method: 'POST',
      headers: anthropicRequestHeaders(endpoint.apiKey, endpoint.viaGateway),
      body: JSON.stringify({ ...payload, stream: true }),
      signal: opts.signal,
    });

  let payload = withLearnedOutputCap(body);
  let res = await send(payload);

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const retryMax = learnOutputCapFromError(payload, res.status, text);
    if (retryMax == null) return { ok: false, status: res.status, text };
    payload = { ...payload, max_tokens: retryMax };
    res = await send(payload);
    if (!res.ok) {
      return { ok: false, status: res.status, text: await res.text().catch(() => res.statusText) };
    }
  }
  if (!res.body) {
    return { ok: false, status: 0, text: 'Empty stream body' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason: string | undefined;
  let streamUsage: AnthropicUsage | undefined;
  const textBlocks = new Map<number, string>();
  const toolBlocks = new Map<
    number,
    { id: string; name: string; inputJson: string }
  >();

  const emitText = () => {
    const text = [...textBlocks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value)
      .join('');
    opts.onText?.(text);
  };

  try {
    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException('Anthropic stream aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const payload = parseAnthropicSseBlock(block.trim());
        if (!payload) continue;
        const type = String(payload.type ?? '');

        if (type === 'message_delta') {
          const delta = payload.delta as { stop_reason?: string } | undefined;
          if (delta?.stop_reason) stopReason = delta.stop_reason;
          const usage = payload.usage as AnthropicUsage | undefined;
          if (usage) streamUsage = usage;
        }

        if (type === 'message_start') {
          const usage = (payload.message as { usage?: AnthropicUsage } | undefined)?.usage;
          if (usage) streamUsage = usage;
        }

        if (type === 'content_block_start') {
          const index = Number(payload.index ?? 0);
          const contentBlock = payload.content_block as
            | { type?: string; id?: string; name?: string; text?: string }
            | undefined;
          if (contentBlock?.type === 'text') {
            textBlocks.set(index, contentBlock.text ?? '');
            emitText();
          } else if (contentBlock?.type === 'tool_use') {
            toolBlocks.set(index, {
              id: String(contentBlock.id ?? ''),
              name: String(contentBlock.name ?? ''),
              inputJson: '',
            });
          }
        }

        if (type === 'content_block_delta') {
          const index = Number(payload.index ?? 0);
          const delta = payload.delta as
            | { type?: string; text?: string; partial_json?: string }
            | undefined;
          if (delta?.type === 'text_delta') {
            textBlocks.set(index, (textBlocks.get(index) ?? '') + (delta.text ?? ''));
            emitText();
          } else if (delta?.type === 'input_json_delta') {
            const tool = toolBlocks.get(index);
            if (tool) tool.inputJson += delta.partial_json ?? '';
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const content: AnthropicStreamResult['content'] = [];
  const indices = new Set([...textBlocks.keys(), ...toolBlocks.keys()]);
  for (const index of [...indices].sort((a, b) => a - b)) {
    if (textBlocks.has(index)) {
      content.push({ type: 'text', text: textBlocks.get(index) ?? '' });
    }
    if (toolBlocks.has(index)) {
      const tool = toolBlocks.get(index)!;
      let input: Record<string, unknown> = {};
      if (tool.inputJson.trim()) {
        try {
          input = JSON.parse(tool.inputJson) as Record<string, unknown>;
        } catch {
          input = {};
        }
      }
      content.push({ type: 'tool_use', id: tool.id, name: tool.name, input });
    }
  }

  if (streamUsage) logPromptCacheUsage(streamUsage);

  return { ok: true, data: { stop_reason: stopReason, content, usage: streamUsage } };
}
