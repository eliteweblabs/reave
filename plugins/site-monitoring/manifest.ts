import { isChangeDetectionConfigured } from '../../src/lib/changedetectionClient';
import { siteMonitoringModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const siteMonitoringPlugin: ReavePlugin = {
  id: 'site-monitoring',
  feature: 'site_monitoring',
  configured: isChangeDetectionConfigured,
  agentTools: siteMonitoringModule,
};
