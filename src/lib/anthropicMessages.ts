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
  signal?: AbortSignal,
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
    signal,
  });

  if (!res.ok) {
    return { ok: false, status: res.status, text: await res.text().catch(() => res.statusText) };
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
  const apiKey = serverEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { ok: false, status: 0, text: 'ANTHROPIC_API_KEY not set' };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicApiHeaders(apiKey),
    body: JSON.stringify({ ...body, stream: true }),
    signal: opts.signal,
  });

  if (!res.ok) {
    return { ok: false, status: res.status, text: await res.text().catch(() => res.statusText) };
  }
  if (!res.body) {
    return { ok: false, status: 0, text: 'Empty stream body' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason: string | undefined;
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

  return { ok: true, data: { stop_reason: stopReason, content } };
}
