import { seoDirectoryAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const seoDirectoryPlugin: ReavePlugin = {
  id: 'seo-directory',
  feature: 'seo_directory',
  // Do not gate the whole plugin on BRIGHTLOCAL_API_KEY — knowledge stays
  // available while the kit is in development; tools report unconfigured status.
  agentTools: seoDirectoryAgentTools,
};
