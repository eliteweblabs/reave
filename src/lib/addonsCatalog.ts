/**
 * Admin Add-ons catalog — demo-loader sections with enabled state and pricing.
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import { listAllDeployModules } from './deployModuleStatus';
import {
  DEMO_LOADER_SECTION_GROUPS,
  listDemoLoaderIncludedCards,
  type DemoLoaderIncludedCard,
} from './demoLoaderCatalog';
import { FEATURE_BLURBS, isSaleSheetFeature, type FeatureId } from './featureCatalog';
import { hasFeature } from './features';
import {
  formatModulePrice,
  isPaidModule,
  modulePrice,
  type ModulePrice,
} from './moduleStorefront';
import type { ModuleEntitlement } from './moduleEntitlements';

export type AddonsModule = {
  moduleId: string;
  feature: FeatureId;
  label: string;
  blurb: string;
  status: string;
  enabled: boolean;
  /** Owner can flip runtime override. */
  toggleable: boolean;
  /** Client can request purchase when off and priced. */
  purchasable: boolean;
  price: (ModulePrice & { label: string }) | null;
  entitlement: ModuleEntitlement | null;
  visibility: 'public' | 'private';
  saleSheet: boolean;
};

export type AddonsSection = {
  id: string;
  title: string | null;
  modules: AddonsModule[];
};

export type AddonsCatalog = {
  included: DemoLoaderIncludedCard[];
  sections: AddonsSection[];
  modules: AddonsModule[];
  summary: {
    enabled: number;
    available: number;
    total: number;
  };
};

function byTitle(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

export function buildAddonsCatalog(opts: {
  owner: boolean;
  entitlements: Map<string, ModuleEntitlement>;
}): AddonsCatalog {
  const { owner, entitlements } = opts;

  const modules: AddonsModule[] = [];
  for (const m of listAllDeployModules()) {
    const moduleId = demoModuleIdForFeature(m.feature);
    if (moduleId && isDemoBaselineModuleId(moduleId)) continue;

    const price = modulePrice(m.feature);
    const isPrivate = m.visibility === 'private';

    if (!owner) {
      if (isPrivate || !isPaidModule(m.feature)) continue;
    }

    const enabled = hasFeature(m.feature);
    const entitlement = entitlements.get(m.feature) ?? null;
    const toggleable = owner;
    const purchasable = !owner && !enabled && isPaidModule(m.feature);

    modules.push({
      moduleId: moduleId || '',
      feature: m.feature,
      label: m.label,
      blurb: FEATURE_BLURBS[m.feature] ?? '',
      status: m.status,
      enabled,
      toggleable,
      purchasable,
      price: price ? { ...price, label: formatModulePrice(price) } : null,
      entitlement,
      visibility: m.visibility,
      saleSheet: isSaleSheetFeature(m.feature),
    });
  }
  modules.sort(byTitle);

  const byFeature = new Map(modules.map((m) => [m.feature, m]));
  const claimed = new Set<string>();

  const named = DEMO_LOADER_SECTION_GROUPS.map((group) => {
    const sectionModules: AddonsModule[] = [];
    for (const feature of group.features) {
      const mod = byFeature.get(feature);
      if (!mod) continue;
      claimed.add(feature);
      sectionModules.push(mod);
    }
    sectionModules.sort(byTitle);
    return { id: group.id, title: group.title, modules: sectionModules };
  }).filter((s) => s.modules.length > 0);

  const ungrouped = modules.filter((m) => !claimed.has(m.feature)).sort(byTitle);
  const sections: AddonsSection[] = [];
  if (ungrouped.length) {
    sections.push({ id: 'optional', title: 'Optional add-ons', modules: ungrouped });
  }
  for (const section of named) {
    sections.push(section);
  }

  const included = listDemoLoaderIncludedCards();

  return {
    included,
    sections,
    modules,
    summary: {
      total: modules.length,
      enabled: modules.filter((m) => m.enabled).length,
      available: modules.filter((m) => !m.enabled).length,
    },
  };
}
