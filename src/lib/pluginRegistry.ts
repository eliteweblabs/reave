/**
 * Registry of self-contained plugins under plugins/{id}/.
 *
 * Each plugin owns its knowledge/ and optional agentTools.ts.
 * Reave core never duplicates plugin playbooks in src/knowledge/.
 */
import type { ReavePlugin } from '../../plugins/_shared/types';
import type { AgentToolModule } from './agentTools/types';
import { hasFeature } from './features';

import { billingPlugin } from '../../plugins/billing/manifest';
import { carddavPlugin } from '../../plugins/carddav/manifest';
import { clientPortalPlugin } from '../../plugins/client-portal/manifest';
import { codeDevPlugin } from '../../plugins/code-dev/manifest';
import { devInfraPlugin } from '../../plugins/dev-infra/manifest';
import { emailMarketingPlugin } from '../../plugins/email-marketing/manifest';
import { schedulingPlugin } from '../../plugins/scheduling/manifest';
import { siteAuditsPlugin } from '../../plugins/site-audits/manifest';
import { siteMonitoringPlugin } from '../../plugins/site-monitoring/manifest';
import { uptimeMonitoringPlugin } from '../../plugins/uptime-monitoring/manifest';
import { vapiPlugin } from '../../plugins/vapi/manifest';
import { fleetPlugin } from '../../plugins/fleet/manifest';
import { paulinoWizardPlugin } from '../../plugins/paulino-wizard/manifest';

export const REAVE_PLUGINS: ReavePlugin[] = [
  billingPlugin,
  carddavPlugin,
  clientPortalPlugin,
  codeDevPlugin,
  devInfraPlugin,
  emailMarketingPlugin,
  schedulingPlugin,
  siteAuditsPlugin,
  siteMonitoringPlugin,
  uptimeMonitoringPlugin,
  vapiPlugin,
  fleetPlugin,
  paulinoWizardPlugin,
];

const PLUGIN_BY_ID = new Map(REAVE_PLUGINS.map((p) => [p.id, p]));

export function getPlugin(id: string): ReavePlugin | undefined {
  return PLUGIN_BY_ID.get(id);
}

export function isPluginActive(plugin: ReavePlugin): boolean {
  if (!hasFeature(plugin.feature)) return false;
  if (plugin.configured && !plugin.configured()) return false;
  return true;
}

/** Plugin-owned knowledge is visible only when the plugin is active. */
export function isPluginKnowledgeActive(pluginId: string): boolean {
  const plugin = getPlugin(pluginId);
  if (!plugin) return false;
  return isPluginActive(plugin);
}

export function activeAgentToolModules(): AgentToolModule[] {
  return REAVE_PLUGINS.filter(isPluginActive)
    .map((p) => p.agentTools)
    .filter((m): m is AgentToolModule => !!m);
}

/** Whether bundled/DB slug is visible for this install (plugin-gated docs). */
export function isKnowledgeSlugAvailable(slug: string): boolean {
  for (const plugin of REAVE_PLUGINS) {
    if (pluginKnowledgeSlugs(plugin.id).includes(slug)) {
      return isPluginActive(plugin);
    }
  }
  return true;
}

/** Whether a slug is a shipped product playbook (core or active plugin) vs custom/business. */
export function isDefaultKnowledgeSlug(slug: string): boolean {
  if (CORE_DEFAULT_SLUGS.has(slug)) return true;
  for (const plugin of REAVE_PLUGINS) {
    if (!isPluginActive(plugin)) continue;
    if (pluginKnowledgeSlugs(plugin.id).includes(slug)) return true;
  }
  return false;
}

/** Core product playbooks — always in src/knowledge/, never in plugins/. */
export const CORE_DEFAULT_SLUGS: ReadonlySet<string> = new Set([
  'contact-api-reference',
  'materials-api-reference',
  'paulino-wizard-reference',
  'contact-import',
  'email-rules',
  'siri-examples',
  'siri-quick-reference',
  'siri-shortcuts',
]);

/** @deprecated Prefer isDefaultKnowledgeSlug — core slugs only */
export const DEFAULT_KNOWLEDGE_SLUGS = CORE_DEFAULT_SLUGS;

/**
 * Known slugs bundled under plugins/{id}/knowledge/ (top-level .md only).
 * Install-scoped plugin docs use the same slug rules as core install knowledge.
 */
export function pluginKnowledgeSlugs(pluginId: string): string[] {
  switch (pluginId) {
    case 'billing':
      return ['crater-billing'];
    case 'carddav':
      return ['carddav'];
    case 'client-portal':
      return ['client-portal'];
    case 'dev-infra':
      return ['github-dev-tools', 'kinsta-wordpress', 'railway-deploy-webhook'];
    case 'email-marketing':
      return ['newsletter'];
    case 'uptime-monitoring':
      return ['uptime-monitoring'];
    case 'fleet':
      return ['fleet-tracking'];
    case 'paulino-wizard':
      return ['paulino-wizard'];
    case 'code-dev':
      return ['code-dev-tools'];
    case 'siteAudits':
      return ['inquiry-website-audit'];
    default:
      return [];
  }
}
