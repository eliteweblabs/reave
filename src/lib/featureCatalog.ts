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
  'cookie_notice',
  'deploy_wizard',
  'website',
  'credit_check',
  'materials_pricing',
  'social_inbox',
  'google_workspace',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Named public-site chips owned by a module (not the module title itself). */
export type ModuleMarketingCapability = {
  id: string;
  label: string;
  href?: string;
  /** Short line for catalog / /features — not a new playbook. */
  blurb?: string;
};

/**
 * Extra capabilities listed on a module. Flattened into GET /api/demo/loader
 * `features`, which /features and the homepage chip row consume.
 * Slugs use underscores (same as FeatureIds).
 */
export const FEATURE_MARKETING: Partial<
  Record<FeatureId, readonly ModuleMarketingCapability[]>
> = {
  online_reviews: [
    { id: 'google_reviews_triage', label: 'Google™ Reviews Triage', href: '/modules' },
    { id: 'apple_maps_reviews_triage', label: 'Apple Maps Reviews Triage', href: '/modules' },
    { id: 'yelp_reviews_triage', label: 'Yelp Reviews Triage', href: '/modules' },
    { id: 'facebook_reviews_triage', label: 'Facebook Reviews Triage', href: '/modules' },
    { id: 'tripadvisor_reviews_triage', label: 'Tripadvisor Reviews Triage', href: '/modules' },
  ],
  google_workspace: [
    {
      id: 'gmail_mx',
      label: 'Gmail MX',
      href: '/features#feature-google-workspace',
      blurb: 'Five standard Google MX records on the client domain.',
    },
    {
      id: 'google_spf',
      label: 'Google SPF',
      href: '/features#feature-google-workspace',
      blurb: 'Merges include:_spf.google.com into the existing SPF record.',
    },
    {
      id: 'gmail_dkim',
      label: 'Gmail DKIM',
      href: '/features#feature-google-workspace',
      blurb: 'Generate the Workspace key, publish it to Cloudflare, enable signing.',
    },
    {
      id: 'workspace_dmarc',
      label: 'Workspace DMARC',
      href: '/features#feature-google-workspace',
      blurb: 'Starter DMARC (p=none) when the zone has none.',
    },
    {
      id: 'workspace_domains',
      label: 'Workspace Domains',
      href: '/features#feature-google-workspace',
      blurb: 'Primary, secondary, and alias domains on the Workspace account.',
    },
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
  time_tracking: 'Time Tracking',
  demo: 'Demo mode',
  real_estate_data: 'Real estate data & lead scanner',
  inventory_sync: 'Multi-channel inventory sync',
  online_reviews: 'Reviews triage',
  wayback_machine: 'Wayback Machine',
  content_management: 'Agentic Website Editor',
  stock_photos: 'Pexels stock photos',
  wordpress_content: 'WordPress content plugin',
  seo_directory: 'SEO Directory API Kit',
  event_ticketing: 'Event ticketing',
  cookie_notice: 'Cookie notice',
  deploy_wizard: 'Deploy wizard',
  website: 'Agentic Website Editor',
  credit_check: 'Credit check',
  materials_pricing: 'Materials pricing',
  social_inbox: 'Agentic Social Media',
  google_workspace: 'Google™ Workspace',
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
  dev_infra: 'Railway, Kinsta, and deploy tooling — owner installs only',
  code_dev: 'Agent read/write/list/exec on the local codebase — owner/agency installs only',
  email_marketing: 'Welcome, follow-ups, review requests, and broadcasts',
  fleet_tracking: 'Live vehicle location and GPS history',
  dealership_wizard: 'Inventory browse and guided deal flow',
  namecom_dns: 'Name.com DNS — zone records and nameservers, agency/ops installs only',
  time_tracking: 'Log hours against projects and jobs',
  demo: 'Seed script, quick-start wizard, and Railway testing installs',
  real_estate_data: 'Property facts, compliance, and daily geofence scan',
  inventory_sync: 'Shopify, WooCommerce, and Square via inventory-api',
  online_reviews:
    'Google™, Apple Maps, Yelp, Facebook, and Tripadvisor — queue replies in one place',
  wayback_machine: 'Browse archived website snapshots from the Internet Archive',
  content_management: 'Edit the install’s own front-end repo through the agent — not the REΛVE app',
  stock_photos: 'Royalty-free search for pages, decks, and newsletters',
  wordpress_content: 'Agent updates posts, pages, and media on a WordPress site',
  seo_directory:
    'Second-tier citation & directory campaigns beyond Google, Apple, Yelp, and Bing',
  event_ticketing:
    'Ticket sales, QR check-in, and event inventory — reference only until productized',
  cookie_notice: 'Implied-consent cookie bar and Cookie Policy at /cookies',
  deploy_wizard: 'Stand up a new Railway install with module toggles and reference variables',
  website: 'Client website tools — edit, stock photos, publish. No hosting APIs',
  credit_check:
    'Applicant credit pull for forms and deal flow — reference only until a bureau is chosen',
  materials_pricing:
    'Live retail prices from Home Depot and Lowe’s. If a local supplier lists prices online, we can pull them too, apply a discount rate, or build quotes from past materials prices. Requires the billing module.',
  social_inbox:
    'One feed for Facebook, Instagram, LinkedIn, YouTube, TikTok, and the networks you choose — plus Google and Yelp reviews. The agent can draft replies; you post on the network.',
  google_workspace:
    'Gmail MX, SPF, DKIM, DMARC, and Workspace domain admin — point a client domain at Google mail without asking them to paste records.',
};

export type FeatureVisibility = 'public' | 'private' | 'service';

/**
 * Module storefront classification. Unlisted modules default to **public**
 * (demo loader, /modules, /features, marketing chips). Private modules are
 * super-admin / ops-only and are not sold as add-ons. Service modules are
 * not deployable app features — they stay on the official catalog / sales
 * sheet as work REΛVE offers outside the install.
 */
export const FEATURE_VISIBILITY: Partial<Record<FeatureId, FeatureVisibility>> = {
  deploy_wizard: 'private',
  dev_infra: 'private',
  code_dev: 'private',
  namecom_dns: 'private',
  google_workspace: 'service',
};

/**
 * Modules that appear on the audit sales sheet. Unlisted default to false.
 */
export const FEATURE_SALE_SHEET: ReadonlySet<FeatureId> = new Set<FeatureId>([
  'social_inbox',
  'materials_pricing',
  'website',
  'billing',
  'documents',
  'scheduling',
  'email_marketing',
  'time_tracking',
  'real_estate_data',
  'google_workspace',
]);

export const FEATURE_ID_SET = new Set<string>(FEATURE_IDS);

export function featureVisibility(id: FeatureId): FeatureVisibility {
  return FEATURE_VISIBILITY[id] ?? 'public';
}

export function isSaleSheetFeature(id: FeatureId): boolean {
  return FEATURE_SALE_SHEET.has(id);
}

export function isPublicFeature(id: string): boolean {
  return FEATURE_ID_SET.has(id) && featureVisibility(id as FeatureId) === 'public';
}

export function isPrivateFeature(id: string): boolean {
  return FEATURE_ID_SET.has(id) && featureVisibility(id as FeatureId) === 'private';
}

export function isServiceFeature(id: string): boolean {
  return FEATURE_ID_SET.has(id) && featureVisibility(id as FeatureId) === 'service';
}

/** App modules that can ship on an install. Service rows are catalog/sales only. */
export function isDeployableFeature(id: string): boolean {
  return FEATURE_ID_SET.has(id) && !isServiceFeature(id);
}

export const CORE_FEATURE_NOTE =
  'Contacts, email inbox, work/jobs, knowledge, durable recall, personal to-dos, chat / commands, and Clerk sign-in (passkeys, phone) are always on.';

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
    'Sign-in on every install is Clerk (@clerk/astro): sessions, passkeys, phone, publishable keys. That is baseline on every package — not an optional module. User-admin tools (list/manage users, sessions, orgs) appear when CLERK_SECRET_KEY is set.',
    'Enabled optional modules on this install:',
    lines.length ? lines.join('\n') : '- (none listed)',
    'Modules exist in the product even when not listed here. A tool missing from this turn means the module is off or a key is unset — not that the codebase lacks the integration.',
  ].join('\n');
}

/** What a client install should list as web tools — never Railway / Kinsta / Cloudflare. */
export function formatClientWebsiteToolInventory(opts: {
  editor: boolean;
  stockPhotos: boolean;
  stockPhotosActive: boolean;
}): string {
  const lines = ['Client website tools on this install (not hosting or registrar APIs):'];
  if (opts.editor) {
    lines.push(
      '- Website editor: this install’s front-end repo only (not REΛVE). Commit every edit in the same turn; “undo that” reverts the last commit.',
    );
  }
  if (opts.stockPhotos) {
    lines.push(
      opts.stockPhotosActive
        ? '- Stock photos: search_stock_photos is active (Pexels). Credit the photographer and link to pexels.com.'
        : '- Stock photos: module is on; search_stock_photos needs PEXELS_API_KEY.',
    );
  }
  lines.push(
    'Railway, Kinsta, Cloudflare, and Name.com APIs are agency/ops tools and are not on this client install. Do not list them as unconfigured web tools.',
  );
  return lines.join('\n');
}

/** Compact catalog for the public marketing-site chat (product capabilities, not this install's flags). */
export function formatMarketingCapabilityCatalog(): string {
  const modules = FEATURE_IDS.filter((id) => isPublicFeature(id))
    .map((id) => FEATURE_LABELS[id])
    .join(', ');
  return `${CORE_FEATURE_NOTE} Optional modules the platform ships: ${modules}. Sign-in is Clerk. Voice can be Vapi and/or Telnyx. Hosting/deploy is Railway. Mail is Resend. Billing is Crater. Scheduling is Cal.com.`;
}
