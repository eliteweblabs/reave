import { vapiModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const vapiPlugin: ReavePlugin = {
  id: 'vapi',
  feature: 'vapi',
  agentTools: vapiModule,
};
