import { isPexelsConfigured } from '../../src/lib/pexelsClient';
import { stockPhotosAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const stockPhotosPlugin: ReavePlugin = {
  id: 'stock-photos',
  feature: 'stock_photos',
  configured: isPexelsConfigured,
  agentTools: stockPhotosAgentTools,
};
