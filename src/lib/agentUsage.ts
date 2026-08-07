import type { AnthropicUsage } from './anthropicMessages';

/** Per-turn Anthropic usage, rolled up for one agent run (one user message → final reply). */
export type AgentUsageSummary = {
  model: string;
  model_label: string;
  rounds: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  /** Estimated API cost in USD from published list rates (approximate). */
  estimated_cost_usd: number;
};

export type AgentUsageAccumulator = {
  model: string;
  rounds: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-opus-4-8': 'Opus 4.8',
  'claude-opus-5': 'Opus 5',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-fable-5': 'Fable 5',
};

function labelForModel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

/** USD per 1M tokens — keep in sync with Anthropic list pricing for common agent models. */
const MODEL_RATES_USD_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-fable-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

const DEFAULT_RATES = MODEL_RATES_USD_PER_MTOK['claude-sonnet-4-6'];

export function createAgentUsageAccumulator(model: string): AgentUsageAccumulator {
  return {
    model,
    rounds: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

export function addAnthropicUsage(
  acc: AgentUsageAccumulator,
  usage?: AnthropicUsage | null,
): void {
  if (!usage) return;
  acc.rounds += 1;
  acc.input_tokens += usage.input_tokens ?? 0;
  acc.output_tokens += usage.output_tokens ?? 0;
  acc.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
}

export function estimateAgentCostUsd(acc: AgentUsageAccumulator): number {
  const rates = MODEL_RATES_USD_PER_MTOK[acc.model] ?? DEFAULT_RATES;
  const input = (acc.input_tokens / 1_000_000) * rates.input;
  const output = (acc.output_tokens / 1_000_000) * rates.output;
  const cacheRead = (acc.cache_read_input_tokens / 1_000_000) * rates.cacheRead;
  const cacheWrite = (acc.cache_creation_input_tokens / 1_000_000) * rates.cacheWrite;
  return input + output + cacheRead + cacheWrite;
}

export function finalizeAgentUsage(acc: AgentUsageAccumulator): AgentUsageSummary | null {
  if (acc.rounds <= 0) return null;
  const estimated_cost_usd = estimateAgentCostUsd(acc);
  return {
    model: acc.model,
    model_label: labelForModel(acc.model),
    rounds: acc.rounds,
    input_tokens: acc.input_tokens,
    output_tokens: acc.output_tokens,
    cache_read_input_tokens: acc.cache_read_input_tokens,
    cache_creation_input_tokens: acc.cache_creation_input_tokens,
    estimated_cost_usd: Math.round(estimated_cost_usd * 10_000) / 10_000,
  };
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Short line for chat UI footers. */
export function formatAgentUsageLine(usage: AgentUsageSummary): string {
  const totalIn =
    usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
  return (
    `$${usage.estimated_cost_usd.toFixed(2)} · ${usage.rounds} ${usage.rounds === 1 ? 'round' : 'rounds'} · ` +
    `${formatTokenCount(totalIn)} in / ${formatTokenCount(usage.output_tokens)} out`
  );
}

export function logAgentUsage(
  usage: AgentUsageSummary,
  ctx: { threadId?: string; userTextPreview?: string } = {},
): void {
  console.info('[agent] run usage', {
    ...usage,
    usage_line: formatAgentUsageLine(usage),
    thread_id: ctx.threadId,
    user_preview: ctx.userTextPreview?.slice(0, 120),
  });
}
