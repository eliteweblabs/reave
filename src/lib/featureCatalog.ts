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
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Human labels for health output, docs, and demo module catalog. */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  client_portal: 'Client portal (/c/:uid)',
  web_handoff: 'Portal Data tab (handoff creds)',
  portal_assistant: 'Client portal help chat (speed-dial support assistant)',
  billing: 'Crater billing & invoices',
  site_audits: 'Site audits (Lighthouse, SSL, DNS, links)',
  site_monitoring: 'Site change monitoring (ChangeDetection.io)',
  uptime_monitoring: 'Uptime monitoring (UptimeRobot)',
  documents: 'Document signing templates',
  voice: 'Telnyx voice agent',
  vapi: 'VAPI Voice Agent',
  carddav: 'CardDAV Contact Sync',
  scheduling: 'Cal.com scheduling & meetings',
  dev_infra: 'Dev & infrastructure (Git, Railway, Kinsta, deploy)',
  code_dev: 'Local code tools (read/write/list/exec)',
  email_marketing: 'Newsletter & email automation (welcome, follow-ups, review requests, broadcasts)',
  fleet_tracking: 'Fleet tracking / GPS',
  dealership_wizard: 'Dealership inventory & deal wizard (paulino-wizard)',
  namecom_dns: 'DNS record management (Name.com) — agency/ops installs only',
  time_tracking: 'Project Time Tracking',
  demo: 'Demo mode (seed script, quick-start wizard, Railway testing installs)',
  real_estate_data: 'Real estate data & lead scanner (property facts, compliance, daily geofence scan)',
  inventory_sync: 'Multi-channel inventory sync (Shopify, WooCommerce, Square via inventory-api)',
  online_reviews: 'Online reviews inbox — Google sync + response to-do workflow',
  wayback_machine: 'Wayback Machine — browse archived website snapshots (Internet Archive)',
};

export const CORE_FEATURE_NOTE =
  'Contacts, email inbox, work/jobs, knowledge, personal to-dos, and chat are always on.';

export const FEATURE_ID_SET = new Set<string>(FEATURE_IDS);
