import { namecomDnsModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

// No `configured` gate: credentials can be supplied per-call (client vault
// tokens) even when no global NAMECOM_USERNAME/NAMECOM_TOKEN env var is set.
export const namecomDnsPlugin: ReavePlugin = {
  id: 'namecom-dns',
  feature: 'namecom_dns',
  agentTools: namecomDnsModule,
};
