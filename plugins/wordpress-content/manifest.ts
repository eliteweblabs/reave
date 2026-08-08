import type { ReavePlugin } from '../_shared/types';

/**
 * Marketing + playbook stub — companion WordPress plugin (external) will
 * expose content APIs; agent tools land here when the plugin API is ready.
 */
export const wordpressContentPlugin: ReavePlugin = {
  id: 'wordpress-content',
  feature: 'wordpress_content',
};
