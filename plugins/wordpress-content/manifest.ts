import { wordpressContentAgentTools } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

/**
 * WordPress™ Connect — requestable add-on. PHP lives in
 * https://github.com/eliteweblabs/reave-connect
 */
export const wordpressContentPlugin: ReavePlugin = {
  id: 'wordpress-content',
  feature: 'wordpress_content',
  agentTools: wordpressContentAgentTools,
};
