import { realEstateDataModule } from './agentTools.js';
import { isRealEstateDataConfigured } from './lib/config.js';
import type { ReavePlugin } from './lib/types.js';
import { DEFAULT_FEATURE_ID } from './lib/types.js';

export const realEstateDataPlugin: ReavePlugin = {
  id: 'real-estate-data',
  feature: DEFAULT_FEATURE_ID,
  configured: isRealEstateDataConfigured,
  agentTools: realEstateDataModule,
};

export default realEstateDataPlugin;
