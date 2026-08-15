import type { ReavePlugin } from '../_shared/types';
import { emailMarketingAgentTools } from './agentTools';

/** Newsletter & email marketing — templates, automations, scheduled sends. */
export const emailMarketingPlugin: ReavePlugin = {
  id: 'email-marketing',
  feature: 'email_marketing',
  agentTools: emailMarketingAgentTools,
};
