import type { ReavePlugin } from '../_shared/types';

/** Marketing + agent playbook only — website edits use existing dev_infra / code_dev tools. */
export const contentManagementPlugin: ReavePlugin = {
  id: 'content-management',
  feature: 'content_management',
};
