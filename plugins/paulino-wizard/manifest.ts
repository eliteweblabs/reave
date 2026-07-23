import { isPaulinoWizardConfigured } from '../../src/lib/paulinoWizardClient';
import { paulinoWizardModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const paulinoWizardPlugin: ReavePlugin = {
  id: 'paulino-wizard',
  feature: 'dealership_wizard',
  configured: isPaulinoWizardConfigured,
  agentTools: paulinoWizardModule,
};
