import { contentManagementModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';
import { isGithubConfigured } from '../../src/lib/githubClient';

export const contentManagementPlugin: ReavePlugin = {
  id: 'content-management',
  feature: 'content_management',
  configured: () => isGithubConfigured(),
  agentTools: contentManagementModule,
};
