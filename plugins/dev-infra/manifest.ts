import { devInfraModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const devInfraPlugin: ReavePlugin = {
  id: 'dev-infra',
  feature: 'dev_infra',
  agentTools: devInfraModule,
};
