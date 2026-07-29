/**
 * Agent tool modules — core (always-on) + self-contained plugins.
 */
import { knowledgeModule } from './core/knowledge';
import { workModule } from './core/work';
import { emailInboxModule } from './core/emailInbox';
import { todosModule } from './core/todos';
import { contactsModule } from './core/contacts';
import { outboundModule } from './core/outbound';
import { techStackModule } from './core/techStack';
import { playwrightAuditModule } from './core/playwrightAudit';
import { pexelsModule } from './core/pexels';
import { activeAgentToolModules } from '../pluginRegistry';
import type { AgentToolModule } from './types';

/**
 * Core tools + plugin agentTools (from plugins/{id}/agentTools.ts via manifest).
 *
 * Name.com DNS management lives in `plugins/namecom-dns/` (feature-gated,
 * `namecom_dns`) — it is NOT a core module. Deployments that don't need DNS
 * record management (most installs) simply omit the feature.
 *
 * Playwright UX/UI audit runs real headless Chromium — desktop + mobile nav,
 * JS errors, overflow, tap targets, CTAs, forms, and screenshots.
 *
 * Pexels stock photo search is feature-gated by PEXELS_API_KEY presence —
 * the tool is omitted from definitions when the key is not configured.
 */
export const AGENT_TOOL_MODULES: AgentToolModule[] = [
  knowledgeModule,
  workModule,
  emailInboxModule,
  todosModule,
  contactsModule,
  outboundModule,
  techStackModule,
  playwrightAuditModule,
  pexelsModule,
  ...activeAgentToolModules(),
];
