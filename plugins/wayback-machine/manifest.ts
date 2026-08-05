import { waybackMachineAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const waybackMachinePlugin: ReavePlugin = {
  id: 'wayback-machine',
  feature: 'wayback_machine',
  agentTools: waybackMachineAgentTools,
};
