/**
 * Admin Add-ons catalog — demo-loader sections with enabled state and pricing.
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import { listAllDeployModules } from './deployModuleStatus';
import { listDemoLoaderIncludedCards, type DemoLoaderIncludedCard } from './demoLoaderCatalog';
import { FEATURE_BLURBS, isSaleSheetFeature, isServiceFeature, type FeatureId } from './featureCatalog';
import { hasFeature } from './features';
import {
  catalogBlurb,
  catalogLabel,
  catalogRequires,
  catalogRequiresLabels,
  catalogSaleSheet,
  resolvedIsPaidModule,
  resolvedModulePrice,
  sectionsFromCatalog,
} from './moduleCatalogOverlay';
import { formatModulePrice, type ModulePrice } from './moduleStorefront';
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
  visibility: 'public' | 'private' | 'service';
  saleSheet: boolean;
  requires: FeatureId[];
  requiresLabels: string[];
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
    // Public tile is `website` (Agentic Website Editor).
    if (m.feature === 'content_management') continue;

    const price = resolvedModulePrice(m.feature);
    if (isServiceFeature(m.feature) || m.visibility === 'service') continue;
    const isPrivate = m.visibility === 'private';

    if (!owner) {
      if (isPrivate || !resolvedIsPaidModule(m.feature)) continue;
    }

    const enabled = hasFeature(m.feature);
    const entitlement = entitlements.get(m.feature) ?? null;
    const toggleable = owner;
    const purchasable = !owner && !enabled && resolvedIsPaidModule(m.feature);

    modules.push({
      moduleId: moduleId || '',
      feature: m.feature,
      label: catalogLabel(m.feature, m.label),
      blurb: catalogBlurb(m.feature, FEATURE_BLURBS[m.feature] ?? ''),
      status: m.status,
      enabled,
      toggleable,
      purchasable,
      price: price ? { ...price, label: formatModulePrice(price) } : null,
      entitlement,
      visibility: m.visibility,
      saleSheet: catalogSaleSheet(m.feature, isSaleSheetFeature(m.feature)),
      requires: catalogRequires(m.feature),
      requiresLabels: catalogRequiresLabels(m.feature),
    });
  }
  modules.sort(byTitle);

  const sections: AddonsSection[] = sectionsFromCatalog(modules).map((section) => ({
    id: section.id,
    title: section.title,
    modules: section.modules,
  }));

  const included = listDemoLoaderIncludedCards().map((card) => ({
    ...card,
    label: catalogLabel(card.id, card.label),
    blurb: catalogBlurb(card.id, card.blurb),
    saleSheet: catalogSaleSheet(card.id, card.saleSheet),
  }));

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
