import type { ReavePlugin } from '../_shared/types';
import { analyticAuditAgentTools } from './agentTools';

export const analyticAuditPlugin: ReavePlugin = {
  id: 'analytic-audit',
  feature: 'analytic_audit',
  agentTools: analyticAuditAgentTools,
};
