import type { ReavePlugin } from '../_shared/types';

/** Super-admin Railway install wizard — enable only on the official reΛVe.app. */
export const deployWizardPlugin: ReavePlugin = {
  id: 'deploy-wizard',
  feature: 'deploy_wizard',
};
