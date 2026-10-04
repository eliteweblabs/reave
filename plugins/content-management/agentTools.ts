import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';
import { hasWebsiteGithubAgentTools } from '../../src/lib/websiteEditorRepo';
import { githubPublishDefinitions, githubPublishHandlers } from './githubAgentTools';

export const contentManagementModule: AgentToolModule = {
  id: 'contentManagement',
  enabled: () => hasWebsiteGithubAgentTools(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    return githubPublishDefinitions(ctx);
  },
  handlers: githubPublishHandlers,
};
