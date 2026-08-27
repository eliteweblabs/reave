/**
 * Registry of self-contained plugins under plugins/{id}/.
 *
 * Each plugin owns its knowledge/ and optional agentTools.ts.
 * Reave core never duplicates plugin playbooks in src/knowledge/.
 */
import type { ReavePlugin } from '../../plugins/_shared/types';
import type { AgentToolModule } from './agentTools/types';
import { hasFeature, hasStockPhotoSearch, hasWebsiteEditor } from './features';
import { isCanonicalReaveInstall } from './installConfig';

import { billingPlugin } from '../../plugins/billing/manifest';
import { carddavPlugin } from '../../plugins/carddav/manifest';
import { clientPortalPlugin } from '../../plugins/client-portal/manifest';
import { codeDevPlugin } from '../../plugins/code-dev/manifest';
import { devInfraPlugin } from '../../plugins/dev-infra/manifest';
import { emailMarketingPlugin } from '../../plugins/email-marketing/manifest';
import { namecomDnsPlugin } from '../../plugins/namecom-dns/manifest';
import { schedulingPlugin } from '../../plugins/scheduling/manifest';
import { siteAuditsPlugin } from '../../plugins/site-audits/manifest';
import { analyticAuditPlugin } from '../../plugins/analytic-audit/manifest';
import { siteMonitoringPlugin } from '../../plugins/site-monitoring/manifest';
import { uptimeMonitoringPlugin } from '../../plugins/uptime-monitoring/manifest';
import { vapiPlugin } from '../../plugins/vapi/manifest';
import { fleetPlugin } from '../../plugins/fleet/manifest';
import { paulinoWizardPlugin } from '../../plugins/paulino-wizard/manifest';
import { demoPlugin } from '../../plugins/demo/manifest';
import { realEstateDataPlugin } from '../../plugins/real-estate-data/manifest';
import { inventoryPlugin } from '../../plugins/inventory/manifest';
import { materialsPlugin } from '../../plugins/materials/manifest';
import { onlineReviewsPlugin } from '../../plugins/online-reviews/manifest';
import { socialInboxPlugin } from '../../plugins/social-inbox/manifest';
import { waybackMachinePlugin } from '../../plugins/wayback-machine/manifest';
import { contentManagementPlugin } from '../../plugins/content-management/manifest';
import { stockPhotosPlugin } from '../../plugins/stock-photos/manifest';
import { wordpressContentPlugin } from '../../plugins/wordpress-content/manifest';
import { seoDirectoryPlugin } from '../../plugins/seo-directory/manifest';
import { clerkAuthPlugin } from '../../plugins/clerk-auth/manifest';
import { cookieNoticePlugin } from '../../plugins/cookie-notice/manifest';
import { deployWizardPlugin } from '../../plugins/deploy-wizard/manifest';
import { googleWorkspaceDkimPlugin } from '../../plugins/google-workspace-dkim/manifest';
import { websitePlugin } from '../../plugins/website/manifest';

export const REAVE_PLUGINS: ReavePlugin[] = [
  billingPlugin,
  carddavPlugin,
  clientPortalPlugin,
  codeDevPlugin,
  devInfraPlugin,
  emailMarketingPlugin,
  namecomDnsPlugin,
  schedulingPlugin,
  siteAuditsPlugin,
  analyticAuditPlugin,
  siteMonitoringPlugin,
  uptimeMonitoringPlugin,
  vapiPlugin,
  fleetPlugin,
  paulinoWizardPlugin,
  demoPlugin,
  realEstateDataPlugin,
  inventoryPlugin,
  materialsPlugin,
  onlineReviewsPlugin,
  socialInboxPlugin,
  waybackMachinePlugin,
  contentManagementPlugin,
  stockPhotosPlugin,
  wordpressContentPlugin,
  seoDirectoryPlugin,
  clerkAuthPlugin,
  cookieNoticePlugin,
  deployWizardPlugin,
  googleWorkspaceDkimPlugin,
  websitePlugin,
];

const PLUGIN_BY_ID = new Map(REAVE_PLUGINS.map((p) => [p.id, p]));

export function getPlugin(id: string): ReavePlugin | undefined {
  return PLUGIN_BY_ID.get(id);
}

function pluginFeatureEnabled(plugin: ReavePlugin): boolean {
  if (!plugin.feature) return true;
  if (hasFeature(plugin.feature)) return true;
  if (plugin.feature === 'content_management') return hasWebsiteEditor();
  if (plugin.feature === 'stock_photos') return hasStockPhotoSearch();
  return false;
}

export function isPluginActive(plugin: ReavePlugin): boolean {
  if (!pluginFeatureEnabled(plugin)) return false;
  if (plugin.configured && !plugin.configured()) return false;
  return true;
}

/** Plugin-owned knowledge is visible when the module is enabled — lost when it is turned off. */
export function isPluginKnowledgeActive(pluginId: string): boolean {
  const plugin = getPlugin(pluginId);
  if (!plugin) return false;
  return pluginFeatureEnabled(plugin);
}

export function activeAgentToolModules(): AgentToolModule[] {
  return REAVE_PLUGINS.filter(isPluginActive)
    .map((p) => p.agentTools)
    .filter((m): m is AgentToolModule => !!m);
}

export function pluginsForFeature(feature: string): ReavePlugin[] {
  return REAVE_PLUGINS.filter((plugin) => plugin.feature === feature);
}

/** Slugs owned by a plugin — hidden and purged while the add-on is off. */
export function isPluginOwnedKnowledgeSlug(slug: string): boolean {
  for (const plugin of REAVE_PLUGINS) {
    if (pluginKnowledgeSlugs(plugin.id).includes(slug)) return true;
  }
  return false;
}

/**
 * Setup playbooks for the official reΛVe.app install only.
 * A completed client install already has these wired — do not list or keep DB rows.
 */
export const OPS_ONLY_KNOWLEDGE_SLUGS: ReadonlySet<string> = new Set(['clerk-auth']);

export function isOpsOnlyKnowledgeSlug(slug: string): boolean {
  return OPS_ONLY_KNOWLEDGE_SLUGS.has(slug);
}

/** Whether bundled/DB slug is visible for this install (plugin-gated docs). */
export function isKnowledgeSlugAvailable(slug: string): boolean {
  if (isOpsOnlyKnowledgeSlug(slug) && !isCanonicalReaveInstall()) return false;
  for (const plugin of REAVE_PLUGINS) {
    if (pluginKnowledgeSlugs(plugin.id).includes(slug)) {
      return isPluginKnowledgeActive(plugin.id);
    }
  }
  return true;
}

/** Whether a slug is a shipped product playbook (core or active plugin) vs custom/business. */
export function isDefaultKnowledgeSlug(slug: string): boolean {
  if (CORE_DEFAULT_SLUGS.has(slug)) return true;
  for (const plugin of REAVE_PLUGINS) {
    if (!isPluginKnowledgeActive(plugin.id)) continue;
    if (pluginKnowledgeSlugs(plugin.id).includes(slug)) return true;
  }
  return false;
}

/** Core product playbooks — always in src/knowledge/, never in plugins/. */
export const CORE_DEFAULT_SLUGS: ReadonlySet<string> = new Set([
  'contact-api-reference',
  'git-workflow',
  'contact-import',
  'email-rules',
  'siri-examples',
  'siri-quick-reference',
  'siri-shortcuts',
  'media-drop-folder',
  'agent-recall',
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
      return ['kinsta-wordpress', 'railway-deploy-webhook', 'railway-build-failure-triage', 'google-workspace-dns'];
    case 'email-marketing':
      return ['newsletter'];
    case 'uptime-monitoring':
      return ['uptime-monitoring'];
    case 'fleet':
      return ['fleet-tracking', 'fleet-api-reference'];
    case 'paulino-wizard':
      return ['paulino-wizard', 'paulino-wizard-reference'];
    case 'demo':
      return ['demo-setup'];
    case 'real-estate-data':
      return ['real-estate-data'];
    case 'inventory':
      return ['inventory-sync', 'inventory-api-reference'];
    case 'materials':
      return ['materials-pricing', 'materials-api-reference'];
    case 'online-reviews':
      return ['online-reviews'];
    case 'social-inbox':
      return ['social-inbox'];
    case 'wayback-machine':
      return ['wayback-machine'];
    case 'content-management':
      return ['content-management', 'github-dev-tools'];
    case 'stock-photos':
      return ['stock-photos'];
    case 'wordpress-content':
      return ['wordpress-content'];
    case 'seo-directory':
      return ['seo-directory'];
    case 'code-dev':
      return ['code-dev-tools'];
    case 'site-audits':
      return ['inquiry-website-audit', 'inquiry-website-audit-quick', 'cloudflare-dns'];
    case 'analytic-audit':
      return ['analytic-audit'];
    case 'cookie-notice':
      return ['cookie-notice'];
    case 'deploy-wizard':
      return ['deploy-wizard'];
    case 'namecom-dns':
      return ['namecom-dns'];
    case 'google-workspace-dkim':
      return ['google-workspace-dkim'];
    case 'website':
      return ['website'];
    default:
      return [];
  }
}
