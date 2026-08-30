import type { ReavePlugin } from '../_shared/types';
import { isSmsSendConfigured } from '../../src/lib/outbound';

/** Two-way SMS via Telnyx — knowledge + deploy playbook. */
export const smsPlugin: ReavePlugin = {
  id: 'sms',
  feature: 'sms',
  configured: isSmsSendConfigured,
};
