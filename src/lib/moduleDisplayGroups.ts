/**
 * Named groups for module catalogs (admin → Modules and public /modules).
 * Features not listed here stay under “Optional Modules” / “Other modules”.
 */
import type { FeatureId } from './featureCatalog.ts';

export type ModuleDisplayGroupId =
  | 'social'
  | 'e_commerce'
  | 'web_development'
  | 'work'
  | 'google_workspace';

export type ModuleDisplayGroup = {
  id: ModuleDisplayGroupId;
  title: string;
  features: readonly FeatureId[];
};

export const MODULE_DISPLAY_GROUPS: readonly ModuleDisplayGroup[] = [
  {
    id: 'work',
    title: 'Work',
    features: ['billing', 'documents', 'scheduling', 'time_tracking', 'email_marketing'],
  },
  {
    id: 'google_workspace',
    title: 'Google™ Workspace',
    features: ['google_workspace'],
  },
  {
    id: 'social',
    title: 'Social',
    features: ['social_inbox', 'online_reviews'],
  },
  {
    id: 'e_commerce',
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
    id: 'web_development',
    title: 'Web Development Modules',
    features: [
      'site_audits',
      'website',
      'wordpress_content',
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
