/**
 * Railway project + service provisioning tools — surfaced as a CORE module
 * (always loaded when RAILWAY_API_TOKEN is set) so they appear in every chat
 * session regardless of the dev_infra feature flag or tool-manifest limits.
 *
 * Handlers delegate to railwayAgentTools.ts which already exports them.
 */
import { isRailwayConfigured } from '../../railwayClient';
import { railwayAgentToolDefinitions, railwayAgentToolHandlers } from '../../../../plugins/dev-infra/railwayAgentTools';
import type { AgentToolModule, ToolContext } from '../types';

export const railwayProvisionModule: AgentToolModule = {
  id: 'railway-provision',
  enabled: () => isRailwayConfigured(),
  definitions: (ctx: ToolContext) => railwayAgentToolDefinitions(ctx),
  handlers: railwayAgentToolHandlers,
};
