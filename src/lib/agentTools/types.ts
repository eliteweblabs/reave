import type { CompanyBrandContext } from '../companyConfig';

export type AgentToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolContext = { brand: CompanyBrandContext };

export type ToolHandler = (_args: Record<string, unknown>, _ctx: ToolContext) => Promise<string>;

export type AgentToolModule = {
  id: string;
  enabled: (ctx: ToolContext) => boolean;
  definitions: (ctx: ToolContext) => AgentToolDef[];
  handlers: Record<string, ToolHandler>;
};
