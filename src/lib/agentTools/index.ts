/** Admin agent tools — core + feature-gated plugins. */
import { defaultBrandContext, getCompanyBrandContext, type CompanyBrandContext } from '../companyConfig';
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

export async function runTool(name: string, argsJson: string): Promise<string> {
  const brand = await getCompanyBrandContext();
  const ctx: ToolContext = { brand };
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    for (const mod of AGENT_TOOL_MODULES) {
      if (!mod.enabled(ctx)) continue;
      const handler = mod.handlers[name];
      if (handler) return handler(args, ctx);
    }
    return JSON.stringify({ error: `unknown tool ${name}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: msg });
  }
}
