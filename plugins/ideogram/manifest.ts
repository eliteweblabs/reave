import { isIdeogramConfigured } from '../../src/lib/ideogramClient';
import { ideogramAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const ideogramPlugin: ReavePlugin = {
  id: 'ideogram',
  feature: 'ideogram',
  configured: isIdeogramConfigured,
  agentTools: ideogramAgentTools,
};
