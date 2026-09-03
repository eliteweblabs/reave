import { isGaleneConfigured } from '../../src/lib/galeneClient';
import { meetModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const meetPlugin: ReavePlugin = {
  id: 'meet',
  feature: 'video_meet',
  configured: isGaleneConfigured,
  agentTools: meetModule,
};
