import { createRealEstateDataModule, isRealEstateDataConfigured } from '@reave/plugin-real-estate-data';
import { hasFeature } from '../../src/lib/features';
import { getViolationServiceAreaConfig } from '../../src/lib/violationsContext';
import type { ReavePlugin } from '../_shared/types';

export const realEstateDataPlugin: ReavePlugin = {
  id: 'real-estate-data',
  feature: 'real_estate_data',
  configured: isRealEstateDataConfigured,
  agentTools: createRealEstateDataModule({
    hasFeature: (id) => hasFeature(id as Parameters<typeof hasFeature>[0]),
    getViolationServiceArea: getViolationServiceAreaConfig,
  }),
};
