import { contentManagementModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

/** Agentic Website Editor — Git publish plus the site-copy playbook. */
export const contentManagementPlugin: ReavePlugin = {
  id: 'content-management',
  feature: 'content_management',
  agentTools: contentManagementModule,
};
