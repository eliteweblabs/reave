import { hasWebsiteEditor } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';
import { githubPublishDefinitions, githubPublishHandlers } from './githubAgentTools';

export const contentManagementModule: AgentToolModule = {
  id: 'contentManagement',
  enabled: () => hasWebsiteEditor(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    return githubPublishDefinitions(ctx);
  },
  handlers: githubPublishHandlers,
};
