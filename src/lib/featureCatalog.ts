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
  'digital_signature',
  'voice',
  'vapi',
  'sms',
  'siri',
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
  'dscr_calculator',
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
  'hosting_core_os',
  'hosting_growth',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Brand / acronym tokens that should not be naively title-cased. */
const CATALOG_TOKEN_CASE: Record<string, string> = {
  'cal.com': 'Cal.com',
  carddav: 'CardDAV',
  vapi: 'VAPI',
  dscr: 'DSCR',
  fico: 'FICO',
  ltv: 'LTV',
  piti: 'PITI',
  'google™': 'Google™',
  'wordpress™': 'WordPress™',
  ios: 'iOS',
  gps: 'GPS',
  api: 'API',
  seo: 'SEO',
  crm: 'CRM',
  os: 'OS',
  sms: 'SMS',
  siri: 'Siri',
  dns: 'DNS',
  pwa: 'PWA',
  ai: 'AI',
  id: 'ID',
  mx: 'MX',
  dkim: 'DKIM',
  spf: 'SPF',
  dmarc: 'DMARC',
  qr: 'QR',
  ga4: 'GA4',
  'e-sign': 'E-Sign',
  'to-dos': 'To-Dos',
  'e-commerce': 'E-commerce',
};

function formatCatalogToken(token: string): string {
  if (token === '&' || token === '/' || token === '—' || token === '–') return token;
  const known = CATALOG_TOKEN_CASE[token.toLowerCase()];
  if (known) return known;
  if (token.includes('/') && token !== '/') {
    return token.split('/').map((part) => (part ? formatCatalogToken(part) : '')).join('/');
  }
  if (token.includes('-') && token.length > 1) {
    return token.split('-').map((part) => (part ? formatCatalogToken(part) : '')).join('-');
  }
  const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9].*?)([^A-Za-z0-9]*)$/);
  if (!match) return token;
  const [, pre, core, post] = match;
  const preserved = CATALOG_TOKEN_CASE[core.toLowerCase()];
  if (preserved) return `${pre}${preserved}${post}`;
  return `${pre}${core.charAt(0).toUpperCase()}${core.slice(1)}${post}`;
}

/** Title-case a catalog heading and prefer & over "and". */
export function formatCatalogTitle(input: string): string {
  return input
    .replace(/\band\b/gi, '&')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatCatalogToken)
    .join(' ');
}

/** Prefer & over "and" in catalog descriptions. */
export function formatCatalogBlurb(input: string): string {
  return input.replace(/\band\b/gi, '&');
}

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
  analytic_audit: [
    {
      id: 'sites_uptime',
      label: 'Uptime Monitoring',
      href: '/features#feature-analytic-audit',
      blurb: 'UptimeRobot checks & outage alerts on every apex domain.',
    },
    {
      id: 'sites_plausible',
      label: 'Plausible Fleet',
      href: '/features#feature-analytic-audit',
      blurb: 'Visitor stats for Railway & Kinsta apex domains.',
    },
    {
      id: 'sites_search_console',
      label: 'Search Console',
      href: '/features#feature-analytic-audit',
      blurb: 'Google Search Console, GA4, & IndexNow on the same Sites surface.',
    },
  ],
  online_reviews: [
    { id: 'google_reviews_triage', label: 'Google™ Reviews Triage', href: '/modules' },
    { id: 'apple_maps_reviews_triage', label: 'Apple Maps Reviews Triage', href: '/modules' },
    { id: 'yelp_reviews_triage', label: 'Yelp Reviews Triage', href: '/modules' },
    { id: 'facebook_reviews_triage', label: 'Facebook Reviews Triage', href: '/modules' },
    { id: 'tripadvisor_reviews_triage', label: 'Tripadvisor Reviews Triage', href: '/modules' },
    { id: 'trustpilot_reviews_triage', label: 'Trustpilot Reviews Triage', href: '/modules' },
    { id: 'glassdoor_reviews_triage', label: 'Glassdoor Reviews Triage', href: '/modules' },
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
      blurb: 'Primary, secondary, & alias domains on the Workspace account.',
    },
  ],
};

/** Catalog / chip slugs owned by `google_workspace` — not standalone modules. */
export const GOOGLE_WORKSPACE_CAPABILITY_IDS: readonly string[] = (
  FEATURE_MARKETING.google_workspace ?? []
).map((cap) => cap.id);

export function isGoogleWorkspaceCapability(id: string): boolean {
  return GOOGLE_WORKSPACE_CAPABILITY_IDS.includes(id);
}

/** One-module blurb that keeps every Workspace setup fact. */
export function aggregatedGoogleWorkspaceBlurb(): string {
  const lead = 'Point a client domain at Google mail without asking them to paste records.';
  const caps = FEATURE_MARKETING.google_workspace ?? [];
  if (!caps.length) return lead;
  const details = caps
    .map((c) => (c.blurb ? `${c.label} — ${c.blurb.replace(/\.$/, '')}` : c.label))
    .join('. ');
  return `${lead} ${details}.`;
}

/** Short human titles for health output, docs, demo catalog, and dashboard cards. */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  client_portal: 'Client Portal',
  web_handoff: 'Portal Data Tab',
  portal_assistant: 'Client Portal Help Chat',
  billing: 'Crater Billing & Invoices',
  site_audits: 'Website Audit',
  analytic_audit: 'Sites',
  site_monitoring: 'Website Change Monitoring',
  uptime_monitoring: 'Sites (Uptime)',
  documents: 'Dynamic Documents',
  digital_signature: 'Digital Signature',
  voice: 'Telnyx Voice Agent',
  vapi: 'VAPI Voice Agent',
  sms: 'Two-Way SMS',
  siri: 'Siri Shortcuts',
  carddav: 'CardDAV Contact Sync',
  scheduling: 'Cal.com Scheduling & Meetings',
  dev_infra: 'Dev & Infrastructure',
  code_dev: 'Local Code Tools',
  email_marketing: 'Newsletter & Email Automation',
  fleet_tracking: 'Fleet Tracking / GPS',
  dealership_wizard: 'Dealership Inventory & Deal Wizard',
  namecom_dns: 'DNS Record Management',
  time_tracking: 'Time Tracking',
  demo: 'Demo Mode',
  real_estate_data: 'Real Estate Data & Lead Scanner',
  dscr_calculator: 'DSCR Calculator',
  inventory_sync: 'Multi-Channel Inventory Sync',
  online_reviews: 'Reviews Triage',
  wayback_machine: 'Wayback Machine',
  content_management: 'Agentic Website Editor',
  stock_photos: 'Pexels Stock Photos',
  wordpress_content: 'WordPress™ Connect',
  seo_directory: 'SEO Directory API Kit',
  event_ticketing: 'Event Ticketing',
  cookie_notice: 'Cookie Notice',
  deploy_wizard: 'Deploy Wizard',
  website: 'Agentic Website Editor',
  credit_check: 'Credit Check',
  materials_pricing: 'Materials Pricing',
  social_inbox: 'Agentic Social Media',
  google_workspace: 'Google™ Workspace',
  hosting_core_os: 'Core OS Hosting',
  hosting_growth: 'Growth Hosting',
};

/** Short blurbs for demo loader tiles and marketing surfaces. */
export const FEATURE_BLURBS: Record<FeatureId, string> = {
  client_portal: 'Branded portal for each client at /c/:uid — projects, billing, vault',
  web_handoff: 'Secure credential & data handoff in the portal Data tab',
  portal_assistant: 'Speed-dial support chat for clients in the portal',
  billing: 'Get paid without leaving the work — send a quote, collect the invoice, or log a payment with Siri*.',
  site_audits: 'Automated website presence & technical audits',
  analytic_audit:
    'One fleet per apex domain — UptimeRobot status, Plausible visitors, Search Console, GA4, & IndexNow',
  site_monitoring: 'Watch pages for changes via ChangeDetection.io',
  uptime_monitoring: 'Bundled with Sites — UptimeRobot checks & outage alerts',
  documents: 'Spins up pre-filled NDA, 1040, or anything else in a branded template with the client\'s name, company, & contact info — send it as-is, no editing.',
  digital_signature: 'They sign on their phone — legally binding, with a full audit trail of who, when, & from where.',
  voice: 'Phone agent & call routing on Telnyx',
  vapi: 'Voice assistant powered by Vapi',
  sms: 'Two-way texting via Telnyx — threaded on the contact, send from chat, Siri, or the portal. Cannot be tested in a demo environment (needs a live Telnyx number & carrier setup).',
  siri: 'Apple Shortcuts → /api/siri — ask the agent, look up clients, start timers, send SMS, & more by voice. Cannot be tested in a demo environment (needs iPhone Shortcuts + SIRI_API_KEY on a live install).',
  carddav: 'Sync contacts to iOS & other CardDAV clients',
  scheduling: 'Bookings, availability, & meeting links via Cal.com',
  dev_infra: 'Railway, Kinsta, & deploy tooling — owner installs only',
  code_dev: 'Agent read/write/list/exec on the local codebase — owner/agency installs only',
  email_marketing: 'Automatically welcome them, follow up, & ask for the review — scheduled or bespoke emails that bring them back, without another email tool.',
  fleet_tracking: 'Live vehicle location & GPS history',
  dealership_wizard: 'Inventory browse & guided deal flow',
  namecom_dns: 'Name.com DNS — zone records & nameservers, agency/ops installs only',
  time_tracking: 'Log hours against projects & jobs',
  demo: 'Seed script, quick-start wizard, & Railway testing installs',
  real_estate_data: 'Property facts, compliance, & daily geofence scan',
  dscr_calculator:
    'Lender-grade DSCR for rental property — LTV, estimated rate, PITI, & pass/fail from FICO & loan structure. Public page at /dscr.',
  inventory_sync: 'Shopify, WooCommerce, & Square via inventory-api',
  online_reviews:
    'Google™, Apple Maps, Yelp, Facebook, Tripadvisor, Trustpilot, & Glassdoor — queue replies in one place',
  wayback_machine: 'Browse archived website snapshots from the Internet Archive',
  content_management: 'Edit the install’s own front-end repo through the agent — not the reave.app',
  stock_photos: 'Royalty-free search for pages, decks, & newsletters',
  wordpress_content:
    'Agent updates posts, pages, media, menus, & redirects on a WordPress™ site via Reave Connect',
  seo_directory:
    'Second-tier citation & directory campaigns beyond Google, Apple, Yelp, & Bing',
  event_ticketing:
    'Ticket sales, QR check-in, & event inventory — reference only until productized',
  cookie_notice: 'Implied-consent cookie bar & Cookie Policy at /cookies',
  deploy_wizard: 'Stand up a new Railway install with module toggles & reference variables',
  website: 'Client website tools — edit, stock photos, publish. No hosting APIs',
  credit_check:
    'Applicant credit pull for forms & deal flow — reference only until a bureau is chosen',
  materials_pricing:
    'Live retail prices from Home Depot & Lowe’s. If a local supplier lists prices online, we can pull them too, apply a discount rate, or build quotes from past materials prices. Requires the billing module.',
  social_inbox:
    'One feed for Facebook, Instagram, LinkedIn, YouTube, TikTok, & the networks you choose — plus Google & Yelp reviews. The agent can draft replies; you post on the network.',
  google_workspace:
    'Gmail MX, SPF, DKIM, DMARC, & Workspace domain admin — point a client domain at Google mail without asking them to paste records.',
  hosting_core_os:
    'Fully managed hosting for one WordPress site or web app — security, updates, scans, SEO reports, & light content edits so you can stay focused on the business.',
  hosting_growth:
    'Same hands-on care — plus unlimited content & design edits whenever you need a change. Your always-on web team for the year.',
};

export type FeatureVisibility = 'public' | 'private' | 'service';

/**
 * Module storefront classification. Unlisted modules default to **public**
 * (demo loader, /modules, /features, marketing chips). Private modules are
 * super-admin / ops-only and are not sold as add-ons. Service modules are
 * not deployable app features — they stay on the official catalog / sales
 * sheet as work reave.app offers outside the install.
 */
export const FEATURE_VISIBILITY: Partial<Record<FeatureId, FeatureVisibility>> = {
  deploy_wizard: 'private',
  dev_infra: 'private',
  code_dev: 'private',
  namecom_dns: 'private',
  /** Bundled into Sites (`analytic_audit`) — not sold alone. */
  uptime_monitoring: 'private',
  google_workspace: 'service',
  hosting_core_os: 'service',
  hosting_growth: 'service',
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
  'digital_signature',
  'scheduling',
  'email_marketing',
  'time_tracking',
  'real_estate_data',
  'dscr_calculator',
  'google_workspace',
]);

/**
 * Other optional modules that turn on automatically with this one.
 * Digital Signature needs Dynamic Documents (templates) to exist.
 */
export const FEATURE_REQUIRES: Partial<Record<FeatureId, readonly FeatureId[]>> = {
  digital_signature: ['documents'],
  /** Sites = analytics fleet + uptime — enabling either turns on both. */
  analytic_audit: ['uptime_monitoring'],
  uptime_monitoring: ['analytic_audit'],
};

export function featureRequirements(id: string): FeatureId[] {
  if (!FEATURE_ID_SET.has(id)) return [];
  return [...(FEATURE_REQUIRES[id as FeatureId] ?? [])];
}

/** Selected modules plus every required module, requirements first. */
export function expandFeatureRequirements(ids: Iterable<string>): FeatureId[] {
  const out: FeatureId[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (!FEATURE_ID_SET.has(id) || seen.has(id)) return;
    seen.add(id);
    for (const req of FEATURE_REQUIRES[id as FeatureId] ?? []) visit(req);
    out.push(id as FeatureId);
  };
  for (const id of ids) visit(id);
  return out;
}

/** Modules that list `id` as a requirement (direct only). */
export function featuresRequiring(id: string): FeatureId[] {
  if (!FEATURE_ID_SET.has(id)) return [];
  return FEATURE_IDS.filter((fid) => (FEATURE_REQUIRES[fid] ?? []).includes(id as FeatureId));
}

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

/** Managed hosting care plans from /hosting — catalog/sales only. */
export const HOSTING_FEATURE_IDS = ['hosting_core_os', 'hosting_growth'] as const;

export function isHostingFeature(id: string): boolean {
  return (HOSTING_FEATURE_IDS as readonly string[]).includes(id);
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
      '- Website editor: this install’s front-end repo only (not reave.app). Commit every edit in the same turn; “undo that” reverts the last commit.',
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
