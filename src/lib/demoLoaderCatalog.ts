/**
 * Public demo loader catalog — uses deploy-status feed; toggles only when
 * the module is deployed and enabled on production Reave.
 */
import { demoModuleIdForFeature, isDemoBaselineModuleId } from './demoModuleCatalog';
import { listAllDeployModules, type ModuleDeployStatus } from './deployModuleStatus';
import { FEATURE_BLURBS, featureVisibility, isPublicFeature, isSaleSheetFeature } from './featureCatalog';
import { getProductionInstallFeatures, type InstallFeatureId } from './installConfig';
import { CORE_OS_CARDS } from './moduleCatalog';
import { MODULE_DISPLAY_GROUPS } from './moduleDisplayGroups';
import {
  listDemoLoaderFeatures,
  listMarketingFeaturesForModule,
  type DemoLoaderFeature,
} from './marketingFeatures';

export type { DemoLoaderFeature } from './marketingFeatures';
export { listDemoLoaderFeatures } from './marketingFeatures';

export type DemoLoaderModule = {
  moduleId: string;
  feature: InstallFeatureId;
  label: string;
  blurb: string;
  status: ModuleDeployStatus;
  /** Enabled on production Reave (config-reave.json features[]). */
  inProduction: boolean;
  /** Ready to include — deployed and on production Reave. */
  toggleable: boolean;
  /** Named capabilities from the module definition (FEATURE_MARKETING / MARKETING_FEATURES). */
  features: Array<{ id: string; label: string }>;
  /** Storefront visibility — private modules are never listed here. */
  visibility: 'public' | 'private';
  /** Leave-behind on the audit sales sheet. */
  saleSheet: boolean;
};

export type DemoLoaderIncludedCardDef = {
  id: string;
  label: string;
  blurb: string;
};

export type DemoLoaderIncludedCard = DemoLoaderIncludedCardDef & {
  /** Always-on Core OS — ships with every install. */
  baseline: true;
  /** Leave-behind on the audit sales sheet. */
  saleSheet: boolean;
};

export type DemoLoaderSection = {
  id: string;
  /** Section heading; null = no title block (ungrouped modules above named sections). */
  title: string | null;
  modules: DemoLoaderModule[];
};

function byTitle(a: { label: string }, b: { label: string }): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

/**
 * Core OS — always-on platform capabilities shown as marketing cards (not toggles).
 * This is the product baseline (portal / CRM / inbox — not FeatureId 004 billing).
 * Optional add-ons stay in FEATURE_IDS / the picker; these ship with every install.
 * Keep alphabetical by label (UI sorts as a safeguard too).
 */
export const DEMO_LOADER_INCLUDED_CARDS: readonly DemoLoaderIncludedCardDef[] = CORE_OS_CARDS;

/**
 * Named section groups for optional modules in the public demo loader.
 * Features listed here are pulled out of the default list and rendered under the title
 * (in this array order). Remaining optionals sit under “Optional Modules”.
 */
export const DEMO_LOADER_SECTION_GROUPS = MODULE_DISPLAY_GROUPS;

/** Full module list for the public demo loader UI (baseline modules excluded). */
export function listDemoLoaderModules(): DemoLoaderModule[] {
  const productionFeatures = getProductionInstallFeatures();

  return listAllDeployModules()
    .map((m) => {
      const moduleId = demoModuleIdForFeature(m.feature);
      const deployed = m.status === 'deployed';
      const inProduction = productionFeatures.has(m.feature);
      return {
        moduleId,
        feature: m.feature,
        label: m.label,
        blurb: FEATURE_BLURBS[m.feature] ?? '',
        status: m.status,
        inProduction,
        toggleable: deployed && inProduction && Boolean(moduleId),
        features: listMarketingFeaturesForModule(m.feature).map((f) => ({
          id: f.id,
          label: f.label,
        })),
        visibility: featureVisibility(m.feature),
        saleSheet: isSaleSheetFeature(m.feature),
      };
    })
    .filter((m) => isPublicFeature(m.feature))
    .filter((m) => !m.moduleId || !isDemoBaselineModuleId(m.moduleId))
    // `website` is the public Agentic Website Editor; content_management is the same tile.
    .filter((m) => m.feature !== 'content_management')
    .sort(byTitle);
}

/** Culled marketing features (core + module-dependent + nav) for chips / slideshow. */
export function listDemoLoaderMarketingFeatures(): DemoLoaderFeature[] {
  return listDemoLoaderFeatures();
}

export function listDemoLoaderIncludedCards(): DemoLoaderIncludedCard[] {
  return DEMO_LOADER_INCLUDED_CARDS.map((card) => ({
    ...card,
    baseline: true as const,
    saleSheet: true,
  })).sort(byTitle);
}

/**
 * Named groups first (Social, E-commerce, Web Development), then leftover
 * optionals. Tiles within each section are alphabetical by title.
 */
export function listDemoLoaderSections(
  modules: readonly DemoLoaderModule[] = listDemoLoaderModules(),
): DemoLoaderSection[] {
  const byFeature = new Map(modules.map((m) => [m.feature, m]));
  const claimed = new Set<string>();

  const named: DemoLoaderSection[] = DEMO_LOADER_SECTION_GROUPS.map((group) => {
    const sectionModules: DemoLoaderModule[] = [];
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
  const sections: DemoLoaderSection[] = [...named];
  if (ungrouped.length) {
    sections.push({ id: 'optional', title: 'Optional Modules', modules: ungrouped });
  }
  return sections;
}

export function defaultDemoLoaderModuleIds(modules: readonly DemoLoaderModule[]): string[] {
  return modules.filter((m) => m.toggleable && m.moduleId).map((m) => m.moduleId);
}
