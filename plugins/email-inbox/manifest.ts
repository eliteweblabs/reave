import type { ReavePlugin } from '../_shared/types';
import { isEmailSendConfigured } from '../../src/lib/outbound';

/** Inbound triage + admin Inbox tab (Resend receiving). */
export const emailInboxPlugin: ReavePlugin = {
  id: 'email-inbox',
  feature: 'email_inbox',
  configured: isEmailSendConfigured,
};
