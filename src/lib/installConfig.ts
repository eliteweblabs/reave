/**
 * Per-installation JSON config — footer nav, profile menu, and feature modules.
 *
 * Files: config/config-{slug}.json (project root)
 * Slug: INSTALL_CONFIG env → COMPANY_DOMAIN / PUBLIC_SITE_DOMAIN → "default"
 * Override path: INSTALL_CONFIG_FILE
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { serverEnv } from './serverEnv.ts';

const FEATURE_IDS_LIST = [
  'client_portal',
  'web_handoff',
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
] as const;

export type InstallFeatureId = (typeof FEATURE_IDS_LIST)[number];

const FEATURE_SET = new Set<string>(FEATURE_IDS_LIST);

export const PROFILE_MENU_KEYS = ['profile', 'company', 'socials', 'industries', 'vapi'] as const;
export type ProfileMenuKey = (typeof PROFILE_MENU_KEYS)[number];

export const FOOTER_NAV_SLOT_KEYS = ['__system__', '__chat__'] as const;
export type FooterNavSlotKey = (typeof FOOTER_NAV_SLOT_KEYS)[number];

/** Map tab keys allowed in footerNav (non-slot). Must exist in os-map-data MAPS. */
export const FOOTER_NAV_MAP_KEYS = [
  'home',
  'todo',
  'documents',
  'knowledge',
  'chats',
  'email',
  'rules',
  'work',
  'schedule',
  'clients',
  'finance',
  'profile',
  'company',
  'socials',
  'industries',
  'vapi',
] as const;

export type FooterNavMapKey = (typeof FOOTER_NAV_MAP_KEYS)[number];
export type FooterNavKey = FooterNavMapKey | FooterNavSlotKey;

export type InstallConfig = {
  /** Enabled optional modules for this deployment. */
  features: InstallFeatureId[];
  /** Footer tab bar — map keys plus __system__ / __chat__ slot tokens. */
  footerNav: FooterNavKey[];
  /** Account dropdown settings links. */
  profileMenu: ProfileMenuKey[];
  /** Override homepage Vapi voice widget (else uses env / legacy rules). */
  homepageVoice?: boolean;
};

export type InstallConfigClient = Pick<InstallConfig, 'footerNav' | 'profileMenu' | 'homepageVoice'>;

export const PROFILE_MENU_LABELS: Record<ProfileMenuKey, string> = {
  profile: 'Profile',
  company: 'Company',
  socials: 'Socials',
  industries: 'Industries',
  vapi: 'Vapi',
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
    const key = item.trim();
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
    'home',
    'todo',
    'documents',
    'knowledge',
    'chats',
    'email',
    'rules',
    'work',
    'schedule',
    'clients',
    'profile',
    'company',
    'socials',
    'industries',
    'vapi',
    'finance',
  ];
}

function defaultProfileMenu(): ProfileMenuKey[] {
  return [...PROFILE_MENU_KEYS];
}

function parseInstallConfig(raw: unknown): InstallConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    features: normalizeFeatures(o.features),
    footerNav: normalizeFooterNav(o.footerNav),
    profileMenu: normalizeProfileMenu(o.profileMenu),
    homepageVoice: typeof o.homepageVoice === 'boolean' ? o.homepageVoice : undefined,
  };
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
  _cached = readInstallConfigFile() ?? fallbackInstallConfig();
  return _cached;
}

export async function getInstallConfig(): Promise<InstallConfig> {
  return getInstallConfigSync();
}

export function getInstallConfigClient(): InstallConfigClient {
  const config = getInstallConfigSync();
  return {
    footerNav: config.footerNav,
    profileMenu: config.profileMenu,
    homepageVoice: config.homepageVoice,
  };
}

export function installConfigPath(): string | null {
  return resolveConfigPath();
}

export function clearInstallConfigCache(): void {
  _cached = null;
}
