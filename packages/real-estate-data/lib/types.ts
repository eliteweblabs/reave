/**
 * Mirrored from Reave `plugins/_shared/types.ts` and `src/lib/agentTools/types.ts`.
 * Keep in sync when integrating as a git submodule or npm package under `plugins/real-estate-data/`.
 */

export type FeatureId = string;

export type AgentToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolContext = { brand?: Record<string, unknown> };

export type ToolHandler = (_args: Record<string, unknown>, _ctx: ToolContext) => Promise<string>;

export type AgentToolModule = {
  id: string;
  enabled: (ctx: ToolContext) => boolean;
  definitions: (ctx: ToolContext) => AgentToolDef[];
  handlers: Record<string, ToolHandler>;
};

export interface ReavePlugin {
  id: string;
  feature: FeatureId;
  configured?: () => boolean;
  agentTools?: AgentToolModule;
}

/** Minimal feature gate when running outside Reave core (tests, standalone). */
export type HasFeature = (id: FeatureId) => boolean;

export const DEFAULT_FEATURE_ID = 'real_estate_data';
