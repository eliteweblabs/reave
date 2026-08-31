/**
 * Filter install config chrome for staff sessions based on module audience.
 */
import { FEATURE_FOOTER_NAV } from './moduleNavMap';
import type { FeatureId } from './featureCatalog';
import { FEATURE_ID_SET } from './featureCatalog';
import type { FooterNavKey, InstallConfigClient, ProfileMenuKey } from './installConfig';
import { STAFF_BLOCKED_NAV, audienceAllowsStaff, type ModuleAudience } from './moduleAudience';
import { peekModuleAudience } from './moduleAudienceHub';

const STAFF_PROFILE_MENU: ProfileMenuKey[] = ['profile'];

/** Core day-to-day footer keys that are not optional FeatureIds. */
const STAFF_CORE_NAV = new Set<string>([
  '__system__',
  '__chat__',
  'dashboard',
  'todo',
  'punchlist',
  'chats',
  'email',
  'rules',
  'work',
  'schedule',
  'clients',
  'knowledge',
  'media',
  'documents',
  'profile',
]);

function featureAllowsStaff(feature: string, override?: Record<string, ModuleAudience>): boolean {
  const audience = override?.[feature] ?? peekModuleAudience(feature);
  return audienceAllowsStaff(audience);
}

/** Nav keys that require at least one staff-allowed feature (when feature-linked). */
function navKeyAllowedForStaff(
  key: string,
  enabledFeatures: readonly string[],
  override?: Record<string, ModuleAudience>,
): boolean {
  if (STAFF_BLOCKED_NAV.has(key)) return false;
  if (STAFF_CORE_NAV.has(key)) return true;

  const linked: string[] = [];
  for (const feature of enabledFeatures) {
    if (!FEATURE_ID_SET.has(feature)) continue;
    const keys = FEATURE_FOOTER_NAV[feature as FeatureId] ?? [];
    if (keys.includes(key as FooterNavKey)) linked.push(feature);
  }
  if (!linked.length) {
    // Unknown optional tab with no feature mapping — hide from staff.
    return false;
  }
  return linked.some((feature) => featureAllowsStaff(feature, override));
}

export function filterInstallConfigForStaff(
  client: InstallConfigClient,
  audienceOverride?: Record<string, ModuleAudience>,
): InstallConfigClient {
  const features = client.features.filter((id) => featureAllowsStaff(id, audienceOverride));
  const footerNav = client.footerNav.filter((key) =>
    navKeyAllowedForStaff(key, client.features, audienceOverride),
  ) as FooterNavKey[];
  const profileMenu = STAFF_PROFILE_MENU.filter((key) =>
    client.profileMenu.includes(key),
  ) as ProfileMenuKey[];
  const dashboardCards = (client.dashboardCards || []).filter((card) => {
    if (STAFF_BLOCKED_NAV.has(card.mapKey) || STAFF_BLOCKED_NAV.has(card.id)) return false;
    if (card.id === 'modules' || card.mapKey === 'modules') return false;
    if (card.id === 'deploy' || card.mapKey === 'deploy') return false;
    // Feature-backed cards use feature id as card.id when from FEATURE_DASHBOARD
    if (FEATURE_ID_SET.has(card.id)) return featureAllowsStaff(card.id, audienceOverride);
    return STAFF_CORE_NAV.has(card.mapKey) || STAFF_CORE_NAV.has(card.id);
  });

  return {
    ...client,
    features,
    footerNav,
    profileMenu: profileMenu.length ? profileMenu : (['profile'] as ProfileMenuKey[]),
    dashboardCards,
    showDeployWizard: false,
    showIndustries: false,
    showModuleCatalog: false,
    canManageUniversalRules: false,
  };
}
