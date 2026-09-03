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
const MARKETING_FEATURES_RAW: readonly MarketingFeature[] = [
  // —— Core / always-on ——
  {
    id: 'ai-agent',
    label: 'Always-On AI Agent',
    modules: [],
    kind: 'capability',
    href: '/features#feature-ai-assistant',
    spotlight: true,
  },
  {
    id: 'white-label',
    label: 'White Labeled',
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
    label: 'Projects & Work',
    modules: [],
    kind: 'capability',
    href: '/features#feature-projects',
  },
  {
    id: 'smart-inbox',
    label: 'Smart Inbox',
    modules: [],
    kind: 'capability',
    href: '/features#feature-email',
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base',
    modules: [],
    kind: 'capability',
    href: '/features#feature-learning',
  },
  {
    id: 'media-library',
    label: 'Media Library',
    modules: [],
    kind: 'capability',
    href: '/features#feature-media',
  },
  {
    id: 'mobile-pwa',
    label: 'Mobile PWA & Push',
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
    label: 'Phone Sign-In',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'read-receipts',
    label: 'Read Receipts & Engagement',
    modules: [],
    kind: 'capability',
    href: '/features#feature-growth',
    spotlight: true,
  },
  {
    id: 'dynamic-todos',
    label: 'Dynamic To-Dos',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'agentic-web-search',
    label: 'Agentic Web Search',
    modules: [],
    kind: 'capability',
  },
  {
    id: 'chat-commands',
    label: 'Chat / Commands',
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
    id: 'siri',
    label: 'Siri-Ready',
    modules: ['siri'],
    kind: 'capability',
    href: '/features#feature-siri',
    spotlight: true,
  },
  {
    id: 'sms',
    label: 'Two-Way SMS',
    modules: ['sms'],
    kind: 'capability',
    href: '/features#feature-sms',
  },
  {
    id: 'client-portal',
    label: 'Client Portal',
    modules: ['client_portal'],
    kind: 'capability',
    href: '/features#feature-portal',
  },
  {
    id: 'handoff-vault',
    label: 'Handoff Vault',
    modules: ['web_handoff'],
    kind: 'capability',
  },
  {
    id: 'portal-assistant',
    label: 'Portal Assistant',
    modules: ['portal_assistant'],
    kind: 'capability',
  },
  {
    id: 'billing',
    label: 'Billing & Invoicing',
    modules: ['billing'],
    kind: 'capability',
    href: '/features#feature-billing',
  },
  {
    id: 'scheduling',
    label: 'Scheduling & Booking',
    modules: ['scheduling'],
    kind: 'capability',
    href: '/features#feature-scheduling',
  },
  {
    id: 'website',
    label: 'Agentic Website Editor',
    modules: ['website', 'content_management'],
    kind: 'capability',
    href: '/features#feature-site-editing',
    spotlight: true,
  },
  {
    id: 'stock-photos',
    label: 'Stock Photos',
    modules: ['stock_photos'],
    kind: 'capability',
  },
  {
    id: 'carddav',
    label: 'CardDAV Contact Sync',
    modules: ['carddav'],
    kind: 'capability',
  },
  {
    id: 'time-tracking',
    label: 'Time Tracking',
    modules: ['time_tracking'],
    kind: 'capability',
  },
  {
    id: 'documents',
    label: 'Dynamic Documents',
    modules: ['documents'],
    kind: 'capability',
  },
  {
    id: 'digital-signature',
    label: 'Digital Signature',
    modules: ['digital_signature'],
    kind: 'capability',
  },
  {
    id: 'voice',
    label: 'Voice & Call Routing',
    modules: ['voice'],
    kind: 'capability',
  },
  {
    id: 'vapi',
    label: 'Live Speak Agent',
    modules: ['vapi'],
    kind: 'capability',
  },
  {
    id: 'email-marketing',
    label: 'Newsletters & Lifecycle Email',
    modules: ['email_marketing'],
    kind: 'capability',
    href: '/features#feature-growth',
  },
  {
    id: 'site-audits',
    label: 'Website Audits',
    modules: ['site_audits'],
    kind: 'capability',
  },
  {
    id: 'analytic-audit',
    label: 'Sites',
    modules: ['analytic_audit'],
    kind: 'capability',
  },
  {
    id: 'site-monitoring',
    label: 'Website Change Monitoring',
    modules: ['site_monitoring'],
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
    label: 'Fleet GPS Tracking',
    modules: ['fleet_tracking'],
    kind: 'capability',
  },
  {
    id: 'dealership-wizard',
    label: 'Dealership Inventory Wizard',
    modules: ['dealership_wizard'],
    kind: 'capability',
  },
  {
    id: 'inventory-sync',
    label: 'Multi-Channel Inventory Sync',
    modules: ['inventory_sync'],
    kind: 'capability',
  },
  {
    id: 'social-inbox',
    label: 'Agentic Social Media',
    modules: ['social_inbox'],
    kind: 'capability',
  },
  {
    id: 'social-lead-scanner',
    label: 'Agentic Social Lead Scanner',
    modules: ['social_lead_scanner'],
    kind: 'capability',
  },
  {
    id: 'google_workspace',
    label: 'Google™ Workspace',
    modules: ['google_workspace'],
    kind: 'capability',
    href: '/features#feature-google-workspace',
  },
  {
    id: 'materials-pricing',
    label: 'Materials Pricing',
    modules: ['materials_pricing'],
    kind: 'capability',
  },
  {
    id: 'real-estate-data',
    label: 'Real Estate Data & Lead Scanner',
    modules: ['real_estate_data'],
    kind: 'capability',
  },
  {
    id: 'dscr_calculator',
    label: 'DSCR Calculator',
    modules: ['dscr_calculator'],
    kind: 'capability',
    href: '/dscr',
  },
  ...chipsForModule('online_reviews'),
  {
    id: 'wordpress-content',
    label: 'WordPress™ Connect',
    modules: ['wordpress_content'],
    kind: 'capability',
  },
  {
    id: 'dev-infra',
    label: 'Dev & Deploy Infrastructure',
    modules: ['dev_infra'],
    kind: 'capability',
  },
  {
    id: 'code-dev',
    label: 'Local Code Tools',
    modules: ['code_dev'],
    kind: 'capability',
  },
  {
    id: 'namecom-dns',
    label: 'DNS Record Management',
    modules: ['namecom_dns'],
    kind: 'capability',
  },
];

/** Chip ids match FeatureIds — underscores, never hyphens. */
export const MARKETING_FEATURES: readonly MarketingFeature[] = MARKETING_FEATURES_RAW.map((item) => ({
  ...item,
  id: item.id.replace(/-/g, '_'),
}));

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
