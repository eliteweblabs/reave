import type { ReavePlugin } from '../_shared/types';
import { isEmailSendConfigured } from '../../src/lib/outbound';

/** Inbound auto-reply drafts — owner approves every send (paid add-on). */
export const autoEmailResponsePlugin: ReavePlugin = {
  id: 'auto-email-response',
  feature: 'auto_email_response',
  configured: isEmailSendConfigured,
};
