import { wordpressContentAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

/**
 * WordPress companion plugin (Reave Connect) — posts, pages, and media
 * plus site ops via exec_wp. Tools require REAVE_WP_API_KEY at runtime.
 */
export const wordpressContentPlugin: ReavePlugin = {
  id: 'wordpress-content',
  feature: 'wordpress_content',
  agentTools: wordpressContentAgentTools,
};
