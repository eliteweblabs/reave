/**
 * Agent tool modules — core (always-on product tools) + plugins (install features).
 *
 * Each plugin mirrors an entry in config/config-{slug}.json `features` and only
 * loads when `enabled()` passes (feature flag + service env, e.g. Crater for billing).
 * Add a new plugin: create plugins/foo.ts, register here, add feature to features.ts.
 */
import { knowledgeModule } from './core/knowledge';
import { workModule } from './core/work';
import { emailInboxModule } from './core/emailInbox';
import { todosModule } from './core/todos';
import { contactsModule } from './core/contacts';
import { outboundModule } from './core/outbound';
import { clientPortalModule } from './plugins/clientPortal';
import { billingModule } from './plugins/billing';
import { siteAuditsModule } from './plugins/siteAudits';
import { siteMonitoringModule } from './plugins/siteMonitoring';
import { schedulingModule } from './plugins/scheduling';
import { uptimeModule } from './plugins/uptime';
import { vapiModule } from './plugins/vapi';
import { devInfraModule } from './plugins/devInfra';
import { codeDevModule } from './plugins/codeDev';
import type { AgentToolModule } from './types';

export const AGENT_TOOL_MODULES: AgentToolModule[] = [
  knowledgeModule,
  workModule,
  emailInboxModule,
  todosModule,
  contactsModule,
  outboundModule,
  clientPortalModule,
  billingModule,
  siteAuditsModule,
  siteMonitoringModule,
  schedulingModule,
  uptimeModule,
  vapiModule,
  devInfraModule,
  codeDevModule,
];
