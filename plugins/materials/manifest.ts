import { isMaterialsApiConfigured } from '../../src/lib/materialsClient';
import { materialsModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const materialsPlugin: ReavePlugin = {
  id: 'materials',
  feature: 'materials_pricing',
  configured: isMaterialsApiConfigured,
  agentTools: materialsModule,
};
