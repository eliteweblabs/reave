import { isBookingConfigured } from '../../src/lib/bookingClient';
import { schedulingModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const schedulingPlugin: ReavePlugin = {
  id: 'scheduling',
  feature: 'scheduling',
  configured: isBookingConfigured,
  agentTools: schedulingModule,
};
