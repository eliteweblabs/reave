/**
 * Culled marketing features for hero chips / slideshow — dependent on modules.
 * Exposed on GET /api/demo/loader alongside the module catalog.
 */
import { FEATURE_MARKETING, isPublicFeature, type FeatureId } from './featureCatalog';

export type MarketingFeatureKind = 'capability' | 'nav';

export type MarketingFeature = {
  id: string;
  /** Short pill / slideshow label. */
  label: string;
  /**
   * Optional modules this capability requires.
   * Empty = core / always-on (ships with every install).
   */
  modules: readonly FeatureId[];
  kind: MarketingFeatureKind;
  /** Deep-link when the chip is clickable. */
  href?: string;
  /**
   * Shown in the static hero chip row before the repeating slideshow
   * consumes the full capability list.
   */
  spotlight?: boolean;
};

/** Expand FEATURE_MARKETING entries into loader/site chips for one module. */
function chipsForModule(moduleId: FeatureId): MarketingFeature[] {
  return (FEATURE_MARKETING[moduleId] ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    modules: [moduleId],
    kind: 'capability',
    href: item.href,
  }));
}

/**
 * Concrete product capabilities (+ optional nav chips).
 * Capabilities map to zero or more FeatureIds; do not add page/attribute links here
 * unless they are intentional green nav chips (e.g. pricing).
 * Module-owned extras live in FEATURE_MARKETING and are spread in here.
 */
export const MARKETING_FEATURES: readonly MarketingFeature[] = [
  // —— Core / always-on ——
  {
    id: 'ai-agent',
    label: 'Always-on AI agent',
    modules: [],
    kind: 'capability',
    href: '/features#feature-ai-assistant',
    spotlight: true,
  },
  {
    id: 'siri',
    label: 'Siri-ready',
    modules: [],
    kind: 'capability',
    href: '/features#feature-siri',
    spotlight: true,
  },
  {
    id: 'white-label',
    label: 'White labeled',
    modules: [],
    kind: 'capability',
    href: '/features#feature-white-label',
    spotlight: true,
  },
  {
    id: 'contacts-crm',
    label: 'Contacts & CRM',
    modules: [],
    kind: 'capability',
    href: '/features#feature-contacts',
  },
  {
    id: 'projects-work',
    label: 'Projects & work',
    modules: [],
    kind: 'capability',
    href: '/features#feature-projects',
  },
  {
    id: 'smart-inbox',
    label: 'Smart inbox',
    modules: [],
    kind: 'capability',
    href: '/features#feature-email',
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge base',
    modules: [],
    kind: 'capability',
    href: '/features#feature-learning',
  },
  {
    id: 'media-library',
    label: 'Media library',
    modules: [],
    kind: 'capability',
    href: '/features#feature-media',
  },
  {
    id: 'mobile-pwa',
    label: 'Mobile PWA & push',
    modules: [],
    kind: 'capability',
    href: '/features#feature-mobile',
  },
  {
    id: 'passkeys',
    label: 'Passkeys & Face ID',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'phone-sign-in',
    label: 'Phone sign-in',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'two-way-sms',
    label: 'Two-way SMS',
    modules: [],
    kind: 'capability',
    href: '/features#feature-sms',
  },
  {
    id: 'read-receipts',
    label: 'Read receipts & engagement',
    modules: [],
    kind: 'capability',
    href: '/features#feature-growth',
    spotlight: true,
  },
  {
    id: 'dynamic-todos',
    label: 'Dynamic to-dos',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'agentic-web-search',
    label: 'Agentic web search',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'chat-commands',
    label: 'Chat / commands',
    modules: [],
    kind: 'capability',
    href: '/features#feature-ai-assistant',
  },
  {
    id: 'chat-references',
    label: '@ Chat References',
    modules: [],
    kind: 'capability',
  },

  // —— Module-dependent ——
  {
    id: 'client-portal',
    label: 'Client portal',
    modules: ['client_portal'],
    kind: 'capability',
    href: '/features#feature-portal',
  },
  {
    id: 'handoff-vault',
    label: 'Handoff vault',
    modules: ['web_handoff'],
    kind: 'capability',
  },
  {
    id: 'portal-assistant',
    label: 'Portal assistant',
    modules: ['portal_assistant'],
    kind: 'capability',
  },
  {
    id: 'billing',
    label: 'Billing & invoicing',
    modules: ['billing'],
    kind: 'capability',
    href: '/features#feature-billing',
  },
  {
    id: 'scheduling',
    label: 'Scheduling & booking',
    modules: ['scheduling'],
    kind: 'capability',
    href: '/features#feature-scheduling',
  },
  {
    id: 'website',
    label: 'Website',
    modules: ['website'],
    kind: 'capability',
    href: '/features#feature-site-editing',
    spotlight: true,
  },
  {
    id: 'cms-less-editing',
    label: 'Agentic Website Editor',
    modules: ['content_management'],
    kind: 'capability',
    href: '/features#feature-site-editing',
  },
  {
    id: 'stock-photos',
    label: 'Stock photos',
    modules: ['stock_photos'],
    kind: 'capability',
  },
  {
    id: 'carddav',
    label: 'CardDAV contact sync',
    modules: ['carddav'],
    kind: 'capability',
  },
  {
    id: 'time-tracking',
    label: 'Project time tracking',
    modules: ['time_tracking'],
    kind: 'capability',
  },
  {
    id: 'documents',
    label: 'Document signing',
    modules: ['documents'],
    kind: 'capability',
  },
  {
    id: 'voice',
    label: 'Voice & call routing',
    modules: ['voice'],
    kind: 'capability',
  },
  {
    id: 'vapi',
    label: 'Live speak agent',
    modules: ['vapi'],
    kind: 'capability',
  },
  {
    id: 'email-marketing',
    label: 'Newsletters & lifecycle email',
    modules: ['email_marketing'],
    kind: 'capability',
    href: '/features#feature-growth',
  },
  {
    id: 'site-audits',
    label: 'Website audits',
    modules: ['site_audits'],
    kind: 'capability',
  },
  {
    id: 'analytic-audit',
    label: 'Search & analytics audit',
    modules: ['analytic_audit'],
    kind: 'capability',
  },
  {
    id: 'site-monitoring',
    label: 'Website change monitoring',
    modules: ['site_monitoring'],
    kind: 'capability',
  },
  {
    id: 'uptime-monitoring',
    label: 'Uptime monitoring',
    modules: ['uptime_monitoring'],
    kind: 'capability',
  },
  {
    id: 'wayback-machine',
    label: 'Wayback Machine',
    modules: ['wayback_machine'],
    kind: 'capability',
  },
  {
    id: 'seo-directory',
    label: 'SEO Directory API Kit',
    modules: ['seo_directory'],
    kind: 'capability',
  },
  {
    id: 'fleet-tracking',
    label: 'Fleet GPS tracking',
    modules: ['fleet_tracking'],
    kind: 'capability',
  },
  {
    id: 'dealership-wizard',
    label: 'Dealership inventory wizard',
    modules: ['dealership_wizard'],
    kind: 'capability',
  },
  {
    id: 'inventory-sync',
    label: 'Multi-channel inventory sync',
    modules: ['inventory_sync'],
    kind: 'capability',
  },
  {
    id: 'real-estate-data',
    label: 'Real estate data & lead scanner',
    modules: ['real_estate_data'],
    kind: 'capability',
  },
  ...chipsForModule('online_reviews'),
  {
    id: 'wordpress-content',
    label: 'WordPress content plugin',
    modules: ['wordpress_content'],
    kind: 'capability',
  },
  {
    id: 'dev-infra',
    label: 'Dev & deploy infrastructure',
    modules: ['dev_infra'],
    kind: 'capability',
  },
  {
    id: 'code-dev',
    label: 'Local code tools',
    modules: ['code_dev'],
    kind: 'capability',
  },
  {
    id: 'namecom-dns',
    label: 'DNS record management',
    modules: ['namecom_dns'],
    kind: 'capability',
  },
];

export type DemoLoaderFeature = {
  id: string;
  label: string;
  modules: FeatureId[];
  kind: MarketingFeatureKind;
  href: string | null;
  spotlight: boolean;
};

/** Public API shape for marketing features on the modules loader. */
export function listDemoLoaderFeatures(): DemoLoaderFeature[] {
  return MARKETING_FEATURES.filter((f) => f.modules.every((id) => isPublicFeature(id))).map((f) => ({
    id: f.id,
    label: f.label,
    modules: [...f.modules],
    kind: f.kind,
    href: f.href ?? null,
    spotlight: Boolean(f.spotlight),
  }));
}

/** Hero chip row — spotlight capabilities + nav (current static layout). */
export function listMarketingSpotlightFeatures(): MarketingFeature[] {
  return MARKETING_FEATURES.filter((f) => f.spotlight && f.modules.every((id) => isPublicFeature(id)));
}

/** Capabilities only (no nav chips) — for the repeating slideshow. */
export function listMarketingCapabilityFeatures(): MarketingFeature[] {
  return MARKETING_FEATURES.filter(
    (f) => f.kind === 'capability' && f.modules.every((id) => isPublicFeature(id)),
  );
}

/** Marketing features that depend on a given module. */
export function listMarketingFeaturesForModule(moduleId: FeatureId): MarketingFeature[] {
  if (!isPublicFeature(moduleId)) return [];
  return MARKETING_FEATURES.filter(
    (f) => f.kind === 'capability' && f.modules.includes(moduleId),
  );
}
