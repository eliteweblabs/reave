import type { ReavePlugin } from '../_shared/types';
import { googleBusinessProfileAgentTools } from './agentTools';
import { isGoogleBusinessProfileOAuthConfigured } from '../../src/lib/googleBusinessProfileAuth';

export const googleBusinessProfilePlugin: ReavePlugin = {
  id: 'google-business-profile',
  feature: 'google_workspace',
  configured: isGoogleBusinessProfileOAuthConfigured,
  agentTools: googleBusinessProfileAgentTools,
};
