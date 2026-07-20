import { isUptimeRobotConfigured } from '../../src/lib/uptimerobotClient';
import { uptimeModule } from './agentTools';
import type { ReavePlugin } from '../_shared/types';

export const uptimeMonitoringPlugin: ReavePlugin = {
  id: 'uptime-monitoring',
  feature: 'uptime_monitoring',
  configured: isUptimeRobotConfigured,
  agentTools: uptimeModule,
};
