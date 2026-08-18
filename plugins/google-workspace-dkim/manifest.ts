import type { ReavePlugin } from '../_shared/types';
import { gmailDkimAgentTools } from './agentTools';
import { isGoogleWebmasterOAuthConfigured } from '../../src/lib/googleWebmasterAuth';

export const googleWorkspaceDkimPlugin: ReavePlugin = {
  id: 'google-workspace-dkim',
  // No feature gate — active whenever Google OAuth is configured
  configured: isGoogleWebmasterOAuthConfigured,
  agentTools: gmailDkimAgentTools,
};
