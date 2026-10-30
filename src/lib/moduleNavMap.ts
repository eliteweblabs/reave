/**
 * Maps optional feature modules to admin footer / settings tabs.
 */
import type { FeatureId } from './featureCatalog';
import type { FooterNavKey } from './installConfig';

/** Footer keys always shown when listed in install config (not gated by add-ons). */
export const FOOTER_NAV_ALWAYS_ON: ReadonlySet<FooterNavKey> = new Set([
  '__system__',
  '__chat__',
  'dashboard',
  'todo',
  'punchlist',
  'knowledge',
  'chats',
  'modules',
]);

const FOOTER_NAV_SLOT_KEYS = new Set<FooterNavKey>(['__system__', '__chat__']);

/** Primary admin navigation tabs tied to each optional module. */
export const FEATURE_FOOTER_NAV: Record<FeatureId, FooterNavKey[]> = {
  client_portal: ['clients'],
  web_handoff: ['clients'],
  portal_assistant: ['clients'],
  billing: ['finance'],
  video_meet: ['meet'],
  site_audits: ['__system__', 'sales-sheet'],
  analytic_audit: ['analytics', '__system__'],
  site_monitoring: ['rules', '__system__'],
  uptime_monitoring: ['analytics', '__system__'],
  documents: ['documents'],
  digital_signature: ['documents'],
  voice: ['__system__'],
  vapi: ['vapi'],
  sms: ['clients'],
  email_inbox: ['email'],
  siri: ['__system__'],
  carddav: ['profile'],
  scheduling: ['schedule'],
  dev_infra: ['__system__'],
  code_dev: ['__system__'],
  email_marketing: ['newsletter'],
  auto_email_response: ['rules'],
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
  google_ads: ['analytics', '__system__'],
  event_ticketing: ['__system__'],
  cookie_notice: [],
  deploy_wizard: ['deploy'],
  website: ['media', '__system__'],
  credit_check: ['__system__'],
  materials_pricing: ['__system__'],
  social_inbox: ['social'],
  social_lead_scanner: ['social-leads'],
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
  'social-leads': 'Social Leads',
  reviews: 'Reviews',
  media: 'Media Library',
  analytics: 'Sites',
  fleet: 'Fleet',
  finance: 'Finance',
  meet: 'Meet',
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

const FOOTER_NAV_PROVIDERS: Map<FooterNavKey, FeatureId[]> = (() => {
  const map = new Map<FooterNavKey, FeatureId[]>();
  for (const feature of Object.keys(FEATURE_FOOTER_NAV) as FeatureId[]) {
    for (const key of FEATURE_FOOTER_NAV[feature] ?? []) {
      if (FOOTER_NAV_SLOT_KEYS.has(key)) continue;
      const list = map.get(key) ?? [];
      if (!list.includes(feature)) list.push(feature);
      map.set(key, list);
    }
  }
  return map;
})();

/** Serialized for admin client — footer tabs gated by optional modules. */
export function footerNavProvidersForClient(): Partial<Record<FooterNavKey, FeatureId[]>> {
  const out: Partial<Record<FooterNavKey, FeatureId[]>> = {};
  for (const [key, providers] of FOOTER_NAV_PROVIDERS) {
    out[key] = [...providers];
  }
  return out;
}

export function footerNavAlwaysOnKeys(): FooterNavKey[] {
  return [...FOOTER_NAV_ALWAYS_ON];
}

/** Whether a footer tab may show for the enabled feature set on this install. */
export function footerNavKeyAllowedForFeatures(
  key: FooterNavKey,
  enabledFeatures: ReadonlySet<string>,
): boolean {
  if (FOOTER_NAV_ALWAYS_ON.has(key)) return true;
  const providers = FOOTER_NAV_PROVIDERS.get(key);
  if (!providers?.length) return true;
  return providers.some((feature) => enabledFeatures.has(feature));
}

export function filterFooterNavByEnabledFeatures(
  nav: readonly FooterNavKey[],
  enabledFeatures: readonly string[],
): FooterNavKey[] {
  const enabled = new Set(enabledFeatures);
  return nav.filter((key) => footerNavKeyAllowedForFeatures(key, enabled));
}

/** Tab order when injecting add-on keys missing from install config footerNav. */
const FOOTER_NAV_CANONICAL_ORDER: FooterNavKey[] = [
  '__system__',
  '__chat__',
  'modules',
  'deploy',
  'dashboard',
  'todo',
  'punchlist',
  'documents',
  'sales-sheet',
  'knowledge',
  'chats',
  'email',
  'rules',
  'newsletter',
  'work',
  'schedule',
  'clients',
  'social',
  'social-leads',
  'reviews',
  'media',
  'analytics',
  'fleet',
  'finance',
  'meet',
  'dscr',
  'lead-scanner',
  'vapi',
  'profile',
  'company',
  'settings',
  'socials',
  'addons',
  'ai-services',
  'industries',
  'catalog',
];

export function sortFooterNavKeys(nav: readonly FooterNavKey[]): FooterNavKey[] {
  const rank = new Map(FOOTER_NAV_CANONICAL_ORDER.map((key, index) => [key, index]));
  return [...nav].sort((a, b) => (rank.get(a) ?? 1000) - (rank.get(b) ?? 1000));
}

/**
 * Runtime Add-ons toggles enable modules that may not be listed in config footerNav.
 * Inject their tabs before filtering so Inbox / Schedule / etc. appear when turned on.
 */
export function mergeFooterNavForEnabledFeatures(
  nav: readonly FooterNavKey[],
  enabledFeatures: readonly string[],
): FooterNavKey[] {
  const out: FooterNavKey[] = [...nav];
  const present = new Set(out);
  for (const raw of enabledFeatures) {
    const feature = raw as FeatureId;
    if (!(feature in FEATURE_FOOTER_NAV)) continue;
    for (const key of footerNavKeysForFeature(feature)) {
      if (FOOTER_NAV_SLOT_KEYS.has(key)) continue;
      if (!present.has(key)) {
        out.push(key);
        present.add(key);
      }
    }
  }
  return sortFooterNavKeys(out);
}

/** Bottom admin footer pill buttons (`AdminFooterNav`) → footerNav map keys. */
export const PRIMARY_ADMIN_FOOTER_BUTTONS = {
  dashboard: 'dashboard',
  chat: 'chats',
  inbox: 'email',
  schedule: 'schedule',
  work: 'work',
  todo: 'todo',
  clients: 'clients',
} as const satisfies Record<string, FooterNavKey>;

export type PrimaryAdminFooterButton = keyof typeof PRIMARY_ADMIN_FOOTER_BUTTONS;

export function footerNavListIncludesKey(
  nav: readonly FooterNavKey[],
  mapKey: FooterNavKey,
): boolean {
  const navSet = new Set(nav);
  if (mapKey === 'chats') return navSet.has('chats') || navSet.has('__chat__');
  return navSet.has(mapKey);
}

/** Footer tab / icon visible — enabled add-on, and listed in merged client footerNav. */
export function installFooterMapKeyVisibleForChrome(
  chrome: Pick<{ footerNav: FooterNavKey[]; features: string[] }, 'footerNav' | 'features'>,
  mapKey: FooterNavKey,
): boolean {
  const enabled = new Set(chrome.features);
  if (!footerNavKeyAllowedForFeatures(mapKey, enabled)) return false;
  const nav = chrome.footerNav;
  if (Array.isArray(nav) && nav.length) {
    return footerNavListIncludesKey(nav, mapKey);
  }
  return true;
}

export function primaryAdminFooterButtonVisible(
  chrome: Pick<{ footerNav: FooterNavKey[]; features: string[] }, 'footerNav' | 'features'>,
  button: PrimaryAdminFooterButton,
): boolean {
  const mapKey = PRIMARY_ADMIN_FOOTER_BUTTONS[button];
  return installFooterMapKeyVisibleForChrome(chrome, mapKey);
}
