import { codeDevModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const codeDevPlugin: ReavePlugin = {
  id: 'code-dev',
  feature: 'code_dev',
  agentTools: codeDevModule,
};
