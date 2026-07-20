import { isContactApiConfigured } from '../../src/lib/contactApi';
import { clientPortalModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const clientPortalPlugin: ReavePlugin = {
  id: 'client-portal',
  feature: 'client_portal',
  configured: isContactApiConfigured,
  agentTools: clientPortalModule,
};
