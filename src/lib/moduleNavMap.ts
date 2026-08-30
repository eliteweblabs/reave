/**
 * Maps optional feature modules to admin footer / settings tabs.
 * Core platform (chats, email, work, …) is always on — not listed in FEATURE_IDS.
 */
import type { FeatureId } from './featureCatalog';
import type { FooterNavKey } from './installConfig';

/** Primary admin navigation tabs tied to each optional module. */
export const FEATURE_FOOTER_NAV: Record<FeatureId, FooterNavKey[]> = {
  client_portal: ['clients'],
  web_handoff: ['clients'],
  portal_assistant: ['clients'],
  billing: ['finance'],
  site_audits: ['__system__', 'sales-sheet'],
  analytic_audit: ['analytics', '__system__'],
  site_monitoring: ['rules', '__system__'],
  uptime_monitoring: ['analytics', '__system__'],
  documents: ['documents'],
  digital_signature: ['documents'],
  voice: ['__system__'],
  vapi: ['vapi'],
  sms: ['clients', 'chats'],
  siri: ['__system__'],
  carddav: ['profile'],
  scheduling: ['schedule'],
  dev_infra: ['__system__'],
  code_dev: ['__system__'],
  email_marketing: ['newsletter'],
  fleet_tracking: ['fleet'],
  dealership_wizard: ['__system__'],
  namecom_dns: ['company'],
  time_tracking: ['work'],
  demo: ['modules'],
  real_estate_data: ['lead-scanner'],
  dscr_calculator: ['dscr'],
  inventory_sync: ['__system__'],
  online_reviews: ['reviews'],
  wayback_machine: ['__system__'],
  content_management: ['media', '__system__'],
  stock_photos: ['__system__', 'media'],
  wordpress_content: ['__system__'],
  seo_directory: ['analytics', '__system__'],
  event_ticketing: ['__system__'],
  cookie_notice: [],
  deploy_wizard: ['deploy'],
  website: ['media', '__system__'],
  credit_check: ['__system__'],
  materials_pricing: ['__system__'],
  social_inbox: ['social'],
  google_workspace: ['__system__', 'company'],
  hosting_core_os: [],
  hosting_growth: [],
};

/** Human labels for footerNav keys (monitor panel). */
export const FOOTER_NAV_LABELS: Partial<Record<FooterNavKey, string>> = {
  __system__: 'System',
  __chat__: 'Sessions',
  dashboard: 'Dashboard',
  todo: 'To-do',
  punchlist: 'Punch list',
  documents: 'Documents',
  'sales-sheet': 'Sales sheet',
  knowledge: 'Knowledge',
  chats: 'Sessions',
  email: 'Inbox',
  rules: 'Email Lab',
  newsletter: 'Newsletter',
  work: 'Projects',
  schedule: 'Schedule',
  clients: 'Contacts',
  social: 'Social',
  reviews: 'Reviews',
  media: 'Media Library',
  analytics: 'Sites',
  fleet: 'Fleet',
  finance: 'Finance',
  profile: 'Profile',
  company: 'Company',
  settings: 'Settings',
  socials: 'Socials',
  industries: 'Industries',
  catalog: 'Catalog',
  vapi: 'Vapi',
  'lead-scanner': 'Lead Scanner',
  'ai-services': 'AI Services',
  dscr: 'DSCR Calculator',
  modules: 'Modules',
  deploy: 'Deploy wizard',
};

export function footerNavKeysForFeature(feature: FeatureId): FooterNavKey[] {
  return FEATURE_FOOTER_NAV[feature] ?? [];
}

export function isFeatureInFooterNav(feature: FeatureId, footerNav: readonly FooterNavKey[]): boolean {
  const keys = footerNavKeysForFeature(feature);
  if (!keys.length) return false;
  const navSet = new Set(footerNav);
  return keys.some((k) => navSet.has(k));
}

export function footerNavKeyLabels(keys: FooterNavKey[]): string[] {
  return keys.map((k) => FOOTER_NAV_LABELS[k] ?? k);
}
