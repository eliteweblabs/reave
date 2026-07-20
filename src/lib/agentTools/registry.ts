/**
 * Agent tool modules — core (always-on) + self-contained plugins.
 */
import { knowledgeModule } from './core/knowledge';
import { workModule } from './core/work';
import { emailInboxModule } from './core/emailInbox';
import { todosModule } from './core/todos';
import { contactsModule } from './core/contacts';
import { outboundModule } from './core/outbound';
import { activeAgentToolModules } from '../pluginRegistry';
import type { AgentToolModule } from './types';

/** Core tools + plugin agentTools (from plugins/{id}/agentTools.ts via manifest). */
export const AGENT_TOOL_MODULES: AgentToolModule[] = [
  knowledgeModule,
  workModule,
  emailInboxModule,
  todosModule,
  contactsModule,
  outboundModule,
  ...activeAgentToolModules(),
];
