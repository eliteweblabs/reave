/**
 * Per-module audience: who may use an enabled module in the admin OS.
 * Owner always has access. Staff only when audience is `staff` or `both`.
 *
 * Defaults live in code; Reave management can override via the module catalog.
 * Satellite installs pull the override map from the Reave hub.
 */

export const MODULE_AUDIENCES = ['owner', 'staff', 'both'] as const;
export type ModuleAudience = (typeof MODULE_AUDIENCES)[number];

/** Features that are owner-only even when visibility is public. */
const OWNER_ONLY_FEATURES = new Set<string>([
  'deploy_wizard',
  'demo',
  'dev_infra',
  'code_dev',
  'namecom_dns',
  'vapi',
  'dealership_wizard',
]);

/** Core catalog cards that are product packaging, not staff day-to-day tools. */
const OWNER_ONLY_CORE = new Set<string>(['passkeys', 'phone_sign_in']);

/** Footer / profile keys staff never get (install management). */
export const STAFF_BLOCKED_NAV = new Set<string>([
  'deploy',
  'modules',
  'catalog',
  'industries',
  'company',
  'settings',
  'addons',
  'vapi',
  'ai-services',
  'team', // invite UI is owner-only; staff reach Profile only
]);

export function isModuleAudience(value: unknown): value is ModuleAudience {
  return value === 'owner' || value === 'staff' || value === 'both';
}

export function normalizeModuleAudience(raw: unknown, fallback: ModuleAudience = 'both'): ModuleAudience {
  if (isModuleAudience(raw)) return raw;
  return fallback;
}

/** Code default when catalog / hub has no explicit audience. */
export function defaultModuleAudience(opts: {
  feature: string;
  visibility?: string;
  kind?: string;
  group?: string;
}): ModuleAudience {
  const feature = String(opts.feature || '').trim();
  if (!feature) return 'both';
  if (opts.visibility === 'private' || opts.visibility === 'service') return 'owner';
  if (opts.group === 'internal') return 'owner';
  if (OWNER_ONLY_FEATURES.has(feature)) return 'owner';
  if (opts.kind === 'core' && OWNER_ONLY_CORE.has(feature)) return 'owner';
  return 'both';
}

/** Staff may use this module when audience is staff or both. */
export function audienceAllowsStaff(audience: ModuleAudience): boolean {
  return audience === 'staff' || audience === 'both';
}
