import { isInventoryApiConfigured } from '../../src/lib/inventoryClient';
import { inventoryModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const inventoryPlugin: ReavePlugin = {
  id: 'inventory',
  feature: 'inventory_sync',
  configured: isInventoryApiConfigured,
  agentTools: inventoryModule,
};
