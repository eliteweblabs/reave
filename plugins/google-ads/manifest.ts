import type { ReavePlugin } from '../_shared/types';
import { googleAdsAgentTools } from './agentTools';

export const googleAdsPlugin: ReavePlugin = {
  id: 'google-ads',
  feature: 'google_ads',
  agentTools: googleAdsAgentTools,
};
