/**
 * Canonical feature module ids and labels — no runtime dependencies.
 * Used by demoModuleCatalog, features, and install config to avoid circular imports.
 */

/** Optional module ids — must match install config entries exactly. */
export const FEATURE_IDS = [
  'client_portal',
  'web_handoff',
  'portal_assistant',
  'billing',
  'site_audits',
  'analytic_audit',
  'site_monitoring',
  'uptime_monitoring',
  'documents',
  'voice',
  'vapi',
  'carddav',
  'scheduling',
  'dev_infra',
  'code_dev',
  'email_marketing',
  'fleet_tracking',
  'dealership_wizard',
  'namecom_dns',
  'time_tracking',
  'demo',
  'real_estate_data',
  'inventory_sync',
  'online_reviews',
  'wayback_machine',
  'content_management',
  'stock_photos',
  'wordpress_content',
  'seo_directory',
  'event_ticketing',
  'clerk_auth',
  'cookie_notice',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Named public-site chips owned by a module (not the module title itself). */
export type ModuleMarketingCapability = {
  id: string;
  label: string;
  href?: string;
};

/**
 * Extra capabilities listed on a module. Flattened into GET /api/demo/loader
 * `features`, which /features and the homepage chip row consume.
 */
export const FEATURE_MARKETING: Partial<
  Record<FeatureId, readonly ModuleMarketingCapability[]>
> = {
  online_reviews: [
    { id: 'google-reviews-triage', label: 'Google™ Reviews Triage', href: '/modules' },
    { id: 'apple-maps-reviews-triage', label: 'Apple Maps Reviews Triage', href: '/modules' },
    { id: 'yelp-reviews-triage', label: 'Yelp Reviews Triage', href: '/modules' },
    { id: 'facebook-reviews-triage', label: 'Facebook Reviews Triage', href: '/modules' },
    { id: 'tripadvisor-reviews-triage', label: 'Tripadvisor Reviews Triage', href: '/modules' },
  ],
};

/** Short human titles for health output, docs, and demo module catalog. */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  client_portal: 'Client portal',
  web_handoff: 'Portal Data tab',
  portal_assistant: 'Client portal help chat',
  billing: 'Crater billing & invoices',
  site_audits: 'Website Audit',
  analytic_audit: 'Search & analytics audit',
  site_monitoring: 'Website change monitoring',
  uptime_monitoring: 'Uptime monitoring',
  documents: 'Document signing templates',
  voice: 'Telnyx voice agent',
  vapi: 'VAPI Voice Agent',
  carddav: 'CardDAV Contact Sync',
  scheduling: 'Cal.com scheduling & meetings',
  dev_infra: 'Dev & infrastructure',
  code_dev: 'Local code tools',
  email_marketing: 'Newsletter & email automation',
  fleet_tracking: 'Fleet tracking / GPS',
  dealership_wizard: 'Dealership inventory & deal wizard',
  namecom_dns: 'DNS record management',
  time_tracking: 'Project Time Tracking',
  demo: 'Demo mode',
  real_estate_data: 'Real estate data & lead scanner',
  inventory_sync: 'Multi-channel inventory sync',
  online_reviews: 'Reviews triage',
  wayback_machine: 'Wayback Machine',
  content_management: 'Website content management',
  stock_photos: 'Pexels stock photos',
  wordpress_content: 'WordPress content plugin',
  seo_directory: 'SEO Directory API Kit',
  event_ticketing: 'Event ticketing',
  clerk_auth: 'Clerk Authentication',
  cookie_notice: 'Cookie notice',
};

/** Short blurbs for demo loader tiles and marketing surfaces. */
export const FEATURE_BLURBS: Record<FeatureId, string> = {
  client_portal: 'Branded portal for each client at /c/:uid',
  web_handoff: 'Secure credential and data handoff in the portal Data tab',
  portal_assistant: 'Speed-dial support chat for clients in the portal',
  billing: 'Quotes, invoices, and payments via Crater',
  site_audits: 'Automated website presence and technical audits',
  analytic_audit: 'Google Search Console, GA4, Plausible, IndexNow',
  site_monitoring: 'Watch pages for changes via ChangeDetection.io',
  uptime_monitoring: 'UptimeRobot checks and outage alerts',
  documents: 'Reusable templates for e-sign workflows',
  voice: 'Phone agent and call routing on Telnyx',
  vapi: 'Voice assistant powered by Vapi',
  carddav: 'Sync contacts to iOS and other CardDAV clients',
  scheduling: 'Bookings, availability, and meeting links via Cal.com',
  dev_infra: 'Git, Railway, Kinsta, and deploy tooling',
  code_dev: 'Agent read/write/list/exec on the local codebase',
  email_marketing: 'Welcome, follow-ups, review requests, and broadcasts',
  fleet_tracking: 'Live vehicle location and GPS history',
  dealership_wizard: 'Inventory browse and guided deal flow',
  namecom_dns: 'Name.com DNS records — agency/ops installs only',
  time_tracking: 'Log hours against projects and jobs',
  demo: 'Seed script, quick-start wizard, and Railway testing installs',
  real_estate_data: 'Property facts, compliance, and daily geofence scan',
  inventory_sync: 'Shopify, WooCommerce, and Square via inventory-api',
  online_reviews:
    'Google™, Apple Maps, Yelp, Facebook, and Tripadvisor — queue replies in one place',
  wayback_machine: 'Browse archived website snapshots from the Internet Archive',
  content_management: 'Update your site through the agent, no CMS',
  stock_photos: 'Royalty-free search for pages, decks, and newsletters',
  wordpress_content: 'Agent updates posts, pages, and media on a WordPress site',
  seo_directory:
    'Second-tier citation & directory campaigns beyond Google, Apple, Yelp, and Bing',
  event_ticketing:
    'Ticket sales, QR check-in, and event inventory — reference only until productized',
  clerk_auth:
    'Manage Clerk users, sessions, and organizations; provision client apps (Pro/Enterprise)',
  cookie_notice: 'Implied-consent cookie bar and Cookie Policy at /cookies',
};

export const CORE_FEATURE_NOTE =
  'Contacts, email inbox, work/jobs, knowledge, personal to-dos, chat, passkeys, and phone sign-in are always on.';

export const FEATURE_ID_SET = new Set<string>(FEATURE_IDS);

/**
 * Ground-truth inventory for the admin agent. A missing tool this turn is not
 * the same as "the product does not include that" — keys and feature flags
 * hide tools; they do not un-wire the codebase.
 */
export function formatAgentCapabilityInventory(enabledIds: Iterable<string>): string {
  const enabled = new Set(enabledIds);
  const lines = FEATURE_IDS.filter((id) => enabled.has(id)).map(
    (id) => `- ${FEATURE_LABELS[id]} (${id}) — ${FEATURE_BLURBS[id]}`,
  );
  return [
    `Always-on core: ${CORE_FEATURE_NOTE}`,
    'Sign-in on every install is Clerk (@clerk/astro): sessions, passkeys, phone, publishable keys. That is core product, not an optional extra. The clerk_auth module only adds admin tools (list/manage users, sessions, orgs) when CLERK_SECRET_KEY is set.',
    'Enabled optional modules on this install:',
    lines.length ? lines.join('\n') : '- (none listed)',
    'Modules exist in the product even when not listed here. A tool missing from this turn means the module is off or a key is unset — not that the codebase lacks the integration.',
  ].join('\n');
}

/** Compact catalog for the public marketing-site chat (product capabilities, not this install's flags). */
export function formatMarketingCapabilityCatalog(): string {
  const modules = FEATURE_IDS.map((id) => FEATURE_LABELS[id]).join(', ');
  return `${CORE_FEATURE_NOTE} Optional modules the platform ships: ${modules}. Sign-in is Clerk. Voice can be Vapi and/or Telnyx. Hosting/deploy is Railway. Mail is Resend. Billing is Crater. Scheduling is Cal.com.`;
}
