import type { ReavePlugin } from '../_shared/types';

/** Account-profile branded email signature — copy page + outbound append. */
export const emailSignaturePlugin: ReavePlugin = {
  id: 'email-signature',
  feature: 'email_signature',
};
