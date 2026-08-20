/**
 * Named groups for module catalogs (admin → Modules and public /modules).
 * Features not listed here stay under “Optional Modules” / “Other modules”.
 */
import type { FeatureId } from './featureCatalog.ts';

export type ModuleDisplayGroupId = 'social' | 'e-commerce' | 'web-development';

export type ModuleDisplayGroup = {
  id: ModuleDisplayGroupId;
  title: string;
  features: readonly FeatureId[];
};

export const MODULE_DISPLAY_GROUPS: readonly ModuleDisplayGroup[] = [
  {
    id: 'social',
    title: 'Social',
    features: ['social_inbox', 'online_reviews'],
  },
  {
    id: 'e-commerce',
    title: 'E-commerce',
    features: [
      'inventory_sync',
      'dealership_wizard',
      'event_ticketing',
      'materials_pricing',
      'credit_check',
    ],
  },
  {
    id: 'web-development',
    title: 'Web Development Modules',
    features: [
      'site_audits',
      'website',
      'content_management',
      'code_dev',
      'namecom_dns',
      'site_monitoring',
      'uptime_monitoring',
      'wayback_machine',
      'seo_directory',
    ],
  },
];

const FEATURE_TO_GROUP = new Map<FeatureId, ModuleDisplayGroup>();
for (const group of MODULE_DISPLAY_GROUPS) {
  for (const feature of group.features) {
    FEATURE_TO_GROUP.set(feature, group);
  }
}

export function moduleDisplayGroupFor(
  feature: string,
): Pick<ModuleDisplayGroup, 'id' | 'title'> | null {
  const group = FEATURE_TO_GROUP.get(feature as FeatureId);
  return group ? { id: group.id, title: group.title } : null;
}

export function moduleDisplayGroupId(feature: string): ModuleDisplayGroupId | null {
  return FEATURE_TO_GROUP.get(feature as FeatureId)?.id ?? null;
}

export function featuresInDisplayGroup(id: ModuleDisplayGroupId): readonly FeatureId[] {
  return MODULE_DISPLAY_GROUPS.find((g) => g.id === id)?.features ?? [];
}
