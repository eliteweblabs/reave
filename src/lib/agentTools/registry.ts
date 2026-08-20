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
import { chatsModule } from './core/chats';
import { sshModule } from './core/ssh';
import { wpModule } from './core/wp';
import { deployResumeModule } from './core/deployResume';
import { railwayModule } from './core/railway';
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
 * Pexels stock photo search lives in `plugins/stock-photos/` (feature-gated
 * `stock_photos` + `PEXELS_API_KEY`).
 *
 * Chat management tools (list, get, archive, unarchive, rename, delete, search)
 * live in `core/chats.ts` — always-on when DATABASE_URL is configured.
 *
 * SSH remote execution (`exec_ssh`) lives in `core/ssh.ts` — enabled when
 * KINSTA_SSH_HOST + KINSTA_SSH_USER + KINSTA_SSH_PRIVATE_KEY are set. Used
 * for WP-CLI commands on Kinsta WordPress environments.
 *
 * WordPress remote management (`exec_wp`) lives in `core/wp.ts` — enabled when
 * REAVE_WP_API_KEY is set. Calls the reave-connect plugin REST API across all
 * managed WordPress sites with a single shared API key. Supports enable/disable
 * indexing, install/activate plugins, flush cache, update options, and more.
 * Plugin auto-updates from https://reave.app/api/wp-update/reave-connect/
 *
 * Deploy resume (`set_deploy_resume` / `clear_deploy_resume`) lives in
 * `core/deployResume.ts` — always-on when DATABASE_URL is configured. Lets the
 * agent register a continuation message that fires automatically when the next
 * Railway deploy-success webhook lands, so mid-task workflows (e.g. fix a
 * Crater line item after the Crater deploy) resume without owner intervention.
 *
 * Railway tools (`list_railway_registered_domains`) live in `core/railway.ts` —
 * always-on when RAILWAY_API_TOKEN is set. Allows querying Railway-purchased domains.
 */
const CORE_AGENT_TOOL_MODULES: AgentToolModule[] = [
  knowledgeModule,
  workModule,
  emailInboxModule,
  todosModule,
  contactsModule,
  outboundModule,
  techStackModule,
  playwrightAuditModule,
  chatsModule,
  sshModule,
  wpModule,
  deployResumeModule,
  railwayModule,
];

/** Lazy — plugin manifests import localKnowledge, which imports pluginRegistry (TDZ if eager). */
let cachedAgentToolModules: AgentToolModule[] | null = null;

export function getAgentToolModules(): AgentToolModule[] {
  if (!cachedAgentToolModules) {
    cachedAgentToolModules = [...CORE_AGENT_TOOL_MODULES, ...activeAgentToolModules()];
  }
  return cachedAgentToolModules;
}
