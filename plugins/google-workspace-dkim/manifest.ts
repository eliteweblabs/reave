import type { ReavePlugin } from '../_shared/types';
import { gmailDkimAgentTools } from './agentTools';
import { isGoogleWebmasterOAuthConfigured } from '../../src/lib/googleWebmasterAuth';

export const googleWorkspaceDkimPlugin: ReavePlugin = {
  id: 'google-workspace-dkim',
  feature: 'google_workspace',
  configured: isGoogleWebmasterOAuthConfigured,
  agentTools: gmailDkimAgentTools,
};
