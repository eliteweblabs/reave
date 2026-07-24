import { namecomDnsModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const namecomDnsPlugin: ReavePlugin = {
  id: 'namecom-dns',
  feature: 'namecom_dns',
  agentTools: namecomDnsModule,
};
