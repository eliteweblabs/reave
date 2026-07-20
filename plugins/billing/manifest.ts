import { isCraterConfigured } from '../../src/lib/craterClient';
import { billingModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const billingPlugin: ReavePlugin = {
  id: 'billing',
  feature: 'billing',
  configured: isCraterConfigured,
  agentTools: billingModule,
};
