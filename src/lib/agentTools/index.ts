/** Admin agent tools — core + feature-gated plugins. */
import { defaultBrandContext, getCompanyBrandContext, type CompanyBrandContext } from '../companyConfig';
import { agentToolTimeoutMs, guardToolCall } from '../agentWatchdog';
import { hasFeature, hasWebsiteEditor } from '../features';
import { createLogger } from '../logger';
import { getAgentToolModules } from './registry';
import type { AgentToolDef, AgentToolModule, ToolContext } from './types';

export type { AgentToolDef } from './types';

const log = createLogger('agentTools');

function collectModuleToolDefs(module: AgentToolModule, ctx: ToolContext): AgentToolDef[] {
  let raw: AgentToolDef[];
  try {
    raw = module.definitions(ctx);
  } catch (err) {
    log.error(`${module.id} definitions() threw — tools from this module omitted`, err);
    return [];
  }
  if (!Array.isArray(raw)) {
    log.error(`${module.id} definitions() did not return an array`, { type: typeof raw });
    return [];
  }

  const out: AgentToolDef[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const name = t?.function?.name;
    if (!name) {
      log.error('skipping malformed tool definition', { module: module.id, index: i, tool: t });
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Installs with website editor or dev_infra (without editor) must expose GitHub write tools. */
function shouldExposeWriteGithubFile(): boolean {
  if (hasWebsiteEditor()) return true;
  return hasFeature('dev_infra');
}

export function buildTools(brand: CompanyBrandContext = defaultBrandContext()): AgentToolDef[] {
  const ctx: ToolContext = { brand };
  const tools: AgentToolDef[] = [];
  for (const mod of getAgentToolModules()) {
    if (!mod.enabled(ctx)) continue;
    tools.push(...collectModuleToolDefs(mod, ctx));
  }

  if (shouldExposeWriteGithubFile() && !tools.some((t) => t.function.name === 'write_github_file')) {
    log.error('write_github_file missing from buildTools() — GitHub publish module failed to register');
  }

  return tools;
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
  for (const mod of getAgentToolModules()) {
    if (!mod.enabled(ctx)) continue;
    const handler = mod.handlers[name];
    // Awaited (not returned) so a rejecting handler is caught by runTool's
    // wrapper rather than escaping as a rejected promise and failing the run.
    if (handler) return await handler(args, ctx);
  }
  return JSON.stringify({ error: `unknown tool ${name}` });
}
