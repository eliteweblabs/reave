import { isDemoMode } from '../../src/lib/demoMode';
import { demoModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const demoPlugin: ReavePlugin = {
  id: 'demo',
  feature: 'demo',
  configured: isDemoMode,
  agentTools: demoModule,
};
