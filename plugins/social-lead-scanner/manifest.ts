import type { ReavePlugin } from '../_shared/types';
import { socialLeadScannerAgentTools } from './agentTools';

export const socialLeadScannerPlugin: ReavePlugin = {
  id: 'social-lead-scanner',
  feature: 'social_lead_scanner',
  agentTools: socialLeadScannerAgentTools,
};
