import type { ReavePlugin } from '../_shared/types';
import { onlineReviewsAgentTools } from './agentTools';

export const onlineReviewsPlugin: ReavePlugin = {
  id: 'online-reviews',
  feature: 'online_reviews',
  agentTools: onlineReviewsAgentTools,
};
