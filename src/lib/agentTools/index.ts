/** Admin agent tools — core + feature-gated plugins. */
import { defaultBrandContext, getCompanyBrandContext, type CompanyBrandContext } from '../companyConfig';
import { agentToolTimeoutMs, guardToolCall } from '../agentWatchdog';
import { AGENT_TOOL_MODULES } from './registry';
import type { AgentToolDef, ToolContext } from './types';

export type { AgentToolDef } from './types';

export function buildTools(brand: CompanyBrandContext = defaultBrandContext()): AgentToolDef[] {
  const ctx: ToolContext = { brand };
  return AGENT_TOOL_MODULES.filter((m) => m.enabled(ctx)).flatMap((m) => m.definitions(ctx));
}

export function exportToolConfigJson(): string {
  return JSON.stringify(buildTools(), null, 2);
}

/**
 * Execute one tool call.
 *
 * Two guarantees, because the agent loop cannot make progress without a
 * `tool_result` for every `tool_use` block:
 *
 * 1. It always resolves to a string. A handler that throws (or whose promise
 *    rejects) becomes a JSON error the model can read and route around.
 * 2. It always resolves *eventually*. Every handler races a hard deadline, so a
 *    third-party API that accepts the connection and then never answers — the
 *    classic "Running Lighthouse audit…" that sits there forever — turns into a
 *    timeout result after a bounded wait instead of wedging the whole chat.
 */
export async function runTool(
  name: string,
  argsJson: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  return guardToolCall(name, opts.timeoutMs ?? agentToolTimeoutMs(name), () =>
    invokeTool(name, argsJson),
  );
}

async function invokeTool(name: string, argsJson: string): Promise<string> {
  const brand = await getCompanyBrandContext();
  const ctx: ToolContext = { brand };
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: `invalid tool arguments: ${msg}`, tool: name });
  }
  for (const mod of AGENT_TOOL_MODULES) {
    if (!mod.enabled(ctx)) continue;
    const handler = mod.handlers[name];
    // Awaited (not returned) so a rejecting handler is caught by runTool's
    // wrapper rather than escaping as a rejected promise and failing the run.
    if (handler) return await handler(args, ctx);
  }
  return JSON.stringify({ error: `unknown tool ${name}` });
}
