import { isFleetApiConfigured } from '../../src/lib/fleetClient';
import { fleetModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const fleetPlugin: ReavePlugin = {
  id: 'fleet',
  feature: 'fleet_tracking',
  configured: isFleetApiConfigured,
  agentTools: fleetModule,
};
