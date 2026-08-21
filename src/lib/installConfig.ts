/**
 * Per-installation JSON config — footer nav, profile menu, and feature modules.
 *
 * Files: config/config-{slug}.json (project root)
 * Slug: INSTALL_CONFIG env → COMPANY_DOMAIN / PUBLIC_SITE_DOMAIN → "default"
 * Override path: INSTALL_CONFIG_FILE
 *
 * `default` is the unbranded new-install fallback (Clerk login on `/`).
 * Company name/logo still come from admin Company settings (Postgres).
 * Official REΛVE uses config-reave.json and is never a login wall.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isPrivateFeature } from './featureCatalog.ts';
import { parseHomepageTemplate, type HomepageTemplate } from './homepageTemplate.ts';
import { serverEnv } from './serverEnv.ts';

export type { HomepageTemplate };

const FEATURE_IDS_LIST = [
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
] as const;

const FEATURE_SET = new Set<string>(FEATURE_IDS_LIST);

export const PROFILE_MENU_KEYS = [
  'profile',
  'company',
  'settings',
  'socials',
  'addons',
  'industries', // REΛVE-only; stripped from client payload on other installs
  'vapi',
  'lead-scanner',
] as const;
export type ProfileMenuKey = (typeof PROFILE_MENU_KEYS)[number];

export const FOOTER_NAV_SLOT_KEYS = ['__system__', '__chat__'] as const;
export type FooterNavSlotKey = (typeof FOOTER_NAV_SLOT_KEYS)[number];

/** Map tab keys allowed in footerNav (non-slot). Must exist in os-map-data MAPS. */
export const FOOTER_NAV_MAP_KEYS = [
  'dashboard',
  'todo',
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
  'analytics',
  'modules',
  'finance',
  'profile',
  'company',
  'settings',
  'socials',
  'addons',
  'industries',
  'vapi',
  'lead-scanner',
  'fleet',
  'reviews',
  'media',
  'deploy',
] as const;

export type FooterNavMapKey = (typeof FOOTER_NAV_MAP_KEYS)[number];
export type FooterNavKey = FooterNavMapKey | FooterNavSlotKey;

export type InstallFeatureId = (typeof FEATURE_IDS_LIST)[number];

/** Per-module deployment lifecycle — overrides DEPLOY.md defaultStatus. */
export type ModuleDeployStatus =
  | 'deployed'
  | 'development'
  | 'request'
  | 'rejected';

const MODULE_STATUS_SET = new Set<string>([
  'deployed',
  'development',
  'request',
  'rejected',
]);

export type InstallConfig = {
  /** Enabled optional modules for this deployment. */
  features: InstallFeatureId[];
  /** Footer tab bar — map keys plus __system__ / __chat__ slot tokens. */
  footerNav: FooterNavKey[];
  /** Account dropdown settings links. */
  profileMenu: ProfileMenuKey[];
  /** Override homepage Vapi voice widget (else uses env / legacy rules). */
  homepageVoice?: boolean;
  /** Minimal full-screen chat skin at `/focus` (speed-dial FAB, project-first new chats). */
  chatFocusSkin?: boolean;
  /** Public site content key — config/sites/{key}-config.json (default: install slug or reave). */
  siteContentKey?: string;
  /**
   * Homepage chrome for this install (`default` marketing, `landing` client site, `login` Clerk).
   * Ignored on the official REΛVE host / install — reave.app stays the marketing homepage.
   */
  homepageTemplate?: HomepageTemplate;
  /**
   * Dedicated front-end website repo (`owner/repo`) for the Agentic Website Editor.
   * Client installs may only commit here — never eliteweblabs/reave.
   * Override with GITHUB_WEBSITE_REPO.
   */
  websiteRepo?: string;
  /** Per-install module deployment status (see plugin DEPLOY.md playbooks). */
  moduleStatus?: Partial<Record<InstallFeatureId, ModuleDeployStatus>>;
  /**
   * Agency / owner install. Private ops modules (Railway, Kinsta, Cloudflare,
   * local code tools, Name.com DNS) stay enabled. Client installs ignore those
   * flags even if they appear in features[].
   */
  opsInstall?: boolean;
};

export type InstallConfigClient = Pick<
  InstallConfig,
  'features' | 'footerNav' | 'profileMenu' | 'homepageVoice' | 'chatFocusSkin'
> & {
  /** True only on the official REΛVE Railway install — may create/edit universal rules. */
  canManageUniversalRules?: boolean;
  /**
   * Personal contact type + Personal rule-scope chrome.
   * Reave / super-admin install only — other installs hide the label.
   */
  showPersonal?: boolean;
  /** Deploy wizard (`/deploy`) — official REΛVE Railway install only. */
  showDeployWizard?: boolean;
  /** Industries / deploy-playbook editor — official REΛVE Railway install only. */
  showIndustries?: boolean;
  deployStatus?: {
    modules: Array<{ id: InstallFeatureId; label: string; status: ModuleDeployStatus; showBanner: boolean }>;
    hasBanner: boolean;
  };
};

export const PROFILE_MENU_LABELS: Record<ProfileMenuKey, string> = {
  profile: 'Profile',
  company: 'Company',
  settings: 'Settings',
  socials: 'Socials',
  addons: 'Add-ons',
  industries: 'Industries',
  vapi: 'Vapi',
  'lead-scanner': 'Lead Scanner',
};

const PROFILE_MENU_SET = new Set<string>(PROFILE_MENU_KEYS);
const FOOTER_NAV_MAP_SET = new Set<string>(FOOTER_NAV_MAP_KEYS);
const FOOTER_NAV_SLOT_SET = new Set<string>(FOOTER_NAV_SLOT_KEYS);

let _cached: InstallConfig | null = null;

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function trim(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function slugify(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default'
  );
}

function configSlugFromDomain(): string {
  const domain = trim(serverEnv('COMPANY_DOMAIN')) || trim(serverEnv('PUBLIC_SITE_DOMAIN'));
  if (!domain) return 'default';
  const host = domain.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  const parts = host.split('.').filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1]!.length <= 3) {
    return slugify(parts[parts.length - 2] ?? host);
  }
  return slugify(parts[0] ?? host);
}

export function installConfigSlug(): string {
  return slugify(trim(serverEnv('INSTALL_CONFIG')) || configSlugFromDomain());
}

/**
 * Official REΛVE Railway production install (reave.app).
 * Only this install may create or edit universal email catalog rules.
 */
export function isCanonicalReaveInstall(): boolean {
  const install = trim(serverEnv('INSTALL_CONFIG')).toLowerCase();
  if (install === 'demo') return false;
  const demoFlag = trim(serverEnv('DEMO_MODE')).toLowerCase();
  if (demoFlag === '1' || demoFlag === 'true' || demoFlag === 'yes') return false;
  if (installConfigSlug() === 'reave') return true;
  const host = (
    trim(serverEnv('PUBLIC_SITE_DOMAIN')) || trim(serverEnv('COMPANY_DOMAIN'))
  )
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.toLowerCase()
    .replace(/^www\./, '') || '';
  return host === 'reave.app';
}

/** Public hostname for this process is the official marketing site. */
export function isOfficialReavePublicHost(): boolean {
  const host = (
    trim(serverEnv('PUBLIC_SITE_DOMAIN')) || trim(serverEnv('COMPANY_DOMAIN'))
  )
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.toLowerCase()
    .replace(/^www\./, '') || '';
  return host === 'reave.app';
}

/**
 * Owner or agency-resale install. Client installs (Tony, Barber's Edge, …)
 * never load private hosting/ops tools even if a leftover config flag lists them.
 */
export function isOpsInstall(): boolean {
  return isCanonicalReaveInstall() || Boolean(getInstallConfigSync().opsInstall);
}

function configDir(): string {
  return join(projectRoot(), 'config');
}

function configPathForSlug(slug: string): string {
  return join(configDir(), `config-${slug}.json`);
}

function resolveConfigPath(): string | null {
  const override = trim(serverEnv('INSTALL_CONFIG_FILE'));
  if (override && existsSync(override)) return override;

  const slug = installConfigSlug();
  const slugPath = configPathForSlug(slug);
  if (existsSync(slugPath)) return slugPath;

  const defaultPath = configPathForSlug('default');
  if (existsSync(defaultPath)) return defaultPath;

  return null;
}

function normalizeFeatures(raw: unknown): InstallFeatureId[] {
  if (!Array.isArray(raw)) return [];
  const out: InstallFeatureId[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (FEATURE_SET.has(id)) out.push(id as InstallFeatureId);
  }
  return out;
}

function normalizeProfileMenu(raw: unknown): ProfileMenuKey[] {
  if (!Array.isArray(raw)) return [...PROFILE_MENU_KEYS];
  const out: ProfileMenuKey[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const key = item.trim();
    if (PROFILE_MENU_SET.has(key) && !out.includes(key as ProfileMenuKey)) {
      out.push(key as ProfileMenuKey);
    }
  }
  return out.length ? out : [...PROFILE_MENU_KEYS];
}

function normalizeFooterNav(raw: unknown): FooterNavKey[] {
  if (!Array.isArray(raw)) return defaultFooterNav();
  const out: FooterNavKey[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    // Legacy installs used "home" for the admin dashboard tab.
    const key = item.trim() === 'home' ? 'dashboard' : item.trim();
    if (FOOTER_NAV_SLOT_SET.has(key) || FOOTER_NAV_MAP_SET.has(key)) {
      if (!out.includes(key as FooterNavKey)) out.push(key as FooterNavKey);
    }
  }
  return out.length ? out : defaultFooterNav();
}

/** Matches pre-config defaultTabKeys() order (all MAPS minus system/tooling). */
export function defaultFooterNav(): FooterNavKey[] {
  return [
    '__system__',
    'dashboard',
    'todo',
    'documents',
    'knowledge',
    'chats',
    'email',
    'rules',
    'work',
    'schedule',
    'clients',
    'analytics',
    'profile',
    'company',
    'settings',
    'socials',
    'finance',
  ];
}

function defaultProfileMenu(): ProfileMenuKey[] {
  return [...PROFILE_MENU_KEYS];
}

function normalizeModuleStatus(raw: unknown): Partial<Record<InstallFeatureId, ModuleDeployStatus>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<InstallFeatureId, ModuleDeployStatus>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!FEATURE_SET.has(key)) continue;
    if (typeof value !== 'string') continue;
    const status = value.trim().toLowerCase();
    const normalized =
      status === 'pending' ? 'development' : status === 'requested' ? 'request' : status;
    if (MODULE_STATUS_SET.has(normalized)) {
      out[key as InstallFeatureId] = normalized as ModuleDeployStatus;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parseInstallConfig(raw: unknown): InstallConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    features: normalizeFeatures(o.features),
    footerNav: normalizeFooterNav(o.footerNav),
    profileMenu: normalizeProfileMenu(o.profileMenu),
    homepageVoice: typeof o.homepageVoice === 'boolean' ? o.homepageVoice : undefined,
    chatFocusSkin: typeof o.chatFocusSkin === 'boolean' ? o.chatFocusSkin : undefined,
    siteContentKey: typeof o.siteContentKey === 'string' && o.siteContentKey.trim() ? o.siteContentKey.trim().toLowerCase() : undefined,
    homepageTemplate: parseHomepageTemplate(o.homepageTemplate),
    websiteRepo: typeof o.websiteRepo === 'string' && o.websiteRepo.trim() ? o.websiteRepo.trim() : undefined,
    moduleStatus: normalizeModuleStatus(o.moduleStatus),
    opsInstall: o.opsInstall === true ? true : undefined,
  };
}

/** Drop Railway / Kinsta / Cloudflare / shell tools on client installs. */
function applyClientOpsGate(config: InstallConfig): InstallConfig {
  if (config.opsInstall || isCanonicalReaveInstall()) return config;
  const features = config.features.filter((id) => !isPrivateFeature(id));
  if (features.length === config.features.length && !config.moduleStatus) return config;
  const moduleStatus = config.moduleStatus
    ? (Object.fromEntries(
        Object.entries(config.moduleStatus).filter(([id]) => !isPrivateFeature(id)),
      ) as InstallConfig['moduleStatus'])
    : undefined;
  return { ...config, features, moduleStatus };
}

function readInstallConfigFile(): InstallConfig | null {
  const path = resolveConfigPath();
  if (!path) return null;
  try {
    return parseInstallConfig(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    console.error('[install-config] failed to read', path, e);
    return null;
  }
}

function fallbackInstallConfig(): InstallConfig {
  return {
    features: [],
    footerNav: defaultFooterNav(),
    profileMenu: defaultProfileMenu(),
  };
}

/** Resolved install config (cached for process lifetime). */
export function getInstallConfigSync(): InstallConfig {
  if (_cached) return _cached;
  _cached = applyClientOpsGate(readInstallConfigFile() ?? fallbackInstallConfig());
  return _cached;
}

export async function getInstallConfig(): Promise<InstallConfig> {
  return getInstallConfigSync();
}

function clientFooterNav(config: InstallConfig): FooterNavKey[] {
  let nav = config.footerNav;
  if (!config.features.includes('fleet_tracking')) {
    nav = nav.filter((key) => key !== 'fleet');
  }
  if (!config.features.includes('deploy_wizard')) {
    nav = nav.filter((key) => key !== 'deploy');
  }
  if (!config.features.includes('site_audits')) {
    nav = nav.filter((key) => key !== 'sales-sheet');
  }
  if (!config.features.includes('social_inbox')) {
    nav = nav.filter((key) => key !== 'social');
  }
  if (!config.features.includes('online_reviews')) {
    nav = nav.filter((key) => key !== 'reviews');
  }
  if (!isCanonicalReaveInstall()) {
    nav = nav.filter((key) => key !== 'industries');
  }
  return nav;
}

function clientProfileMenu(config: InstallConfig): ProfileMenuKey[] {
  let menu = config.profileMenu;
  if (!isCanonicalReaveInstall()) {
    menu = menu.filter((key) => key !== 'industries');
  }
  return menu;
}

export function getInstallConfigClient(): InstallConfigClient {
  const config = getInstallConfigSync();
  return {
    features: config.features,
    footerNav: clientFooterNav(config),
    profileMenu: clientProfileMenu(config),
    homepageVoice: config.homepageVoice,
    chatFocusSkin: config.chatFocusSkin,
    canManageUniversalRules: isCanonicalReaveInstall(),
    showPersonal: isCanonicalReaveInstall(),
    showDeployWizard: config.features.includes('deploy_wizard'),
    showIndustries: isCanonicalReaveInstall(),
  };
}

export function installConfigPath(): string | null {
  return resolveConfigPath();
}

export function clearInstallConfigCache(): void {
  _cached = null;
}

let _productionFeatures: ReadonlySet<InstallFeatureId> | null = null;
let _productionConfig: InstallConfig | null | undefined;

/** Parsed config-reave.json — production Reave install. */
export function getProductionInstallConfig(): InstallConfig | null {
  if (_productionConfig !== undefined) return _productionConfig;
  const path = configPathForSlug('reave');
  if (existsSync(path)) {
    try {
      _productionConfig = parseInstallConfig(JSON.parse(readFileSync(path, 'utf8')));
      return _productionConfig;
    } catch {
      /* fall through */
    }
  }
  _productionConfig = null;
  return null;
}

/** Optional modules enabled on the production Reave install (config-reave.json). */
export function getProductionInstallFeatures(): ReadonlySet<InstallFeatureId> {
  if (_productionFeatures) return _productionFeatures;
  const config = getProductionInstallConfig();
  _productionFeatures = new Set(config?.features.filter((f) => f !== 'demo') ?? []);
  return _productionFeatures;
}
